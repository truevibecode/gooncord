/*
 * Purge header button — opens the menu, shows a live progress bar while a
 * run is active. Hidden where purging is meaningless.
 */

import { HeaderBarButton } from "@api/HeaderBar";
import { TrashIcon } from "@components/Icons";
import { ChannelStore, React, SelectedChannelStore } from "@webpack/common";

import { getProgress, subscribeProgress } from "../engine";
import { isPurgeableChannel, openPurgeModal } from "./PurgeModal";

export function PurgeButton() {
    const progress = React.useSyncExternalStore(subscribeProgress, getProgress);

    let currentId: string | undefined;
    try {
        currentId = SelectedChannelStore.getChannelId();
    } catch { /* ignore */ }

    let current: any = null;
    try {
        current = currentId ? ChannelStore.getChannel(currentId) : null;
    } catch { /* ignore */ }

    const running = progress.status === "fetching" || progress.status === "deleting";
    if (!running && !isPurgeableChannel(current)) return null;

    const done = progress.deleted + progress.skipped;
    const pct = progress.total > 0 ? Math.min(100, Math.round((done / progress.total) * 100)) : 0;
    const tooltip = running
        ? `Purge: ${done}/${progress.total} (${pct}%) — ${progress.message}`
        : "Purge messages";

    return (
        <div className="goon-purge-btn-wrap">
            <HeaderBarButton
                tooltip={tooltip}
                icon={TrashIcon}
                onClick={() => openPurgeModal(currentId)}
            />
            {running && (
                <div className="goon-purge-mini-bar">
                    <div className="goon-purge-mini-fill" style={{ width: `${pct}%` }} />
                </div>
            )}
        </div>
    );
}
