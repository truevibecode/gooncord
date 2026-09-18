/*
 * Gooncord Activity Tracker — time bucketing, persistence and formatting.
 * Day buckets are local-time keyed; all values are milliseconds.
 */

export interface DayStats {
    online: number;
    active: number;
    vc: number;
}

export type Metric = "online" | "active" | "vc";

export type RangeMode = "week" | "month" | "year";

export interface Bucket {
    key: string;
    label: string;
    sub: string;
    online: number;
    active: number;
    vc: number;
}

export const emptyDay = (): DayStats => ({ online: 0, active: 0, vc: 0 });

export function dayKey(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function startOfDay(d: Date): Date {
    const c = new Date(d);
    c.setHours(0, 0, 0, 0);
    return c;
}

function addDays(d: Date, n: number): Date {
    const c = new Date(d);
    c.setDate(c.getDate() + n);
    return c;
}

function startOfMonth(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, n: number): Date {
    return new Date(d.getFullYear(), d.getMonth() + n, 1);
}

/** Credit [fromMs, toMs) across local-day buckets (handles midnight splits). */
export function creditRange(days: Record<string, DayStats>, field: Metric, fromMs: number, toMs: number) {
    if (!(toMs > fromMs)) return;
    let cursor = fromMs;
    while (cursor < toMs) {
        const dayStart = startOfDay(new Date(cursor)).getTime();
        const dayEnd = dayStart + 86_400_000;
        const sliceEnd = Math.min(toMs, dayEnd);
        const key = dayKey(new Date(cursor));
        const bucket = days[key] ?? (days[key] = emptyDay());
        bucket[field] += sliceEnd - cursor;
        cursor = sliceEnd;
    }
}

export function fmtDur(ms: number): string {
    if (!ms || ms < 1000) return "—";
    const totalMin = Math.floor(ms / 60000);
    if (totalMin < 1) return `${Math.floor(ms / 1000)}s`;
    if (totalMin < 60) return `${totalMin}m`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h < 48) return m === 0 ? `${h}h` : `${h}h ${m}m`;
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh === 0 ? `${d}d` : `${d}d ${rh}h`;
}

export function fmtDurLong(ms: number): string {
    if (!ms || ms < 1000) return "nothing tracked yet";
    const totalMin = Math.floor(ms / 60000);
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    if (h === 0) return `${totalMin} minute${totalMin === 1 ? "" : "s"}`;
    return `${h} hour${h === 1 ? "" : "s"}${m ? ` ${m} min` : ""}`;
}

const WEEKDAY = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Build display buckets for a range. offset 0 = current period, 1 = previous, ... */
export function buildBuckets(days: Record<string, DayStats>, mode: RangeMode, offset: number): Bucket[] {
    const out: Bucket[] = [];
    const today = startOfDay(new Date());

    if (mode === "year") {
        const base = addMonths(startOfMonth(today), -11 - offset * 12);
        for (let i = 0; i < 12; i++) {
            const mStart = addMonths(base, i);
            const mEnd = addMonths(base, i + 1);
            const agg = emptyDay();
            const cursor = new Date(mStart);
            while (cursor < mEnd) {
                const d = days[dayKey(cursor)];
                if (d) {
                    agg.online += d.online;
                    agg.active += d.active;
                    agg.vc += d.vc;
                }
                cursor.setDate(cursor.getDate() + 1);
            }
            out.push({
                key: `${mStart.getFullYear()}-${mStart.getMonth()}`,
                label: MONTH[mStart.getMonth()],
                sub: `${mStart.getFullYear()}`,
                ...agg
            });
        }
        return out;
    }

    const span = mode === "week" ? 7 : 30;
    const end = addDays(today, 1 - offset * span);
    const start = addDays(end, -span);
    for (let i = 0; i < span; i++) {
        const d = addDays(start, i);
        const key = dayKey(d);
        const stats = days[key] ?? emptyDay();
        out.push({
            key,
            label: mode === "week" ? WEEKDAY[d.getDay()] : `${d.getDate()}`,
            sub: mode === "week" ? `${d.getDate()} ${MONTH[d.getMonth()]}` : MONTH[d.getMonth()],
            ...stats
        });
    }
    return out;
}

export function rangeTitle(mode: RangeMode, offset: number): string {
    const today = startOfDay(new Date());
    if (mode === "year") {
        const base = addMonths(startOfMonth(today), -11 - offset * 12);
        const last = addMonths(base, 11);
        return offset === 0 ? "Last 12 months" : `${MONTH[base.getMonth()]} ${base.getFullYear()} – ${MONTH[last.getMonth()]} ${last.getFullYear()}`;
    }
    const span = mode === "week" ? 7 : 30;
    const end = addDays(today, -offset * span);
    const start = addDays(end, -(span - 1));
    const fmt = (d: Date) => `${d.getDate()} ${MONTH[d.getMonth()]}`;
    return offset === 0
        ? (mode === "week" ? "This week" : "Last 30 days")
        : `${fmt(start)} – ${fmt(end)}`;
}

export function sumBuckets(buckets: Bucket[], field: Metric): number {
    let total = 0;
    for (const b of buckets) total += b[field];
    return total;
}
