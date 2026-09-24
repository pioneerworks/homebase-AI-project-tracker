import type { SignupDay } from "@/lib/signup-data";

export type DailySignupSummary = {
  /** Last complete day in the series (today is partial and skipped) */
  date: string;
  signups: number;
  rate: number | null;
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

function shiftDate(date: string, days: number): string {
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
    prevDay: pick(shiftDate(latest.date, -1)),
    lastWeek: pick(shiftDate(latest.date, -7)),
  };
}

/** Percent change, or null when there is no usable baseline. */
export function pctChange(current: number, baseline: number | null | undefined): number | null {
  if (baseline == null || baseline === 0) return null;
  return (current / baseline - 1) * 100;
}
