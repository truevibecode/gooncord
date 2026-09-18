/*
 * Gooncord Activity Tracker — settings tab: stat cards, graph, ranges.
 */

import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Divider } from "@components/Divider";
import { Flex } from "@components/Flex";
import { Heading, HeadingSecondary } from "@components/Heading";
import { Paragraph } from "@components/Paragraph";
import { SettingsTab } from "@components/settings/tabs/BaseTab";
import { Switch } from "@components/Switch";
import { Margins } from "@utils/margins";
import { Alerts, React, Toasts } from "@webpack/common";

import { settings } from "../settings";
import { tracker } from "../tracker";
import { Bucket, buildBuckets, fmtDur, fmtDurLong, Metric, RangeMode, rangeTitle, sumBuckets } from "../utils";
import { Graph } from "./Graph";

const METRICS: { id: Metric; label: string; color: string; }[] = [
    { id: "online", label: "Online", color: "var(--brand-500)" },
    { id: "active", label: "Active", color: "var(--green-360)" },
    { id: "vc", label: "In Voice", color: "var(--yellow-360)" },
];

const RANGES: { id: RangeMode; label: string; }[] = [
    { id: "week", label: "Week" },
    { id: "month", label: "Month" },
    { id: "year", label: "Year" },
];

function notify(message: string, type: string = Toasts.Type.SUCCESS) {
    Toasts.show({
        message,
        id: Toasts.genId(),
        type,
        options: { position: Toasts.Position.BOTTOM }
    });
}

function download(filename: string, text: string) {
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string; }) {
    return (
        <Card className="goon-activity-stat" variant="primary">
            <Paragraph className="goon-activity-stat-label">{label}</Paragraph>
            <Heading className="goon-activity-stat-value">{value}</Heading>
            {sub != null && <Paragraph className="goon-activity-stat-sub">{sub}</Paragraph>}
        </Card>
    );
}

function ToggleRow({ label, note, value, onChange }: { label: string; note: string; value: boolean; onChange: (v: boolean) => void; }) {
    return (
        <Flex className="goon-activity-toggle" alignItems="center" justifyContent="space-between">
            <Flex flexDirection="column">
                <HeadingSecondary className={Margins.bottom4}>{label}</HeadingSecondary>
                <Paragraph>{note}</Paragraph>
            </Flex>
            <Switch checked={value} onChange={onChange} />
        </Flex>
    );
}

export function ActivityTab() {
    const [mode, setMode] = React.useState<RangeMode>("week");
    const [offset, setOffset] = React.useState(0);
    const [metric, setMetric] = React.useState<Metric>("online");
    const [tick, setTick] = React.useState(0);
    const fileRef = React.useRef<HTMLInputElement>(null);

    // Live-ish: re-read buckets on the heartbeat cadence while open.
    React.useEffect(() => {
        const id = setInterval(() => setTick(t => t + 1), 30000);
        return () => clearInterval(id);
    }, []);

    const state = tracker.getState();
    const buckets: Bucket[] = React.useMemo(
        () => buildBuckets(state.days, mode, offset),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [mode, offset, tick, state]
    );

    const todayKey = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    })();
    const today = state.days[todayKey] ?? { online: 0, active: 0, vc: 0 };
    // Include the live VC session so "today" never looks behind.
    const liveVc = tracker.todayVcMs();

    const total = sumBuckets(buckets, metric);
    const countedDays = buckets.filter(b => b[metric] > 0).length;
    const avg = countedDays > 0 ? total / countedDays : 0;
    const best = buckets.reduce<Bucket | null>((acc, b) => (!acc || b[metric] > acc[metric] ? b : acc), null);
    const color = METRICS.find(m => m.id === metric)!.color;

    const changeRange = (m: RangeMode) => {
        setMode(m);
        setOffset(0);
    };

    const onExport = async () => {
        try {
            const json = await tracker.exportJson();
            download(`gooncord-activity-${todayKey}.json`, json);
            notify("Activity exported. Keep it safe, goblin.");
        } catch (e) {
            notify(`Export failed: ${(e as Error)?.message ?? e}`, Toasts.Type.FAILURE);
        }
    };

    const onImportFile = async (file: File | undefined) => {
        if (!file) return;
        try {
            const merged = await tracker.importJson(await file.text());
            setTick(t => t + 1);
            notify(`Merged activity (${merged} day-fields kept at best values).`);
        } catch (e) {
            notify(`Import failed: ${(e as Error)?.message ?? e}`, Toasts.Type.FAILURE);
        }
    };

    const onReset = () => {
        Alerts.show({
            title: "Reset activity data?",
            body: "This wipes every tracked day on this device. Exports you saved elsewhere survive. No take-backs.",
            confirmText: "Wipe it",
            cancelText: "Cancel",
            onConfirm: () => tracker.reset().then(() => {
                setTick(t => t + 1);
                notify("Activity data wiped. Fresh slate.");
            })
        });
    };

    return (
        <SettingsTab>
            <Flex className={Margins.bottom20} gap="12px" style={{ flexWrap: "wrap" }}>
                <StatCard label="Online today" value={fmtDur(today.online)} sub={fmtDurLong(today.online)} />
                <StatCard label="Active today" value={fmtDur(today.active)} sub={fmtDurLong(today.active)} />
                <StatCard label="In voice today" value={fmtDur(liveVc)} sub={fmtDurLong(liveVc)} />
            </Flex>

            <Flex className={Margins.bottom16} alignItems="center" justifyContent="space-between" style={{ flexWrap: "wrap", gap: 8 }}>
                <Flex gap="4px">
                    {RANGES.map(r => (
                        <Button
                            key={r.id}
                            variant={mode === r.id ? "primary" : "secondary"}
                            size="small"
                            onClick={() => changeRange(r.id)}
                        >
                            {r.label}
                        </Button>
                    ))}
                </Flex>
                <Flex gap="4px" alignItems="center">
                    <Button variant="secondary" size="small" onClick={() => setOffset(o => o + 1)}>{"<"}</Button>
                    <Paragraph className="goon-activity-range-title">{rangeTitle(mode, offset)}</Paragraph>
                    <Button variant="secondary" size="small" disabled={offset === 0} onClick={() => setOffset(o => Math.max(0, o - 1))}>{">"}</Button>
                </Flex>
                <Flex gap="4px">
                    {METRICS.map(m => (
                        <Button
                            key={m.id}
                            variant={metric === m.id ? "primary" : "secondary"}
                            size="small"
                            onClick={() => setMetric(m.id)}
                        >
                            {m.label}
                        </Button>
                    ))}
                </Flex>
            </Flex>

            <Card className={`${Margins.bottom20} goon-activity-graph-card`} variant="primary">
                <Graph buckets={buckets} metric={metric} color={color} />
            </Card>

            <Flex className={Margins.bottom20} gap="12px" style={{ flexWrap: "wrap" }}>
                <StatCard label={`${METRICS.find(m => m.id === metric)!.label} total`} value={fmtDur(total)} />
                <StatCard label="Daily average" value={fmtDur(avg)} sub={countedDays > 0 ? `over ${countedDays} active day${countedDays === 1 ? "" : "s"}` : "no active days"} />
                <StatCard label="Best day" value={best && best[metric] > 0 ? fmtDur(best[metric]) : "—"} sub={best && best[metric] > 0 ? `${best.label} ${best.sub}` : undefined} />
            </Flex>

            <Heading className={Margins.bottom8}>Breakdown</Heading>
            <Card className={`${Margins.bottom20} goon-activity-rows`} variant="primary">
                {buckets.map(b => (
                    <Flex key={b.key} className="goon-activity-row" alignItems="center" justifyContent="space-between">
                        <Paragraph className="goon-activity-row-date">{b.label} <span className="goon-activity-row-sub">{b.sub}</span></Paragraph>
                        <Paragraph className="goon-activity-row-vals">
                            <span title="Online">{fmtDur(b.online)}</span>
                            {" · "}
                            <span title="Active">{fmtDur(b.active)}</span>
                            {" · "}
                            <span title="In voice">{fmtDur(b.vc)}</span>
                        </Paragraph>
                    </Flex>
                ))}
            </Card>

            <Heading className={Margins.bottom8}>Tracking</Heading>
            <Card className={`${Margins.bottom20} goon-activity-toggles`} variant="primary">
                <ToggleRow label="Track online time" note="Counts while Discord is running on this device." value={settings.store.trackOnline} onChange={v => settings.store.trackOnline = v} />
                <Divider className={Margins.top8 + " " + Margins.bottom8} />
                <ToggleRow label="Track active time" note="Counts while the window is visible." value={settings.store.trackActive} onChange={v => settings.store.trackActive = v} />
                <Divider className={Margins.top8 + " " + Margins.bottom8} />
                <ToggleRow label="Track voice time" note="Counts from voice join to leave." value={settings.store.trackVc} onChange={v => settings.store.trackVc = v} />
                <Divider className={Margins.top8 + " " + Margins.bottom8} />
                <ToggleRow label="Voice milestone toasts" note="Toast at 30m / 1h / 2h / 4h in voice per day." value={settings.store.vcMilestones} onChange={v => settings.store.vcMilestones = v} />
            </Card>

            <Heading className={Margins.bottom8}>Your data</Heading>
            <Paragraph className={Margins.bottom8}>
                Tracked on this device only. Same account, other device? Export there, import here — overlapping days keep the higher value so nothing double-counts.
            </Paragraph>
            <Flex gap="8px" style={{ flexWrap: "wrap" }}>
                <Button variant="secondary" onClick={onExport}>Export JSON</Button>
                <Button variant="secondary" onClick={() => fileRef.current?.click()}>Import JSON</Button>
                <Button variant="dangerSecondary" onClick={onReset}>Reset</Button>
                <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    style={{ display: "none" }}
                    onChange={e => {
                        void onImportFile(e.target.files?.[0]);
                        e.target.value = "";
                    }}
                />
            </Flex>
        </SettingsTab>
    );
}
