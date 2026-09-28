"use client";

import {
  type ReactNode,
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
  LabelList,
  Line,
  ReferenceArea,
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

type ChartPoint = ImpactPoint & {
  signupTrend: number | null;
  /** Merged PRs drawn for the current view, for the bar total label. */
  barTotal: number;
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

const shortDayLabel = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;
const rateLabel = (v: number) => `${(v * 100).toFixed(2)}%`;

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

function TooltipRow({
  dot,
  label,
  children,
}: {
  dot: string;
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="impact-tooltip-row">
      <span className={`impact-dot impact-dot-${dot}`} aria-hidden="true" />
      <span className="impact-tooltip-label">{label}</span>
      <strong>{children}</strong>
    </div>
  );
}

function ImpactTooltip({
  active,
  payload,
  sampleNote,
  today,
  previous,
}: {
  active?: boolean;
  payload?: TooltipEntry[];
  sampleNote?: string;
  today?: string;
  /** Signups on the day before each date, for the d/d change. */
  previous?: Map<string, number | null>;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload as ImpactPoint | undefined;
  if (!point) return null;
  const prev = previous?.get(point.date);
  const dayChange =
    point.signups != null && prev ? Math.round((point.signups / prev - 1) * 100) : null;
  return (
    <div className="impact-tooltip">
      <span className="impact-tooltip-date">{dayLabel(point.date)}</span>
      {point.date === today && (
        <div className="impact-tooltip-note">Today so far, a partial day</div>
      )}
      {point.signups != null && (
        <TooltipRow dot="signups" label="Signups">
          {point.signups}
          {dayChange != null && (
            <span className="impact-tooltip-change">
              {" "}
              {dayChange >= 0 ? "▲" : "▼"}
              {Math.abs(dayChange)}% d/d
            </span>
          )}
        </TooltipRow>
      )}
      {point.rate != null && (
        <TooltipRow dot="rate-light" label="Signup rate">
          {rateLabel(point.rate)}
        </TooltipRow>
      )}
      <TooltipRow dot="page" label="Page PRs">
        {point.pageMerges ?? 0}
      </TooltipRow>
      <TooltipRow dot="other" label="Other PRs">
        {point.otherMerges ?? 0}
      </TooltipRow>
      {point.merges != null && point.merges > 0 && (
        <div className="impact-tooltip-hint">Click to see which PRs merged →</div>
      )}
      {sampleNote && <div className="impact-tooltip-note">{sampleNote}</div>}
    </div>
  );
}

/** Vertical hover guide at the centre of the active day's band. */
function DayGuide(props: { x?: number; y?: number; width?: number; height?: number }) {
  const { x = 0, y = 0, width = 0, height = 0 } = props;
  const cx = x + width / 2;
  return <line x1={cx} x2={cx} y1={y} y2={y + height} stroke="var(--chart-guide)" strokeWidth={1} />;
}

const isWeekend = (iso: string) => {
  const day = new Date(`${iso}T12:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
};

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
  title,
  footnote,
}: {
  points: ImpactPoint[];
  mergeDays: MergeDay[];
  sampleNote?: string;
  /** Today's date; its partial signup count is left out of the trend fit. */
  today?: string;
  title: string;
  /** Source notes rendered under the legend. */
  footnote?: ReactNode;
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
  // only the drawn line is clamped (a steep fall can extrapolate below zero
  // at today's edge); the legend slope is the raw fit
  const [view, setView] = useState<"all" | "page">("all");
  const points: ChartPoint[] = visible.map((p, i) => {
    const t = trend.values[i];
    return {
      ...p,
      signupTrend: t == null ? null : Math.max(0, t),
      barTotal: view === "all" ? (p.merges ?? 0) : (p.pageMerges ?? 0),
    };
  });
  const previousSignups = new Map(
    allPoints.map((p, i) => [p.date, i > 0 ? allPoints[i - 1].signups : null]),
  );
  const weekendDays = points.filter((p) => isWeekend(p.date)).map((p) => p.date);
  // weekend shading only reads at day-level zoom
  const shadeWeekends = points.length <= 31;
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
  const selectedDay = mergeDays.find((d) => d.date === selectedDate) ?? null;
  const selectedPoint = points.find((p) => p.date === selectedDate) ?? null;

  const toggleDay = (date: unknown) => {
    if (typeof date === "string") {
      setSelectedDate((current) => (current === date ? null : date));
    }
  };
  const handleDayClick = (state: { activeLabel?: string | number | null } | null) =>
    toggleDay(state?.activeLabel);
  // recharts moves the active day with the arrow keys and uses Enter to hide
  // its tooltip; capture Enter/Space first so they open the day instead
  const summaryId = useId();
  const gradientId = `${summaryId.replace(/:/g, "")}-area`;
  const activeDay = useRef<string | null>(null);
  const handleDayKey = (event: KeyboardEvent<HTMLDivElement>) => {
    if ((event.key === "Enter" || event.key === " ") && activeDay.current) {
      event.preventDefault();
      event.stopPropagation();
      toggleDay(activeDay.current);
    }
  };

  return (
    <section className="card impact-chart" aria-labelledby={`${summaryId}-title`}>
      <div className="impact-chart-head">
        <div className="impact-chart-title">
          <h2 className="h2" id={`${summaryId}-title`}>
            {title}
          </h2>
          <p className="impact-chart-dek">
            Signups and signup rate against merged PRs, to see what correlated.
            {range.from && ` ${dayLabel(range.from)} – ${dayLabel(range.to)}.`}
          </p>
        </div>
        <div className="impact-chart-controls">
          <div className="seg" role="group" aria-label="Date range">
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
          <div className="seg" role="group" aria-label="Merge view">
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
      </div>
      {preset === "custom" && (
        <div className="impact-range-inputs">
          <label>
            <span>From</span>
            <input
              type="date"
              value={customFrom}
              min={firstDate}
              max={customTo || lastDate}
              onChange={(e) => setCustomFrom(e.target.value)}
            />
          </label>
          <label>
            <span>To</span>
            <input
              type="date"
              value={customTo}
              min={customFrom || firstDate}
              max={lastDate}
              onChange={(e) => setCustomTo(e.target.value)}
            />
          </label>
        </div>
      )}
      {points.length === 0 && (
        <p className="empty-message">No data in this date range.</p>
      )}
      {points.length > 0 && (
        <div
          className="impact-plot"
          role="figure"
          aria-label="Signups and merged PRs by day"
          aria-describedby={summaryId}
          onKeyDownCapture={handleDayKey}
        >
          <p id={summaryId} className="sr-only">
            {chartSummary} Use the arrow keys to move between days, and Enter or
            Space to list that day&apos;s PRs.
          </p>
          <div className="impact-axis-captions" aria-hidden="true">
            <span>Signups / day</span>
            <span>Signup rate</span>
          </div>
          <ResponsiveContainer width="100%" height={320}>
            <ComposedChart
              data={points}
              margin={{ top: 8, right: 8, bottom: 0, left: -8 }}
              barCategoryGap="30%"
              onClick={handleDayClick}
              style={{ cursor: "pointer" }}
            >
              <TrackActiveDay into={activeDay} />
              <defs>
                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="var(--success)" stopOpacity={0.15} />
                  <stop offset="1" stopColor="var(--success)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--chart-grid)" vertical={false} />
              {shadeWeekends &&
                weekendDays.map((date, i) => (
                  <ReferenceArea
                    key={date}
                    yAxisId="signups"
                    x1={date}
                    x2={date}
                    fill="var(--chart-weekend)"
                    fillOpacity={1}
                    stroke="none"
                    ifOverflow="extendDomain"
                    label={
                      i === 0 || !isWeekend(shiftDay(date, -1))
                        ? {
                            value: "WEEKEND",
                            position: "insideTopLeft",
                            fill: "var(--cream)",
                            fontSize: 10,
                            fontWeight: 800,
                            letterSpacing: 1,
                          }
                        : undefined
                    }
                  />
                ))}
              <XAxis
                dataKey="date"
                tickFormatter={tickLabel}
                tick={{ fontSize: 11, fontWeight: 600, fill: "var(--muted)" }}
                tickLine={false}
                axisLine={{ stroke: "var(--border)" }}
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
              <Tooltip
                cursor={<DayGuide />}
                content={
                  <ImpactTooltip
                    sampleNote={sampleNote}
                    today={today}
                    previous={previousSignups}
                  />
                }
              />
              <Bar
                yAxisId="merges"
                dataKey="pageMerges"
                stackId="merges"
                name="Page-touching PRs"
                fill="var(--pr-page)"
                radius={view === "all" ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                maxBarSize={28}
                isAnimationActive={false}
              >
                {view === "page" && <BarTotals />}
              </Bar>
              {view === "all" && (
                <Bar
                  yAxisId="merges"
                  dataKey="otherMerges"
                  stackId="merges"
                  name="Other PRs"
                  fill="var(--dusty)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={28}
                  isAnimationActive={false}
                >
                  <BarTotals />
                </Bar>
              )}
              <Area
                yAxisId="signups"
                type="monotone"
                dataKey="signups"
                name="Signups"
                stroke="var(--success)"
                strokeWidth={2.5}
                fill={`url(#${gradientId})`}
                fillOpacity={1}
                activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
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
                stroke="var(--brand-purple)"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, stroke: "#fff", strokeWidth: 2 }}
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
            <span className="impact-dash impact-dash-signups" aria-hidden="true" /> Signups
          </span>
          <span className="impact-legend-item">
            <span className="impact-dash impact-dash-trend" aria-hidden="true" />
            <span aria-hidden="true">{trendLabel(trend.slope, trend.n)}</span>
            <span className="sr-only">{trendLabel(trend.slope, trend.n, true)}</span>
          </span>
          <span className="impact-legend-item">
            <span className="impact-dash impact-dash-rate" aria-hidden="true" /> Signup rate
            (signups ÷ traffic)
          </span>
          <span className="impact-legend-item">
            <span className="impact-swatch impact-swatch-page" aria-hidden="true" /> Page-touching PRs
          </span>
          {view === "all" && (
            <span className="impact-legend-item">
              <span className="impact-swatch impact-swatch-other" aria-hidden="true" /> Other PRs
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
      {footnote && <div className="impact-chart-footnote">{footnote}</div>}
    </section>
  );
}

const shiftDay = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Total merged PRs above the top bar segment; hidden on days with none. */
function BarTotals() {
  return (
    <LabelList
      dataKey="barTotal"
      position="top"
      offset={6}
      fill="var(--pr-page-text)"
      fontSize={11}
      fontWeight={800}
      formatter={(value: unknown) => (typeof value === "number" && value > 0 ? value : "")}
    />
  );
}
