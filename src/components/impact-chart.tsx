"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  useActiveTooltipLabel,
  XAxis,
  YAxis,
} from "recharts";

import { classifyPageTouch, type MergeDay, type MergedPr } from "@/lib/merges";
import { linearTrend, presetRange, trendLabel, type RangePreset } from "@/lib/standup";

const REPO = "marketing-site-payload";

export type ImpactPoint = {
  date: string;
  signups: number | null;
  rate: number | null;
  merges: number | null;
  pageMerges: number | null;
  otherMerges: number | null;
};

type ChartPoint = ImpactPoint & { signupTrend: number | null };

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

const shortDayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

// Ranges up to this many days have room for weekday tick labels.
const FULL_TICK_MAX_DAYS = 14;

/** Reports the chart's active day (mouse or arrow keys); renders nothing. */
function TrackActiveDay({ into }: { into: RefObject<string | null> }) {
  const label = useActiveTooltipLabel();
  useEffect(() => {
    into.current = typeof label === "string" ? label : null;
  }, [label, into]);
  return null;
}

type TooltipEntry = { name?: string; value?: number | string; payload?: ImpactPoint };

function ImpactTooltip({
  active,
  payload,
  sampleNote,
  today,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  sampleNote?: string;
  today?: string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ImpactPoint | undefined;
  if (!point) return null;
  return (
    <div className="impact-tooltip">
      <span className="impact-tooltip-date">{dayLabel(point.date)}</span>
      {point.date === today && (
        <div className="impact-tooltip-note">Today so far, a partial day</div>
      )}
      {point.signups != null && (
        <div className="impact-tooltip-row">
          <span className="impact-dot impact-dot-signups" aria-hidden="true" /> Signups:{" "}
          <strong>{point.signups}</strong>
        </div>
      )}
      {point.rate != null && (
        <div className="impact-tooltip-row">
          <span className="impact-dot impact-dot-rate" aria-hidden="true" /> Signup rate:{" "}
          <strong>{pct(point.rate)}</strong>
        </div>
      )}
      {point.merges != null && point.merges > 0 && (
        <div className="impact-tooltip-row">
          <span className="impact-dot impact-dot-merges" aria-hidden="true" /> PRs merged:{" "}
          <strong>{point.merges}</strong>
          <span className="impact-tooltip-hint">click for details</span>
        </div>
      )}
      {point.pageMerges != null && point.pageMerges > 0 && (
        <div className="impact-tooltip-row">
          <span className="impact-dot impact-dot-page" aria-hidden="true" /> Touching a page:{" "}
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

function orderRange(a: string, b: string): { from: string; to: string } {
  return a <= b ? { from: a, to: b } : { from: b, to: a };
}

const PRESETS: { key: Exclude<RangePreset, "custom">; label: string }[] = [
  { key: "7d", label: "7D" },
  { key: "30d", label: "30D" },
  { key: "90d", label: "90D" },
  { key: "all", label: "All" },
];

export default function ImpactChart({
  points: allPoints,
  mergeDays,
  sampleNote,
  today,
}: {
  points: ImpactPoint[];
  mergeDays: MergeDay[];
  sampleNote?: string;
  /** Today's date; its partial signup count is left out of the trend fit. */
  today?: string;
}) {
  const firstDate = allPoints[0]?.date ?? "";
  const lastDate = allPoints.at(-1)?.date ?? "";
  const [preset, setPreset] = useState<RangePreset>("7d");
  const [customFrom, setCustomFrom] = useState(firstDate);
  const [customTo, setCustomTo] = useState(lastDate);
  const range =
    preset === "custom"
      ? orderRange(customFrom || firstDate, customTo || lastDate)
      : presetRange(preset, firstDate, lastDate);
  const visible = allPoints.filter((p) => p.date >= range.from && p.date <= range.to);
  const trend = linearTrend(
    visible.map((p) => p.signups),
    (i) => visible[i].date === today,
  );
  // a steep fall can extrapolate below zero at today's edge; signups can't
  const points: ChartPoint[] = visible.map((p, i) => {
    const t = trend.values[i];
    return { ...p, signupTrend: t == null ? null : Math.max(0, t) };
  });
  const maxMerges = Math.max(0, ...points.map((p) => p.merges ?? 0));
  const totalMerges = points.reduce((s, p) => s + (p.merges ?? 0), 0);
  const tickLabel = points.length <= FULL_TICK_MAX_DAYS ? dayLabel : shortDayLabel;
  const chartSummary = `Signups ${dayLabel(range.from)} to ${dayLabel(range.to)}. ${trendLabel(
    trend.slope,
    trend.n,
    true,
  )}. ${totalMerges} PRs merged.`;

  const [pickedDate, setSelectedDate] = useState<string | null>(null);
  const selectedDate =
    pickedDate && pickedDate >= range.from && pickedDate <= range.to ? pickedDate : null;
  const [view, setView] = useState<"all" | "page">("all");
  const selectedDay = mergeDays.find((d) => d.date === selectedDate) ?? null;
  const selectedPoint = points.find((p) => p.date === selectedDate) ?? null;

  const toggleDay = (date: unknown) => {
    if (typeof date === "string") {
      setSelectedDate((current) => (current === date ? null : date));
    }
  };
  // the whole day column is the click target, not just the thin bar
  const handleDayClick = (state: { activeLabel?: string | number | null } | null) =>
    toggleDay(state?.activeLabel);
  // recharts moves the active day with the arrow keys; Enter/Space opens it
  const summaryId = useId();
  const activeDay = useRef<string | null>(null);
  const handleDayKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.key === "Enter" || event.key === " ") && activeDay.current) {
      event.preventDefault();
      toggleDay(activeDay.current);
    }
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
              {points.length > 0 && " · click a day for its PRs"}
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
      {points.length === 0 && (
        <p className="empty-message">No data in this date range.</p>
      )}
      {points.length > 0 && (
        <div
          className="impact-plot"
          role="figure"
          aria-label="Signups and merged PRs by day"
          aria-describedby={summaryId}
          onKeyDown={handleDayKey}
        >
          <p id={summaryId} className="sr-only">
            {chartSummary} Use the arrow keys to move between days and Enter to list
            that day&apos;s PRs.
          </p>
          <div className="impact-axis-captions" aria-hidden="true">
            <span>Signups / day</span>
            <span>Signup rate</span>
          </div>
          <ResponsiveContainer width="100%" height={340}>
            <ComposedChart
              data={points}
              margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
              barCategoryGap="30%"
              onClick={handleDayClick}
              style={{ cursor: "pointer" }}
            >
              <TrackActiveDay into={activeDay} />
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={tickLabel}
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--chart-grid)" }}
                minTickGap={24}
              />
              <YAxis
                yAxisId="signups"
                domain={[0, "auto"]}
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="rate"
                orientation="right"
                tickFormatter={(v: number) => pct(v)}
                tick={{ fontSize: 11, fill: "var(--muted)" }}
                tickLine={false}
                axisLine={false}
                width={52}
              />
              {/* merges get their own hidden scale so bars stay readable next to
                  hundreds of signups; they fill roughly the bottom third */}
              <YAxis yAxisId="merges" hide domain={[0, Math.max(4, maxMerges * 3)]} />
              <Tooltip content={<ImpactTooltip sampleNote={sampleNote} today={today} />} />
              <Bar
                yAxisId="merges"
                dataKey="pageMerges"
                stackId="merges"
                name="Page-touching PRs"
                fill="var(--primary)"
                fillOpacity={0.9}
                radius={view === "all" ? [0, 0, 0, 0] : [2, 2, 0, 0]}
                maxBarSize={28}
                isAnimationActive={false}
              />
              {view === "all" && (
                <Bar
                  yAxisId="merges"
                  dataKey="otherMerges"
                  stackId="merges"
                  name="Other PRs"
                  fill="var(--surface-strong)"
                  stroke="var(--line)"
                  fillOpacity={1}
                  radius={[2, 2, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
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
                yAxisId="signups"
                type="linear"
                dataKey="signupTrend"
                name="Signup trend"
                stroke="var(--success-dark)"
                strokeWidth={1.5}
                strokeDasharray="6 4"
                dot={false}
                activeDot={false}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                yAxisId="rate"
                type="monotone"
                dataKey="rate"
                name="Signup rate"
                stroke="var(--accent)"
                strokeWidth={2}
                dot={false}
                connectNulls={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}

      {points.length > 0 && (
        <div className="impact-legend">
          <span className="impact-legend-item">
            <span className="impact-dot impact-dot-signups" aria-hidden="true" /> Signups
          </span>
          <span className="impact-legend-item">
            <span className="impact-dash impact-dash-trend" aria-hidden="true" />
            {trendLabel(trend.slope, trend.n)}
          </span>
          <span className="impact-legend-item">
            <span className="impact-dash impact-dash-rate" aria-hidden="true" /> Signup rate
            (signups ÷ traffic)
          </span>
          <span className="impact-legend-item">
            <span className="impact-dot impact-dot-merges" aria-hidden="true" /> Page-touching PRs
          </span>
          {view === "all" && (
            <span className="impact-legend-item">
              <span className="impact-dot impact-dot-other" aria-hidden="true" /> Other PRs
              (infra, deps, docs)
            </span>
          )}
        </div>
      )}

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
