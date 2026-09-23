/*
 * Purge pre-flight verifier — re-checks previewed messages against live
 * Discord state before any delete runs.
 *
 * Why this exists: the preview list is a point-in-time snapshot. If the user
 * clicks Delete after a run already finished (or after messages were removed
 * elsewhere), blindly re-issuing DELETEs would hammer already-gone messages
 * and report nonsense counts. verifyPreviews() GETs every previewed message
 * first and splits the list into:
 *   - alive:     still present, safe to delete
 *   - gone:      404 / unknown-message, counted as skipped up front
 *   - noAccess:  403, counted as skipped up front
 * Any other failure aborts loudly so a broken token/permissions problem can
 * never masquerade as a successful run.
 *
 * Knobs (VerifyOptions):
 *   - concurrency (default 3): parallel GETs. Higher is faster but burns
 *     rate-limit budget the delete loop also needs. 3 mirrors the fetcher.
 *   - shouldStop (default never): polled between batches; aborts the
 *     verification early and returns what is classified so far.
 *   - onProgress (default none): called as (checked, total) after each batch.
 *
 * Run (typecheck + full client build):
 *   ./node_modules/.bin/tsc --noEmit
 *   pnpm build
 */

import { RestAPI } from "@webpack/common";

import type { PurgePreview } from "./engine";

export interface VerifyOptions {
    /** Parallel existence checks. Default 3. Must be >= 1. */
    concurrency?: number;
    /** Polled between batches; return true to abort early. */
    shouldStop?: () => boolean;
    /** Progress callback (checked, total). */
    onProgress?: (checked: number, total: number) => void;
}

export interface VerifyResult {
    /** Messages confirmed present, in original order. */
    alive: PurgePreview[];
    /** IDs confirmed gone (404 / unknown message). */
    gone: string[];
    /** IDs with no access (403). */
    noAccess: string[];
    /** True when aborted early via shouldStop (partial results). */
    aborted: boolean;
}

function isGoneError(e: any): boolean {
    if ((e as any)?.status === 404) return true;
    const text = String((e as any)?.body?.message ?? (e as any)?.message ?? e ?? "");
    return /10008|unknown message/i.test(text);
}

function isNoAccessError(e: any): boolean {
    if ((e as any)?.status === 403) return true;
    const text = String((e as any)?.body?.message ?? (e as any)?.message ?? e ?? "");
    return /missing access|missing permissions|no access|50001|50013/i.test(text);
}

async function checkOne(preview: PurgePreview): Promise<"alive" | "gone" | "noAccess"> {
    try {
        const res = await RestAPI.get({ url: `/channels/${preview.channelId}/messages/${preview.id}` });
        const body: any = (res as any)?.body ?? res;
        // The message exists. If the slot now holds someone else's message
        // (paranoia: id reuse is not a thing, but cheap to confirm), only
        // treat it as ours when the author matches or the body is silent.
        if (body && typeof body === "object" && body.author && typeof body.author.id === "string") {
            return body.author.id === (preview as any).authorId || (preview as any).authorId === undefined
                ? "alive"
                : "gone";
        }
        return "alive";
    } catch (e) {
        if (isGoneError(e)) return "gone";
        if (isNoAccessError(e)) return "noAccess";
        throw e;
    }
}

export async function verifyPreviews(
    previews: PurgePreview[],
    opts: VerifyOptions = {}
): Promise<VerifyResult> {
    const concurrency = Math.max(1, Math.floor(opts.concurrency ?? 3));
    const shouldStop = opts.shouldStop ?? (() => false);
    const onProgress = opts.onProgress ?? (() => {});

    const alive: PurgePreview[] = [];
    const gone: string[] = [];
    const noAccess: string[] = [];
    let checked = 0;
    let aborted = false;
    let index = 0;

    async function worker(): Promise<void> {
        while (index < previews.length) {
            if (shouldStop()) {
                aborted = true;
                return;
            }
            const current = index;
            index += 1;
            const preview = previews[current];
            const verdict = await checkOne(preview);
            if (verdict === "alive") alive.push(preview);
            else if (verdict === "gone") gone.push(preview.id);
            else noAccess.push(preview.id);
            checked += 1;
            try {
                onProgress(checked, previews.length);
            } catch { /* progress callbacks must never break verification */ }
        }
    }

    // Run workers concurrently; a worker-thrown (non 404/403) error aborts all.
    const workers: Promise<void>[] = [];
    for (let i = 0; i < Math.min(concurrency, Math.max(previews.length, 1)); i++) {
        workers.push(worker());
    }
    await Promise.all(workers);

    // Restore original preview order for the survivors.
    const order = new Map(previews.map((p, i) => [p.id, i] as [string, number]));
    alive.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

    return { alive, gone, noAccess, aborted };
}
