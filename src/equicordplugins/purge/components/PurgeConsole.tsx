/*
 * Purge live console — auto-scrolling event log + progress bar.
 *
 * Subscribes to the engine via props (the parent modal owns the
 * useSyncExternalStore subscription), so every engine emit re-renders this
 * console: same live feel as the original PurgeCord console.
 *
 * Run: pnpm build (then restart Discord — dist/desktop/renderer.js loads
 * through the Gooncord shim at Discord's resources/app.asar).
 */

import { React } from "@webpack/common";

import { PurgeProgress } from "../engine";

function etaText(iso?: string): string | null {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return "almost done";
    const min = Math.floor(ms / 60000);
    if (min < 1) return "under a minute left";
    if (min < 60) return `~${min}m left`;
    return `~${Math.floor(min / 60)}h ${min % 60}m left`;
}

export function PurgeConsole({ progress }: { progress: PurgeProgress; }) {
    const boxRef = React.useRef<HTMLDivElement>(null);

    // Pin to the bottom on every new line, like a terminal.
    React.useEffect(() => {
        const el = boxRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [progress.log, progress.message]);

    const done = progress.deleted + progress.skipped;
    const pct = progress.total > 0 ? Math.min(100, Math.round((done / progress.total) * 100)) : 0;
    const showBar = (progress.status === "deleting" || progress.status === "fetching") && progress.total > 0;

    return (
        <div className="goon-purge-console">
            <div>{progress.message}</div>
            {showBar && (
                <>
                    <div className="goon-purge-bar-track">
                        <div className="goon-purge-bar-fill" style={{ width: `${progress.status === "deleting" ? pct : 100}%` }} />
                    </div>
                    <div className="goon-purge-meta">
                        {done}/{progress.total}
                        {progress.status === "deleting" && ` · ${progress.speedPerMinute}/min`}
                        {progress.status === "deleting" && etaText(progress.estimatedCompletion) && ` · ${etaText(progress.estimatedCompletion)}`}
                    </div>
                </>
            )}
            {progress.log.length > 0 && (
                <div className="goon-purge-log" ref={boxRef}>
                    {progress.log.map((line, i) => (
                        <div key={i} className="goon-purge-log-line">{line}</div>
                    ))}
                </div>
            )}
        </div>
    );
}
