"use client";

import { useState } from "react";
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

import { classifyPageTouch, type MergeDay, type MergedPr } from "@/lib/merges";
import type { SignupDay } from "@/lib/signup-data";

const REPO = "marketing-site-payload";

export type ImpactPoint = {
  date: string;
  signups: number | null;
  rate: number | null;
  merges: number | null;
  pageMerges: number | null;
  otherMerges: number | null;
};

const dayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const longDayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
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
  sampleNote?: string;
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
          <span className="impact-tooltip-hint">click for details</span>
        </div>
      )}
      {point.pageMerges != null && point.pageMerges > 0 && (
        <div className="impact-tooltip-row">
          <span className="impact-dot impact-dot-page" /> Touching a page:{" "}
          <strong>{point.pageMerges}</strong>
        </div>
      )}
      {sampleNote && <div className="impact-tooltip-note">{sampleNote}</div>}
    </div>
  );
}

function PrRow({ pr }: { pr: MergedPr }) {
  const ticket = pr.title.match(/\b([A-Z]{3,7}-\d+)\b/)?.[1];
  const touch = classifyPageTouch(pr);
  return (
    <li className="pr-row">
      <a
        className="pr-row-link"
        href={`https://github.com/pioneerworks/${REPO}/pull/${pr.number}`}
        target="_blank"
        rel="noreferrer"
      >
        <span className="pr-row-number">#{pr.number}</span>
        <span className="pr-row-title">{pr.title}</span>
      </a>
      <span className="pr-row-meta">
        {ticket && <span className="pr-row-ticket">{ticket}</span>}
        <span
          className={`pr-row-touch ${touch.touchesPage ? "pr-row-touch-page" : "pr-row-touch-infra"}`}
          title={
            touch.touchesPage
              ? touch.source === "label"
                ? "Touches a page (GitHub label)"
                : "Touches a page (inferred)"
              : touch.source === "label"
                ? "Infrastructure (GitHub label)"
                : "Infrastructure (inferred)"
          }
        >
          {touch.touchesPage ? "page" : "infra"}
        </span>
        {touch.route && <span className="pr-row-route">{touch.route}</span>}
        {pr.labels.slice(0, 2).map((label) => (
          <span key={label} className="pr-row-label">
            {label}
          </span>
        ))}
        <span className="pr-row-author">{pr.author ?? "unknown"}</span>
      </span>
    </li>
  );
}

export type RangePreset = "7d" | "30d" | "90d" | "all" | "custom";

const PRESETS: { key: Exclude<RangePreset, "custom">; label: string }[] = [
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "all", label: "All" },
];

function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Inclusive date window for a preset, anchored on the latest data point. */
export function presetRange(
  preset: Exclude<RangePreset, "custom">,
  firstDate: string,
  lastDate: string,
): { from: string; to: string } {
  if (preset === "all" || !lastDate) return { from: firstDate, to: lastDate };
  const days = preset === "7d" ? 7 : preset === "30d" ? 30 : 90;
  const from = shiftDate(lastDate, -(days - 1));
  return { from: from < firstDate ? firstDate : from, to: lastDate };
}

export default function ImpactChart({
  points: allPoints,
  mergeDays,
  sampleNote,
}: {
  points: ImpactPoint[];
  mergeDays: MergeDay[];
  sampleNote?: string;
}) {
  const firstDate = allPoints[0]?.date ?? "";
  const lastDate = allPoints.at(-1)?.date ?? "";
  const [preset, setPreset] = useState<RangePreset>("all");
  const [customFrom, setCustomFrom] = useState(firstDate);
  const [customTo, setCustomTo] = useState(lastDate);
  const range =
    preset === "custom"
      ? { from: customFrom || firstDate, to: customTo || lastDate }
      : presetRange(preset, firstDate, lastDate);
  const points = allPoints.filter((p) => p.date >= range.from && p.date <= range.to);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [view, setView] = useState<"all" | "page">("all");
  const selectedDay = mergeDays.find((d) => d.date === selectedDate) ?? null;
  const selectedPoint = points.find((p) => p.date === selectedDate) ?? null;

  const handleBarClick = (data: { payload?: ImpactPoint }) => {
    const date = data?.payload?.date;
    if (date) setSelectedDate((current) => (current === date ? null : date));
  };

  return (
    <div className="impact-chart">
      <div className="impact-chart-head">
        <div className="impact-range">
          <div className="impact-toggle" role="group" aria-label="Date range">
            {PRESETS.map((p) => (
              <button
                key={p.key}
                type="button"
                aria-pressed={preset === p.key}
                onClick={() => setPreset(p.key)}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              aria-pressed={preset === "custom"}
              onClick={() => {
                setCustomFrom(range.from);
                setCustomTo(range.to);
                setPreset("custom");
              }}
            >
              Custom
            </button>
          </div>
          {preset === "custom" ? (
            <span className="impact-range-inputs">
              <label>
                <span className="sr-only">From</span>
                <input
                  type="date"
                  value={customFrom}
                  min={firstDate}
                  max={customTo || lastDate}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </label>
              <span aria-hidden="true">–</span>
              <label>
                <span className="sr-only">To</span>
                <input
                  type="date"
                  value={customTo}
                  min={customFrom || firstDate}
                  max={lastDate}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </label>
            </span>
          ) : (
            <span className="impact-range-label">
              {range.from && `${dayLabel(range.from)} – ${dayLabel(range.to)}`}
            </span>
          )}
        </div>
        <div className="impact-toggle" role="group" aria-label="Merge view">
          <button
            type="button"
            aria-pressed={view === "all"}
            onClick={() => setView("all")}
          >
            All PRs
          </button>
          <button
            type="button"
            aria-pressed={view === "page"}
            onClick={() => setView("page")}
          >
            Page-touching only
          </button>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={dayLabel}
            tick={{ fontSize: 11, fill: "var(--muted)" }}
            tickLine={false}
            axisLine={{ stroke: "var(--chart-grid)" }}
            minTickGap={36}
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
          <Tooltip content={<ImpactTooltip sampleNote={sampleNote} />} />
          <Bar
            yAxisId="signups"
            dataKey="pageMerges"
            stackId="merges"
            name="PRs touching a page"
            fill="var(--primary)"
            fillOpacity={0.9}
            radius={view === "all" ? [0, 0, 0, 0] : [2, 2, 0, 0]}
            barSize={9}
            isAnimationActive={false}
            onClick={handleBarClick}
            cursor="pointer"
          />
          {view === "all" && (
            <Bar
              yAxisId="signups"
              dataKey="otherMerges"
              stackId="merges"
              name="Other PRs"
              fill="var(--surface-strong)"
              fillOpacity={1}
              radius={[2, 2, 0, 0]}
              barSize={9}
              isAnimationActive={false}
              onClick={handleBarClick}
              cursor="pointer"
            />
          )}
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
            connectNulls={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="impact-legend">
        <span className="impact-legend-item">
          <span className="impact-dot impact-dot-signups" /> Signups
        </span>
        <span className="impact-legend-item">
          <span className="impact-dot impact-dot-rate" /> Signup rate (signups ÷ traffic)
        </span>
        <span className="impact-legend-item">
          <span className="impact-dot impact-dot-merges" /> PRs touching a page (
          {REPO})
        </span>
        {view === "all" && (
          <span className="impact-legend-item">
            <span className="impact-dot impact-dot-other" /> Other PRs (infra,
            deps, docs) — click a bar to inspect
          </span>
        )}
      </div>

      {selectedDate && (
        <div className="impact-drilldown">
          <div className="impact-drilldown-head">
            <div>
              <span className="impact-drilldown-title">
                {longDayLabel(selectedDate)}
                {selectedPoint?.signups != null && (
                  <span className="impact-drilldown-sub">
                    {" "}
                    · {selectedPoint.signups} signups
                    {selectedPoint.rate != null && ` · ${pct(selectedPoint.rate)} rate`}
                  </span>
                )}
              </span>
            </div>
            <button
              type="button"
              className="impact-drilldown-close"
              aria-label="Close PR details"
              onClick={() => setSelectedDate(null)}
            >
              ✕
            </button>
          </div>
          {selectedDay && selectedDay.prs.length > 0 ? (
            <>
              <p className="impact-drilldown-count">
                {selectedDay.prs.length} PR{selectedDay.prs.length > 1 ? "s" : ""}{" "}
                merged ·{" "}
                {
                  selectedDay.prs.filter((pr) => classifyPageTouch(pr).touchesPage)
                    .length
                }{" "}
                touch a page
              </p>
              <ul className="pr-list">
                {selectedDay.prs.map((pr) => (
                  <PrRow key={pr.number} pr={pr} />
                ))}
              </ul>
            </>
          ) : (
            <p className="impact-drilldown-count">No PRs merged that day.</p>
          )}
        </div>
      )}
    </div>
  );
}
