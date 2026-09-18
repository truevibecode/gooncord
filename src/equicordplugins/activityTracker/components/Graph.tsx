/*
 * Gooncord Activity Tracker — SVG bar graph. No chart deps, Discord vars only.
 */

import { React } from "@webpack/common";

import { Bucket, fmtDur, Metric } from "../utils";

interface Props {
    buckets: Bucket[];
    metric: Metric;
    color: string;
}

const W = 560;
const H = 180;
const PAD_L = 8;
const PAD_B = 26;
const PAD_T = 12;

export function Graph({ buckets, metric, color }: Props) {
    const max = Math.max(1, ...buckets.map(b => b[metric]));
    const innerW = W - PAD_L * 2;
    const innerH = H - PAD_T - PAD_B;
    const slot = innerW / Math.max(1, buckets.length);
    const barW = Math.max(2, Math.min(34, slot * 0.62));

    // Y gridlines at 0/50/100% with value labels.
    const grid = [0, 0.5, 1].map(frac => {
        const y = PAD_T + innerH * (1 - frac);
        return { y, label: fmtDur(max * frac) };
    });

    return (
        <svg
            viewBox={`0 0 ${W} ${H}`}
            style={{ width: "100%", height: "auto", display: "block" }}
            role="img"
            aria-label="Activity graph"
        >
            {grid.map((g, i) => (
                <g key={i}>
                    <line
                        x1={PAD_L}
                        x2={W - PAD_L}
                        y1={g.y}
                        y2={g.y}
                        stroke="var(--background-modifier-accent)"
                        strokeWidth={1}
                    />
                    <text
                        x={W - PAD_L}
                        y={g.y - 4}
                        textAnchor="end"
                        fontSize={10}
                        fill="var(--text-muted)"
                    >
                        {g.label}
                    </text>
                </g>
            ))}
            {buckets.map((b, i) => {
                const v = b[metric];
                const h = Math.max(v > 0 ? 2 : 0, (v / max) * innerH);
                const x = PAD_L + slot * i + (slot - barW) / 2;
                const y = PAD_T + innerH - h;
                return (
                    <g key={b.key}>
                        <title>{`${b.label} ${b.sub} — ${fmtDur(v)}`}</title>
                        <rect
                            x={x}
                            y={y}
                            width={barW}
                            height={h}
                            rx={Math.min(4, barW / 2)}
                            fill={v > 0 ? color : "var(--background-modifier-accent)"}
                            opacity={v > 0 ? 0.9 : 0.6}
                        />
                        {(buckets.length <= 12 || i % Math.ceil(buckets.length / 12) === 0) && (
                            <text
                                x={x + barW / 2}
                                y={H - 8}
                                textAnchor="middle"
                                fontSize={10}
                                fill="var(--text-muted)"
                            >
                                {b.label}
                            </text>
                        )}
                    </g>
                );
            })}
        </svg>
    );
}
