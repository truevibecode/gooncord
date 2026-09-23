/*
 * Purge menu — scope, filters, preview, console. Runs in the background:
 * closing this modal never stops an active run (use Stop).
 */

import { Button } from "@components/Button";
import { Switch } from "@components/Switch";
import { ChannelType } from "@vencord/discord-types/enums";
import {
    Alerts, ChannelStore, GuildChannelStore, GuildStore, Modal, openModal, React,
    SearchableSelect, SelectedChannelStore, SelectedGuildStore, TextInput, Toasts, UserStore
} from "@webpack/common";
import type { RenderModalProps } from "@vencord/discord-types";

import {
    fetchPreviews, getProgress, PurgeFilter, PurgePreview, requestStop, resetEngine, runDeletion, subscribeProgress
} from "../engine";
import { settings } from "../settings";

import "../styles.css";

const PURGEABLE = new Set<number>([
    ChannelType.GUILD_TEXT,
    ChannelType.DM,
    ChannelType.GROUP_DM,
    ChannelType.GUILD_ANNOUNCEMENT,
    ChannelType.ANNOUNCEMENT_THREAD,
    ChannelType.PUBLIC_THREAD,
    ChannelType.PRIVATE_THREAD
]);

export function isPurgeableChannel(channel: any): boolean {
    return !!channel && PURGEABLE.has(channel.type);
}

interface ChannelOption {
    label: string;
    value: string;
    guildId?: string;
}

function dmLabel(channel: any): string {
    if (channel.name) return channel.name;
    try {
        const ids: string[] = channel.recipients ?? [];
        const names = ids
            .map(id => UserStore.getUser(id))
            .filter(Boolean)
            .map(u => u!.globalName ?? u!.username);
        if (names.length) return names.join(", ");
    } catch { /* ignore */ }
    return channel.type === ChannelType.GROUP_DM ? "Group DM" : "Direct Message";
}

function buildChannelOptions(): ChannelOption[] {
    const out: ChannelOption[] = [];
    try {
        for (const guild of GuildStore.getGuilds ? Object.values(GuildStore.getGuilds()) : []) {
            const g: any = guild;
            let entries: Array<{ channel: any; }> = [];
            try {
                entries = GuildChannelStore.getSelectableChannels(g.id) ?? [];
            } catch { /* ignore */ }
            for (const { channel } of entries) {
                if (!isPurgeableChannel(channel)) continue;
                out.push({ label: `#${channel.name} (${g.name})`, value: channel.id, guildId: g.id });
            }
        }
    } catch { /* ignore */ }
    try {
        const dms: any[] = ChannelStore.getSortedPrivateChannels?.() ?? [];
        for (const channel of dms) {
            if (!isPurgeableChannel(channel)) continue;
            out.push({ label: `${dmLabel(channel)} (DM)`, value: channel.id });
        }
    } catch { /* ignore */ }
    return out;
}

function parseDateInput(raw: string): string | undefined {
    const t = raw.trim();
    if (!t) return undefined;
    if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
        const ms = new Date(`${t}T00:00:00`).getTime();
        return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
    }
    const ms = new Date(t).getTime();
    return Number.isFinite(ms) ? new Date(ms).toISOString() : undefined;
}

function downloadArchive(channelId: string, previews: PurgePreview[]) {
    const payload = {
        app: "gooncord-purge-archive",
        version: 1,
        channelId,
        exportedAt: new Date().toISOString(),
        count: previews.length,
        messages: previews
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `purge-archive-${channelId}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function etaText(iso?: string): string | null {
    if (!iso) return null;
    const ms = new Date(iso).getTime() - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return "almost done";
    const min = Math.floor(ms / 60000);
    if (min < 1) return "under a minute left";
    if (min < 60) return `~${min}m left`;
    return `~${Math.floor(min / 60)}h ${min % 60}m left`;
}

export function openPurgeModal(initialChannelId?: string) {
    openModal(props => <PurgeModal props={props} initialChannelId={initialChannelId} />);
}

function PurgeModal({ props, initialChannelId }: { props: RenderModalProps; initialChannelId?: string; }) {
    const progress = React.useSyncExternalStore(subscribeProgress, getProgress);
    const [channelId, setChannelId] = React.useState(initialChannelId ?? SelectedChannelStore.getChannelId() ?? "");
    const [from, setFrom] = React.useState("");
    const [to, setTo] = React.useState("");
    const [linksOnly, setLinksOnly] = React.useState(false);
    const [keyword, setKeyword] = React.useState("");
    const [limit, setLimit] = React.useState("500");
    const [busy, setBusy] = React.useState(false);
    const [lastStatus, setLastStatus] = React.useState(progress.status);

    const options = React.useMemo(buildChannelOptions, []);
    const selected = React.useMemo(() => {
        try {
            return ChannelStore.getChannel(channelId);
        } catch {
            return null;
        }
    }, [channelId]);
    const me = React.useMemo(() => {
        try {
            return UserStore.getCurrentUser();
        } catch {
            return null;
        }
    }, []);

    const running = progress.status === "fetching" || progress.status === "deleting";
    const pct = progress.total > 0 ? Math.min(100, Math.round(((progress.deleted + progress.skipped) / progress.total) * 100)) : 0;

    // Terminal toasts (background-friendly: fires even if you navigated away and came back).
    React.useEffect(() => {
        if (lastStatus === progress.status) return;
        setLastStatus(progress.status);
        if (progress.status === "done") {
            Toasts.show({ message: progress.message, id: Toasts.genId(), type: Toasts.Type.SUCCESS, options: { position: Toasts.Position.BOTTOM } });
        } else if (progress.status === "stopped") {
            Toasts.show({ message: progress.message, id: Toasts.genId(), type: Toasts.Type.MESSAGE, options: { position: Toasts.Position.BOTTOM } });
        } else if (progress.status === "error") {
            Toasts.show({ message: progress.message, id: Toasts.genId(), type: Toasts.Type.FAILURE, options: { position: Toasts.Position.BOTTOM } });
        }
    }, [progress, lastStatus]);

    const buildFilter = (): PurgeFilter | null => {
        if (!channelId) {
            Toasts.show({ message: "Pick a channel first.", id: Toasts.genId(), type: Toasts.Type.FAILURE, options: { position: Toasts.Position.BOTTOM } });
            return null;
        }
        let guildId: string | undefined;
        try {
            guildId = ChannelStore.getChannel(channelId)?.guild_id;
        } catch { /* ignore */ }
        const max = Math.max(1, Math.min(5000, parseInt(limit, 10) || 500));
        return {
            channelId,
            guildId,
            fromIso: parseDateInput(from),
            toIso: parseDateInput(to),
            linksOnly,
            keyword: keyword.trim() || undefined,
            limit: max,
            targetName: options.find(o => o.value === channelId)?.label ?? channelId
        };
    };

    const onPreview = async () => {
        const filter = buildFilter();
        if (!filter || !me || busy) return;
        setBusy(true);
        try {
            await fetchPreviews(me.id, filter);
        } catch (e) {
            Toasts.show({ message: `Search failed: ${String((e as any)?.body?.message ?? (e as any)?.message ?? e).slice(0, 160)}`, id: Toasts.genId(), type: Toasts.Type.FAILURE, options: { position: Toasts.Position.BOTTOM } });
        } finally {
            setBusy(false);
        }
    };

    const doDelete = async () => {
        const filter = buildFilter();
        if (!filter || !me || busy) return;
        const previews = getProgress().previews;
        if (!previews.length) {
            Toasts.show({ message: "Nothing to delete — preview first.", id: Toasts.genId(), type: Toasts.Type.FAILURE, options: { position: Toasts.Position.BOTTOM } });
            return;
        }
        setBusy(true);
        try {
            if (settings.store.archiveBeforeDelete) {
                downloadArchive(filter.channelId, previews);
                Toasts.show({ message: "Archive downloaded before deleting.", id: Toasts.genId(), type: Toasts.Type.MESSAGE, options: { position: Toasts.Position.BOTTOM } });
            }
            await runDeletion(me.id, filter, previews);
        } finally {
            setBusy(false);
        }
    };

    const onDelete = () => {
        if (!settings.store.confirmBeforeDelete) {
            void doDelete();
            return;
        }
        const count = getProgress().previews.length;
        Alerts.show({
            title: "Delete messages?",
            body: `This permanently deletes ${count} of your messages. Discord may flag aggressive deletion — slow and steady. You sure?`,
            confirmText: "Delete",
            cancelText: "Cancel",
            onConfirm: () => void doDelete()
        });
    };

    const shown = progress.previews.slice(0, 200);

    return (
        <Modal {...props} size="lg" title="Purge">
            <div className="goon-purge-section">
                <div className="goon-purge-label">Channel</div>
                <SearchableSelect
                    options={options}
                    value={channelId}
                    onChange={setChannelId}
                    closeOnSelect={true}
                    placeholder="Pick a channel or DM..."
                />
            </div>

            <div className="goon-purge-section">
                <div className="goon-purge-label">Filters</div>
                <div className="goon-purge-row">
                    <div className="goon-purge-field">
                        <TextInput value={from} onChange={setFrom} placeholder="From: YYYY-MM-DD" />
                    </div>
                    <div className="goon-purge-field">
                        <TextInput value={to} onChange={setTo} placeholder="To: YYYY-MM-DD" />
                    </div>
                    <div className="goon-purge-field">
                        <TextInput value={limit} onChange={setLimit} placeholder="Max: 500" />
                    </div>
                </div>
                <div className="goon-purge-row" style={{ marginTop: 8 }}>
                    <div className="goon-purge-field">
                        <TextInput value={keyword} onChange={setKeyword} placeholder="Keyword (optional)" />
                    </div>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                        <Switch checked={linksOnly} onChange={setLinksOnly} /> Links only
                    </label>
                </div>
            </div>

            <div className="goon-purge-section goon-purge-row">
                <Button variant="secondary" disabled={busy || running} onClick={() => void onPreview()}>Preview</Button>
                <Button variant="dangerSecondary" disabled={busy || running || !progress.previews.length} onClick={onDelete}>Delete</Button>
                {running && <Button variant="secondary" onClick={requestStop}>Stop</Button>}
                {progress.status !== "idle" && !running && (
                    <Button variant="link" onClick={resetEngine}>Clear</Button>
                )}
            </div>

            <div className="goon-purge-section">
                <div className="goon-purge-console">
                    <div>{progress.message}</div>
                    {(progress.status === "deleting" || progress.status === "fetching") && progress.total > 0 && (
                        <>
                            <div className="goon-purge-bar-track">
                                <div
                                    className="goon-purge-bar-fill"
                                    style={{ width: `${progress.status === "deleting" ? pct : Math.min(100, Math.round((progress.total / Math.max(progress.total, 1)) * 100))}` }}
                                />
                            </div>
                            <div className="goon-purge-meta">
                                {progress.deleted + progress.skipped}/{progress.total}
                                {progress.status === "deleting" && ` · ${progress.speedPerMinute}/min`}
                                {progress.status === "deleting" && etaText(progress.estimatedCompletion) && ` · ${etaText(progress.estimatedCompletion)}`}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {progress.previews.length > 0 && (
                <div className="goon-purge-section">
                    <div className="goon-purge-label">Preview ({progress.previews.length}{progress.previews.length > shown.length ? ` — showing first ${shown.length}` : ""})</div>
                    <div className="goon-purge-preview">
                        {shown.map(m => (
                            <div key={m.id} className="goon-purge-preview-row">
                                <span className="goon-purge-preview-time">{new Date(m.timestamp).toLocaleString()}</span>
                                <span className="goon-purge-preview-text">{m.content || <i>(attachment/embed)</i>}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            <div className="goon-purge-warning">
                Deletes only your own messages. Slow defaults protect against lockouts — closing this menu never stops a run, Stop does.
            </div>
        </Modal>
    );
}
