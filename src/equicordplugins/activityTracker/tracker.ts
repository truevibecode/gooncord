/*
 * Gooncord Activity Tracker — heartbeat engine + per-day buckets.
 *
 * Online time accrues while Discord runs, active time while its window is
 * visible, voice time from VOICE_CHANNEL_SELECT join/leave events. State is
 * namespaced per Discord user id and persisted to DataStore (IndexedDB), so
 * each device tracks its own slice — use Export/Import on the Activity tab
 * to merge slices across devices sharing one account.
 */

import { DataStore } from "@api/index";
import { Logger } from "@utils/Logger";
import { Toasts } from "@webpack/common";

import { creditRange, DayStats, emptyDay, Metric } from "./utils";

const logger = new Logger("ActivityTracker");

export interface TrackerState {
    version: 1;
    days: Record<string, DayStats>;
    vcSession: { channelId: string; since: number; } | null;
    lastTick: number;
    /** dayKey -> highest VC milestone (ms) already toasted */
    milestonesHit: Record<string, number>;
}

const HEARTBEAT_MS = 30_000;
const STALE_GAP_MS = 90_000;
const MAX_DAYS = 730;

// Toast once per threshold per day while racking up voice time.
const VC_MILESTONES = [
    { at: 30 * 60000, label: "30 minutes" },
    { at: 60 * 60000, label: "1 hour" },
    { at: 2 * 3600000, label: "2 hours" },
    { at: 4 * 3600000, label: "4 hours" },
];

const blankState = (): TrackerState => ({
    version: 1,
    days: {},
    vcSession: null,
    lastTick: 0,
    milestonesHit: {}
});

function storeKey(userId: string) {
    return `ActivityTracker_${userId}_days_v1`;
}

function localDayKey(ms: number): string {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function toast(message: string, type: string = Toasts.Type.MESSAGE) {
    try {
        Toasts.show({
            message,
            id: Toasts.genId(),
            type,
            options: { position: Toasts.Position.BOTTOM }
        });
    } catch (e) {
        logger.warn("toast failed", e);
    }
}

class Tracker {
    private state: TrackerState = blankState();
    private userId: string | null = null;
    private timer: ReturnType<typeof setInterval> | null = null;
    private onVisibility: (() => void) | null = null;
    /** Wired by the plugin to its persisted settings (defaults: all on). */
    flags: () => { trackOnline: boolean; trackActive: boolean; trackVc: boolean; vcMilestones: boolean; } = () => ({
        trackOnline: true,
        trackActive: true,
        trackVc: true,
        vcMilestones: true
    });

    getState(): TrackerState {
        return this.state;
    }

    getUserId(): string | null {
        return this.userId;
    }

    /** Bind to a Discord user; saves the old slice and loads theirs. */
    async ensureUser(userId: string | null) {
        if (!userId) return;
        if (userId === this.userId) return;
        if (this.userId) await this.save();
        this.userId = userId;
        await this.load();
    }

    private async load() {
        if (!this.userId) return;
        try {
            const raw = await DataStore.get<TrackerState>(storeKey(this.userId));
            this.state = raw?.version === 1 ? { ...blankState(), ...raw } : blankState();
        } catch (e) {
            logger.warn("load failed, starting fresh", e);
            this.state = blankState();
        }
        this.repairDanglingSession();
        this.prune();
    }

    private async save() {
        if (!this.userId) return;
        try {
            await DataStore.set(storeKey(this.userId), this.state);
        } catch (e) {
            logger.warn("save failed", e);
        }
    }

    flush() {
        void this.save();
    }

    /** Credit a VC session only up to the last heartbeat — time while the
     * client was closed or asleep must not count. */
    private repairDanglingSession() {
        const s = this.state.vcSession;
        if (!s) return;
        const end = this.state.lastTick || s.since;
        if (end > s.since) creditRange(this.state.days, "vc", s.since, end);
        this.state.vcSession = null;
    }

    private prune() {
        const keys = Object.keys(this.state.days).sort();
        while (keys.length > MAX_DAYS) {
            const oldest = keys.shift();
            if (oldest) delete this.state.days[oldest];
        }
    }

    start() {
        if (this.timer) return;
        this.timer = setInterval(() => this.tick(), HEARTBEAT_MS);
        this.onVisibility = () => {
            // Leaving the window flushes immediately so background stretches
            // never sit unsaved if the app is killed.
            if (document.visibilityState === "hidden") this.flush();
        };
        document.addEventListener("visibilitychange", this.onVisibility);
        void this.tick();
    }

    stop() {
        if (this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
        if (this.onVisibility) {
            document.removeEventListener("visibilitychange", this.onVisibility);
            this.onVisibility = null;
        }
        this.closeVcSession(Date.now());
        this.flush();
    }

    private tick() {
        const now = Date.now();
        const last = this.state.lastTick || now;
        const gap = now - last;

        if (gap > STALE_GAP_MS) {
            // Gap = closed/asleep/crashed. Credit nothing for the gap itself;
            // dangling VC ends at the last known-alive moment.
            this.repairDanglingSession();
        } else {
            const span = Math.min(gap, HEARTBEAT_MS + 5000);
            if (this.flags().trackOnline) creditRange(this.state.days, "online", last, last + span);
            if (this.flags().trackActive && document.visibilityState === "visible") {
                creditRange(this.state.days, "active", last, last + span);
            }
        }

        this.state.lastTick = now;
        this.prune();
        void this.save();
    }

    /** Mirror of voiceChannelLog's join/leave detection. */
    onVoiceSelect(channelId: string | null, currentVoiceChannelId: string | null) {
        if (!this.flags().trackVc) return;
        const now = Date.now();
        const leaving = channelId == null && currentVoiceChannelId != null;
        const joining = channelId != null && currentVoiceChannelId == null;

        if (leaving) {
            this.closeVcSession(now);
        } else if (joining && channelId) {
            // Moved channels without a leave (or stale session): close first.
            this.closeVcSession(now);
            this.state.vcSession = { channelId, since: now };
            void this.save();
        }
    }

    /** Begin a session discovered already-open at boot (no back-credit). */
    resumeVc(channelId: string | null) {
        if (!this.flags().trackVc || !channelId) return;
        if (!this.state.vcSession) {
            this.state.vcSession = { channelId, since: Date.now() };
        }
    }

    private closeVcSession(now: number) {
        const s = this.state.vcSession;
        this.state.vcSession = null;
        if (!s) return;
        if (now > s.since) {
            creditRange(this.state.days, "vc", s.since, now);
            this.checkVcMilestones();
            void this.save();
        }
    }

    todayVcMs(): number {
        const key = localDayKey(Date.now());
        let total = this.state.days[key]?.vc ?? 0;
        const s = this.state.vcSession;
        if (s) {
            const dayStart = new Date();
            dayStart.setHours(0, 0, 0, 0);
            total += Math.max(0, Date.now() - Math.max(s.since, dayStart.getTime()));
        }
        return total;
    }

    private checkVcMilestones() {
        if (!this.flags().vcMilestones) return;
        const key = localDayKey(Date.now());
        const total = this.todayVcMs();
        const hit = this.state.milestonesHit[key] ?? 0;
        for (const m of VC_MILESTONES) {
            if (total >= m.at && hit < m.at) {
                this.state.milestonesHit[key] = m.at;
                toast(`You've spent ${m.label} in voice today. Touch grass maybe?`);
                break;
            }
        }
    }

    async exportJson(): Promise<string> {
        const payload = {
            app: "gooncord-activity",
            version: 1 as const,
            userId: this.userId,
            exportedAt: new Date().toISOString(),
            days: this.state.days
        };
        return JSON.stringify(payload);
    }

    /** Merge a slice from another device: keep the highest value per day per
     * metric (never double-counts overlapping stretches). Returns day count. */
    async importJson(text: string): Promise<number> {
        let parsed: any;
        try {
            parsed = JSON.parse(text);
        } catch {
            throw new Error("That file isn't valid JSON.");
        }
        if (!parsed || typeof parsed !== "object" || typeof parsed.days !== "object") {
            throw new Error("That file isn't a Gooncord activity export.");
        }
        let touched = 0;
        for (const [key, incoming] of Object.entries<any>(parsed.days)) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || typeof incoming !== "object" || !incoming) continue;
            const cur = this.state.days[key] ?? (this.state.days[key] = emptyDay());
            for (const field of ["online", "active", "vc"] as const) {
                const v = incoming[field];
                if (typeof v === "number" && Number.isFinite(v) && v > 0) {
                    if (v > cur[field]) {
                        cur[field] = Math.min(v, 86_400_000);
                        touched++;
                    }
                }
            }
        }
        this.prune();
        await this.save();
        return touched;
    }

    async reset() {
        this.state.days = {};
        this.state.milestonesHit = {};
        await this.save();
    }

    getMetricTotal(field: Metric): number {
        let total = 0;
        for (const d of Object.values(this.state.days)) total += d[field];
        return total;
    }
}

export const tracker = new Tracker();
export type { Metric as TrackerMetric };
