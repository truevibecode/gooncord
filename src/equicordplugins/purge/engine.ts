/*
 * Purge engine — in-client port of PurgeCord's cleanup core, minus tokens.
 * Auth comes from the running client (RestAPI). Own messages only.
 *
 * Search: author_id paginated search (same routes PurgeCord uses), offset
 * pages, total_results honored, stop-aware. Deletion: sequential
 * RestAPI.del with delay + jitter, 429 sleep-and-resume, per-message
 * skip classes (gone / no access / system). Progress is module-level so
 * runs survive navigation and modal closes.
 */

import { Logger } from "@utils/Logger";
import { RestAPI } from "@webpack/common";

import { settings } from "./settings";
import { verifyPreviews } from "./verify";

const logger = new Logger("Purge");

export interface PurgeFilter {
    channelId: string;
    guildId?: string;
    fromIso?: string;
    toIso?: string;
    linksOnly?: boolean;
    keyword?: string;
    limit?: number;
    targetName?: string;
}

export interface PurgePreview {
    id: string;
    channelId: string;
    content: string;
    timestamp: string;
    hasLink: boolean;
}

/** One freshly deleted message, as shown in the live console feed. */
export interface DeletedEntry {
    id: string;
    content: string;
    timestamp: string;
}

export type PurgeStatus = "idle" | "fetching" | "ready" | "deleting" | "done" | "stopped" | "error";

export interface PurgeProgress {
    status: PurgeStatus;
    total: number;
    deleted: number;
    skipped: number;
    speedPerMinute: number;
    message: string;
    targetName?: string;
    startedAt?: string;
    estimatedCompletion?: string;
    previews: PurgePreview[];
    /** Rolling console lines, newest last (capped). */
    log: string[];
    /** Recently deleted messages for the live feed, newest last (capped). */
    deletedLog: DeletedEntry[];
}

type Listener = (p: PurgeProgress) => void;

const listeners = new Set<Listener>();

let progress: PurgeProgress = {
    status: "idle",
    total: 0,
    deleted: 0,
    skipped: 0,
    speedPerMinute: 0,
    message: "Nothing running.",
    previews: [],
    log: [],
    deletedLog: []
};

let stopRequested = false;

export function getProgress(): PurgeProgress {
    return progress;
}

export function subscribeProgress(fn: Listener): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
}

function emit(next: Partial<PurgeProgress>) {
    progress = { ...progress, ...next };
    for (const fn of [...listeners]) {
        try {
            fn(progress);
        } catch (e) {
            logger.warn("progress listener failed", e);
        }
    }
}

/** Append a timestamped line to the live console (capped at 80). */
function pushLog(message: string) {
    const t = new Date().toLocaleTimeString();
    emit({ log: [...progress.log.slice(-79), `[${t}] ${message}`] });
}

export function requestStop() {
    stopRequested = true;
}

function resetStop() {
    stopRequested = false;
}

const sleep = (ms: number) => new Promise<void>(res => setTimeout(res, ms));

function hasLink(content: string) {
    return /https?:\/\/|\bwww\./i.test(content);
}

function matchesFilter(m: PurgePreview, filter: PurgeFilter): boolean {
    const ts = new Date(m.timestamp).getTime();
    if (filter.fromIso && ts < new Date(filter.fromIso).getTime()) return false;
    if (filter.toIso && ts > new Date(filter.toIso).getTime()) return false;
    if (filter.linksOnly && !m.hasLink) return false;
    if (filter.keyword && !m.content.toLowerCase().includes(filter.keyword.toLowerCase())) return false;
    return true;
}

type SearchGroup = Array<{
    id: string;
    channel_id: string;
    content: string;
    timestamp: string;
    hit?: boolean;
    author: { id: string; };
}>;

interface SearchResponse {
    total_results?: number;
    messages?: SearchGroup[];
}

function searchRoute(filter: PurgeFilter, accountId: string, offset: number): { url: string; query: Record<string, string | number>; } {
    const query: Record<string, string | number> = {
        author_id: accountId,
        offset,
        sort_by: "timestamp",
        sort_order: "desc"
    };
    if (filter.guildId) {
        query.channel_id = filter.channelId;
        return { url: `/guilds/${filter.guildId}/messages/search`, query };
    }
    return { url: `/channels/${filter.channelId}/messages/search`, query };
}

function isNoAccess(err: any): boolean {
    if (err?.status === 403) return true;
    const text = String(err?.body?.message ?? err?.message ?? err ?? "");
    return /missing access|missing permissions|no access|50001|50013/i.test(text);
}

function isGone(err: any): boolean {
    if (err?.status === 404) return true;
    const text = String(err?.body?.message ?? err?.message ?? err ?? "");
    return /10008|unknown message/i.test(text);
}

async function throwIfRateLimited(err: any, context: string): Promise<never> {
    const retryAfter = Number(err?.body?.retry_after ?? err?.retry_after ?? NaN);
    if (err?.status === 429 || Number.isFinite(retryAfter)) {
        const wait = (Number.isFinite(retryAfter) ? retryAfter : 1) * 1000 + 500;
        emit({ message: `${context}: rate limited, waiting ${Math.ceil(wait / 1000)}s...` });
        await sleep(wait);
        throw { rateLimited: true } as any;
    }
    throw err;
}

/** Fetch the current user's messages matching the filter. Emits fetching progress. */
export async function fetchPreviews(accountId: string, filter: PurgeFilter): Promise<PurgePreview[]> {
    resetStop();
    const targetName = filter.targetName ?? filter.channelId;
    const found: PurgePreview[] = [];
    const seen = new Set<string>();
    const oldest = filter.fromIso ? new Date(filter.fromIso).getTime() : 0;
    const limit = filter.limit && filter.limit > 0 ? filter.limit : Infinity;
    let offset = 0;
    let complete = false;

    emit({
        status: "fetching",
        total: 0,
        deleted: 0,
        skipped: 0,
        speedPerMinute: 0,
        message: `Searching your messages in ${targetName}...`,
        targetName,
        previews: [],
        deletedLog: []
    });
    pushLog(`Search started in ${targetName}.`);

    while (!complete) {
        if (stopRequested) {
            emit({ status: "stopped", message: "Search stopped.", previews: found });
            pushLog("Search stopped by user.");
            return found;
        }

        const { url, query } = searchRoute(filter, accountId, offset);
        let res: SearchResponse;
        try {
            const r = await RestAPI.get({ url, query });
            res = r.body as SearchResponse;
        } catch (e) {
            try {
                await throwIfRateLimited(e, "Search");
            } catch (rl: any) {
                if (rl?.rateLimited) continue;
                throw rl;
            }
            // unreachable, but tsc needs it
            throw e;
        }

        const groups = res.messages ?? [];
        if (!groups.length) break;

        let hitOldest = false;
        for (const group of groups) {
            const explicit = group.filter(m => m.hit === true);
            for (const item of explicit.length ? explicit : group) {
                if (item.author.id !== accountId || seen.has(item.id)) continue;
                seen.add(item.id);
                if (new Date(item.timestamp).getTime() < oldest) {
                    hitOldest = true;
                    continue;
                }
                const preview: PurgePreview = {
                    id: item.id,
                    channelId: item.channel_id,
                    content: item.content ?? "",
                    timestamp: item.timestamp,
                    hasLink: hasLink(item.content ?? "")
                };
                if (matchesFilter(preview, filter)) {
                    found.push(preview);
                    if (found.length >= limit) break;
                }
            }
            if (found.length >= limit) break;
        }

        emit({
            status: "fetching",
            total: found.length,
            message: `Found ${found.length} matching message${found.length === 1 ? "" : "s"} so far...`,
            targetName,
            previews: []
        });
        pushLog(`Found ${found.length} matching so far...`);

        if (found.length >= limit) break;
        const totalResults = res.total_results;
        offset += groups.length;
        complete = hitOldest || (totalResults !== undefined && offset >= totalResults) || groups.length === 0;
    }

    found.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    const readyMessage = found.length ? `${found.length} message${found.length === 1 ? "" : "s"} match. Review, then delete.` : "No matching messages found.";
    emit({
        status: "ready",
        total: found.length,
        message: readyMessage,
        targetName,
        previews: found
    });
    pushLog(readyMessage);
    return found;
}

/** Delete previously fetched previews. Re-verifies every preview against live
 * Discord state first, so a stale list (e.g. Delete clicked after a finished
 * run) can never re-delete already-gone messages. Terminal states clear the
 * preview list, forcing a fresh Preview before the next run. */
export async function runDeletion(accountId: string, filter: PurgeFilter, previews: PurgePreview[]): Promise<void> {
    resetStop();
    const targetName = filter.targetName ?? filter.channelId;
    const startedAt = Date.now();
    let deleted = 0;
    let skipped = 0;

    const speed = () => Math.round(deleted / Math.max((Date.now() - startedAt) / 60000, 1 / 60));
    const eta = (total: number) => {
        if (!deleted) return undefined;
        const remaining = Math.max(0, total - deleted - skipped);
        return new Date(Date.now() + ((Date.now() - startedAt) / deleted) * remaining).toISOString();
    };

    emit({
        status: "fetching",
        total: previews.length,
        deleted: 0,
        skipped: 0,
        speedPerMinute: 0,
        message: `Verifying ${previews.length} previewed message(s) still exist...`,
        targetName,
        startedAt: new Date(startedAt).toISOString(),
        previews,
        deletedLog: []
    });
    pushLog(`Verifying ${previews.length} previewed message(s)...`);

    let verified: PurgePreview[];
    try {
        const result = await verifyPreviews(previews, {
            shouldStop: () => stopRequested,
            onProgress: (checked, total) => {
                emit({ message: `Verifying ${checked}/${total}...` });
            }
        });
        if (result.aborted) {
            emit({ status: "stopped", deleted: 0, skipped: 0, speedPerMinute: 0, message: "Stopped during verification.", previews: [] });
            pushLog("Verification stopped by user.");
            return;
        }
        skipped = result.gone.length + result.noAccess.length;
        if (skipped > 0) {
            pushLog(`${skipped} previewed message(s) already gone or inaccessible — skipping up front.`);
        }
        verified = result.alive;
    } catch (e) {
        const msg = `Verification failed: ${String((e as any)?.body?.message ?? (e as any)?.message ?? e).slice(0, 200)}`;
        emit({ status: "error", deleted: 0, skipped: 0, speedPerMinute: 0, message: msg, previews: [] });
        pushLog(msg);
        return;
    }

    if (!verified.length) {
        const msg = skipped
            ? `Done. Nothing to delete — all ${skipped} already gone.`
            : "Done. Nothing to delete.";
        emit({ status: "done", deleted: 0, skipped, speedPerMinute: 0, message: msg, previews: [] });
        pushLog(msg);
        return;
    }
    previews = verified;

    emit({
        status: "deleting",
        total: previews.length,
        deleted: 0,
        skipped,
        speedPerMinute: 0,
        message: "Deletion in progress...",
        targetName,
        startedAt: new Date(startedAt).toISOString(),
        previews,
        deletedLog: []
    });
    pushLog(`Deleting ${previews.length} messages in ${targetName}...`);

    for (const message of previews) {
        if (stopRequested) {
            emit({ status: "stopped", deleted, skipped, speedPerMinute: speed(), message: `Stopped with ${deleted} deleted, ${skipped} skipped.`, previews: [] });
            pushLog(`Stopped with ${deleted} deleted, ${skipped} skipped.`);
            return;
        }

        // Up to 5 consecutive rate-limit waits per message, then give up.
        let rateWaits = 0;
        for (;;) {
            try {
                await RestAPI.del({ url: `/channels/${message.channelId}/messages/${message.id}` });
                break;
            } catch (e) {
                if (isGone(e) || isNoAccess(e)) {
                    skipped += 1;
                    const reason = isNoAccess(e) ? "no access" : "already deleted";
                    emit({
                        status: "deleting",
                        deleted,
                        skipped,
                        speedPerMinute: speed(),
                        estimatedCompletion: eta(previews.length),
                        message: isNoAccess(e) ? "Skipped a message with no access." : "Skipped an already-deleted message."
                    });
                    pushLog(`Skipped ${message.id} (${reason}).`);
                    break;
                }
                const retryAfter = Number((e as any)?.body?.retry_after ?? (e as any)?.retry_after ?? NaN);
                if (((e as any)?.status === 429 || Number.isFinite(retryAfter)) && rateWaits < 5) {
                    rateWaits += 1;
                    const wait = (Number.isFinite(retryAfter) ? retryAfter : 1) * 1000 + 500;
                    emit({ status: "deleting", deleted, skipped, speedPerMinute: speed(), estimatedCompletion: eta(previews.length), message: `Rate limited, waiting ${Math.ceil(wait / 1000)}s...` });
                    pushLog(`Rate limited, waiting ${Math.ceil(wait / 1000)}s...`);
                    await sleep(wait);
                    continue;
                }
                const fatalMessage = `Stopped on error: ${String((e as any)?.body?.message ?? (e as any)?.message ?? e).slice(0, 200)}`;
                emit({ status: "error", deleted, skipped, speedPerMinute: speed(), message: fatalMessage, previews: [] });
                pushLog(fatalMessage);
                return;
            }
        }

        deleted += 1;
        const entry: DeletedEntry = {
            id: message.id,
            content: message.content.slice(0, 140),
            timestamp: new Date().toISOString()
        };
        emit({
            status: "deleting",
            deleted,
            skipped,
            speedPerMinute: speed(),
            estimatedCompletion: eta(previews.length),
            message: `Deleted ${deleted}/${previews.length}...`,
            deletedLog: [...progress.deletedLog.slice(-49), entry]
        });
        if (deleted % 25 === 0) pushLog(`Deleted ${deleted}/${previews.length} (${speed()}/min)...`);

        const base = Math.max(500, settings.store.deleteDelayMs);
        const jitterMax = Math.max(settings.store.deleteJitterMs, 0);
        await sleep(base + Math.floor(Math.random() * (jitterMax + 1)));
    }

    emit({
        status: "done",
        deleted,
        skipped,
        speedPerMinute: speed(),
        message: skipped ? `Done. ${deleted} deleted, ${skipped} skipped.` : `Done. ${deleted} message${deleted === 1 ? "" : "s"} deleted.`,
        previews: []
    });
    pushLog(skipped ? `Done. ${deleted} deleted, ${skipped} skipped.` : `Done. ${deleted} message${deleted === 1 ? "" : "s"} deleted.`);
}

export function resetEngine() {
    resetStop();
    emit({
        status: "idle",
        total: 0,
        deleted: 0,
        skipped: 0,
        speedPerMinute: 0,
        message: "Nothing running.",
        targetName: undefined,
        startedAt: undefined,
        estimatedCompletion: undefined,
        previews: [],
        log: [],
        deletedLog: []
    });
}
