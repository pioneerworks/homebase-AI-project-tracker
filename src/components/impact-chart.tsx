"use client";

import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import type { MergeDay } from "@/lib/merges";
import type { SignupDay } from "@/lib/mock-signups";

export type ImpactPoint = {
  date: string;
  signups: number | null;
  rate: number | null;
  merges: number | null;
};

export type ImpactSeries = {
  points: ImpactPoint[];
  mergesSample: { label: string; day: MergeDay[] };
};

const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

type TooltipEntry = { name?: string; value?: number | string; payload?: ImpactPoint };

function ImpactTooltip({
  active,
  payload,
  sampleNote,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  sampleNote: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ImpactPoint | undefined;
  if (!point) return null;
  return (
    <div className="impact-tooltip">
      <span className="impact-tooltip-date">{dayLabel(point.date)}</span>
      {point.signups != null && (
        <div className="impact-tooltip-row">
          <span className="impact-dot impact-dot-signups" /> Signups:{" "}
          <strong>{point.signups}</strong>
        </div>
      )}
      {point.rate != null && (
        <div className="impact-tooltip-row">
          <span className="impact-dot impact-dot-rate" /> Signup rate:{" "}
          <strong>{pct(point.rate)}</strong>
        </div>
      )}
      {point.merges != null && point.merges > 0 && (
        <div className="impact-tooltip-row">
          <span className="impact-dot impact-dot-merges" /> PRs merged:{" "}
          <strong>{point.merges}</strong>
        </div>
      )}
      {sampleNote && <div className="impact-tooltip-note">{sampleNote}</div>}
    </div>
  );
}

export default function ImpactChart({
  points,
  sampleNote,
}: {
  points: ImpactPoint[];
  sampleNote?: string;
}) {
  return (
    <div className="impact-chart">
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={dayLabel}
            tick={{ fontSize: 11, fill: "var(--muted)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
            minTickGap={28}
          />
          <YAxis yAxisId="signups" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} />
          <YAxis
            yAxisId="rate"
            orientation="right"
            tickFormatter={(v: number) => pct(v)}
            tick={{ fontSize: 11, fill: "var(--muted)" }}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <Tooltip content={<ImpactTooltip sampleNote={sampleNote ?? ""} />} />
          <Bar
            yAxisId="signups"
            dataKey="merges"
            name="PRs merged"
            fill="var(--primary)"
            fillOpacity={0.28}
            radius={[2, 2, 0, 0]}
            barSize={9}
            isAnimationActive={false}
          />
          <Area
            yAxisId="signups"
            type="monotone"
            dataKey="signups"
            name="Signups"
            stroke="var(--success)"
            strokeWidth={2}
            fill="var(--success)"
            fillOpacity={0.08}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            yAxisId="rate"
            type="monotone"
            dataKey="rate"
            name="Signup rate"
            stroke="var(--warning)"
            strokeWidth={2}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
      <div className="impact-legend">
        <span className="impact-legend-item">
          <span className="impact-dot impact-dot-signups" /> Signups
        </span>
        <span className="impact-legend-item">
          <span className="impact-dot impact-dot-rate" /> Signup rate (conversion)
        </span>
        <span className="impact-legend-item">
          <span className="impact-dot impact-dot-merges" /> PRs merged (marketing-site-payload)
        </span>
      </div>
    </div>
  );
}
