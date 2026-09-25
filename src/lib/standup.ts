import type { SignupDay } from "@/lib/signup-data";

export type DailySignupSummary = {
  /** Last complete day in the series (today is partial and skipped) */
  date: string;
  signups: number;
  rate: number | null;
  traffic: number;
  /** Previous calendar day in the series */
  prevDay: { date: string; signups: number } | null;
  /** Same weekday one week earlier, the fair comparison for a weekly cycle */
  lastWeek: { date: string; signups: number } | null;
};

/** Today's date (YYYY-MM-DD) on the Toronto calendar, like the recaps. */
export function torontoToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function shiftDate(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function dailySignupSummary(
  days: SignupDay[],
  today: string,
): DailySignupSummary | null {
  const complete = days.filter((d) => d.date < today);
  const latest = complete.at(-1);
  if (!latest) return null;
  const byDate = new Map(complete.map((d) => [d.date, d]));
  const pick = (date: string) => {
    const day = byDate.get(date);
    return day ? { date, signups: day.signups } : null;
  };
  return {
    date: latest.date,
    signups: latest.signups,
    rate: latest.rate,
    traffic: latest.traffic,
    prevDay: pick(shiftDate(latest.date, -1)),
    lastWeek: pick(shiftDate(latest.date, -7)),
  };
}

/** Percent change, or null when there is no usable baseline. */
export function pctChange(current: number, baseline: number | null | undefined): number | null {
  if (baseline == null || baseline === 0) return null;
  return (current / baseline - 1) * 100;
}

export type LinearTrend = {
  /** Fitted value per position; null where the input is null or no fit exists. */
  values: (number | null)[];
  /** Change per position (per day for a daily series); null when there is no fit. */
  slope: number | null;
  /** Number of points the fit used. */
  n: number;
};

/**
 * Least-squares linear trend of `values` over their positions. Positions are
 * array indexes, so the series must have one entry per day. Positions that
 * `exclude` rejects are left out of the fit but still get a fitted value.
 * Needs at least two points to fit.
 */
export function linearTrend(
  values: (number | null)[],
  exclude: (index: number) => boolean = () => false,
): LinearTrend {
  const fitted = values
    .map((y, x) => ({ x, y }))
    .filter((p): p is { x: number; y: number } => p.y != null && !exclude(p.x));
  const n = fitted.length;
  if (n < 2) return { values: values.map(() => null), slope: null, n };
  const meanX = fitted.reduce((s, p) => s + p.x, 0) / n;
  const meanY = fitted.reduce((s, p) => s + p.y, 0) / n;
  const sxx = fitted.reduce((s, p) => s + (p.x - meanX) ** 2, 0);
  const sxy = fitted.reduce((s, p) => s + (p.x - meanX) * (p.y - meanY), 0);
  const slope = sxx === 0 ? 0 : sxy / sxx;
  return {
    values: values.map((y, x) => (y == null ? null : meanY + slope * (x - meanX))),
    slope,
    n,
  };
}

// Below two weeks the weekday/weekend cycle dominates a straight-line fit.
const SHORT_FIT_DAYS = 14;

/** Legend/summary text for a signup trend; `spoken` swaps arrows for words. */
export function trendLabel(slope: number | null, n: number, spoken = false): string {
  if (slope == null) return "Signup trend: not enough days to fit";
  const rounded = Math.round(slope * 10) / 10;
  const magnitude = `${Math.abs(rounded).toFixed(1)}/day`;
  let direction: string;
  if (rounded > 0) direction = spoken ? "rising " : "▲ +";
  else if (rounded < 0) direction = spoken ? "falling " : "▼ −";
  else direction = spoken ? "flat at " : "▶ ±";
  const caveat = n < SHORT_FIT_DAYS ? "; weekends skew it" : "";
  return `Signup trend: ${direction}${magnitude} (${n}-day fit${caveat})`;
}

export type RangePreset = "7d" | "30d" | "90d" | "all" | "custom";

/** Inclusive date window for a chart preset, anchored on the latest data point. */
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
