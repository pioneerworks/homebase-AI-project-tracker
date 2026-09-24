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
