import type { CalendarRow, ExperimentsPage } from "@/lib/experiments-types";

/**
 * Six-week test calendar: one 42-day track per experiment, week rules every
 * 7 days, a Today line at (today − start) / 42, and a bar clamped to the
 * window. Draft/unscheduled rows render italic text instead of a bar. All
 * dates are UTC-only so server and client render identically.
 */

const DAY_MS = 86400000;
const WINDOW_DAYS = 42;
const WEEKS = 6;

function parseDay(date: string): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function shortDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export default function TestCalendar({
  calendar,
  today,
}: {
  calendar: ExperimentsPage["calendar"];
  today: string;
}) {
  const startMs = parseDay(calendar.start);
  const todayOffset = Math.round((parseDay(today) - startMs) / DAY_MS);
  const hasToday = todayOffset >= 0 && todayOffset <= WINDOW_DAYS;
  const todayPct = (Math.min(Math.max(todayOffset, 0), WINDOW_DAYS) / WINDOW_DAYS) * 100;

  return (
    <section className="exp-cal" aria-labelledby="exp-cal-title">
      <div className="exp-cal-head">
        <div className="exp-cal-titleblock">
          <h2 className="exp-cal-title" id="exp-cal-title">
            Test calendar
          </h2>
          <p className="exp-cal-sub">28-day windows on shared traffic.</p>
        </div>
        <div className="exp-cal-legend">
          <span className="exp-cal-legend-item">
            <span className="exp-cal-swatch exp-cal-swatch-live" aria-hidden="true" />
            Live
          </span>
          <span className="exp-cal-legend-item">
            <span className="exp-cal-swatch exp-cal-swatch-losing" aria-hidden="true" />
            Losing
          </span>
          <span className="exp-cal-legend-item">
            <span className="exp-cal-swatch exp-cal-swatch-queued" aria-hidden="true" />
            Queued
          </span>
          <span className="exp-cal-legend-item">
            <span className="exp-cal-swatch exp-cal-swatch-today" aria-hidden="true" />
            | Today
          </span>
        </div>
      </div>

      <div className="exp-cal-body">
        <div className="exp-cal-grid" aria-hidden="true">
          <span className="exp-cal-labelspacer" />
          <div className="exp-cal-weeks">
            {calendar.weeks.slice(0, WEEKS).map((week, index) => (
              <span key={index} className="exp-cal-week">
                {shortDay(week)}
              </span>
            ))}
          </div>
        </div>

        {calendar.rows.map((row) => (
          <CalendarRowView
            key={row.id}
            row={row}
            startMs={startMs}
            todayPct={hasToday ? todayPct : null}
          />
        ))}
      </div>
    </section>
  );
}

function CalendarRowView({
  row,
  startMs,
  todayPct,
}: {
  row: CalendarRow;
  startMs: number;
  todayPct: number | null;
}) {
  // Bar position in days from the window start, clamped to the 42-day window
  // (end is inclusive, like the design's Sep 24 + 28 days = Oct 21 bar).
  const leftDays = row.start != null ? (parseDay(row.start) - startMs) / DAY_MS : null;
  const endDays =
    row.start != null && row.end != null ? (parseDay(row.end) - startMs) / DAY_MS + 1 : null;
  const left = leftDays != null ? Math.max(0, leftDays) : null;
  const right = endDays != null ? Math.min(WINDOW_DAYS, endDays) : null;
  const width = left != null && right != null ? right - left : null;
  const showBar = width != null && width > 0 && row.start != null;

  return (
    <div className="exp-cal-row">
      <div className="exp-cal-label">
        <span className="exp-cal-name">{row.label}</span>
        <span className="exp-cal-status">{row.sub}</span>
      </div>
      <div className="exp-cal-track">
        {[1, 2, 3, 4, 5].map((week) => (
          <span
            key={week}
            className="exp-cal-rule"
            style={{ left: `${(week / WEEKS) * 100}%` }}
            aria-hidden="true"
          />
        ))}
        {showBar ? (
          <div
            className={`exp-cal-bar exp-cal-bar-${row.tone}`}
            style={{
              left: `${((left ?? 0) / WINDOW_DAYS) * 100}%`,
              width: `${(width / WINDOW_DAYS) * 100}%`,
            }}
          >
            {row.barLabel}
          </div>
        ) : (
          <span className={row.start != null ? "exp-cal-offwindow" : "exp-cal-unscheduled"}>
            {row.barLabel}
          </span>
        )}
        {todayPct != null ? (
          <span className="exp-cal-today" style={{ left: `${todayPct}%` }} aria-hidden="true" />
        ) : null}
      </div>
    </div>
  );
}
