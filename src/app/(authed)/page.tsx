import ImpactChart, { type ImpactPoint } from "@/components/impact-chart";
import { amplitudeConfig } from "@/lib/amplitude";
import HealthPill from "@/components/health-pill";
import { getProjectOverview, nextMilestone } from "@/lib/linear-projects";
import { getMergeDays, mergeStats, pageTouchCount } from "@/lib/merges";
import { dailySignupSummary, pctChange, shiftDate, torontoToday } from "@/lib/standup";
import { getSignupSeries } from "@/lib/omni";
import { getSessionUser } from "@/lib/oidc-session";
import { TRACKER_PROJECTS } from "@/lib/tracker-projects";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

const MERGE_REPO = "marketing-site-payload";
// Chart window: Owner Account Created was first tracked Jun 26 2026; the
// first full day is Jun 27
const CHART_START = "2026-06-27";

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function weekdayOf(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    timeZone: "UTC",
  });
}

function Delta({
  value,
  unit = "%",
  digits = 1,
}: {
  value: number | null;
  unit?: string;
  digits?: number;
}) {
  if (value == null) return <span className="metric-change">—</span>;
  const up = value >= 0;
  return (
    <span className={`metric-change ${up ? "metric-up" : "metric-down"}`}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      <span className="sr-only">{up ? "up" : "down"}</span> {Math.abs(value).toFixed(digits)}
      {unit}
    </span>
  );
}

export default async function OverviewPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?callbackUrl=/");

  const [{ days: mergeDayList, source: mergeSource }, signupSeries, overviews] =
    await Promise.all([
      getMergeDays(MERGE_REPO),
      getSignupSeries(),
      Promise.all(
        TRACKER_PROJECTS.map((p) =>
          getProjectOverview(p.linearSlugId, p.key).catch((error) => {
            console.log(
              `[overview] Linear fetch failed for ${p.key}:`,
              error instanceof Error ? error.message : error,
            );
            return null;
          }),
        ),
      ),
    ]);
  const signupEvent = amplitudeConfig()?.signupEvent ?? "Owner Account Created";
  const daily = dailySignupSummary(signupSeries.days, torontoToday());
  const dayDelta = daily ? pctChange(daily.signups, daily.prevDay?.signups) : null;
  const weekDelta = daily ? pctChange(daily.signups, daily.lastWeek?.signups) : null;
  const dailyIsYesterday = daily?.date === shiftDate(torontoToday(), -1);

  const mergesByDay = new Map(mergeDayList.map((d) => [d.date, d.count]));
  const pageMergesByDay = new Map(
    mergeDayList.map((d) => [d.date, pageTouchCount(d.prs)]),
  );

  // align both series on the signup calendar, from CHART_START
  const points: ImpactPoint[] = signupSeries.days
    .filter((s) => s.date >= CHART_START)
    .map((s) => {
      const merges = mergesByDay.get(s.date) ?? 0;
      const pageMerges = pageMergesByDay.get(s.date) ?? 0;
      return {
        date: s.date,
        signups: s.signups,
        rate: s.rate,
        merges,
        pageMerges,
        otherMerges: merges - pageMerges,
      };
    });

  const stats = mergeStats(mergeDayList);
  // signup averages use complete days only, so today's partial count can't drag them down
  const completePoints = points.filter((p) => p.date < torontoToday());
  const last7 = completePoints.slice(-7);
  const prev7 = completePoints.slice(-14, -7);
  const avg = (rows: ImpactPoint[]) =>
    rows.length ? rows.reduce((s, r) => s + (r.signups ?? 0), 0) / rows.length : 0;
  const rateAvg = (rows: ImpactPoint[]) =>
    rows.length ? rows.reduce((s, r) => s + (r.rate ?? 0), 0) / rows.length : 0;
  const signupDelta = prev7.length ? (avg(last7) / avg(prev7) - 1) * 100 : 0;
  const rateDelta = prev7.length ? (rateAvg(last7) - rateAvg(prev7)) * 100 : 0;
  const mergesLast7 = last7.reduce((s, r) => s + (r.merges ?? 0), 0);
  const pageMergesLast7 = last7.reduce((s, r) => s + (r.pageMerges ?? 0), 0);

  return (
    <div className="page">
      <header className="hero">
        <p className="hero-eyebrow">AI team · all projects</p>
        <h1>Impact overview</h1>
        <p className="hero-copy">
          What the AI team shipped — and what it did to signups. Merge activity
          from <strong>{MERGE_REPO}</strong> overlaid on signup volume and
          conversion.
        </p>
      </header>

      <section className="section standup" aria-label="Signups">
        <div className="section-head">
          <h2>Signups</h2>
          {daily && !dailyIsYesterday && (
            <span className="standup-stale">
              Latest complete day is {formatDay(daily.date)}; the live feed is behind
            </span>
          )}
        </div>
        <div className="metric-band standup-band">
          {daily && (
            <>
              <div className="metric">
                <span className="metric-label">
                  {dailyIsYesterday ? "Yesterday" : formatDay(daily.date)}
                </span>
                <span className="metric-value">{daily.signups.toLocaleString("en-US")}</span>
                <span className="metric-delta">
                  <Delta value={weekDelta} /> vs {daily.lastWeek ? `${daily.lastWeek.signups} last ${weekdayOf(daily.lastWeek.date)}` : "last week"}
                </span>
                <span className="metric-delta metric-delta-quiet">
                  <Delta value={dayDelta} /> vs {daily.prevDay ? `${daily.prevDay.signups} the day before` : "the day before"}
                </span>
              </div>
              <div className="metric">
                <span className="metric-label">Signup rate · {dailyIsYesterday ? "yesterday" : "that day"}</span>
                <span className="metric-value">
                  {daily.rate != null ? `${(daily.rate * 100).toFixed(2)}%` : "—"}
                </span>
                <span className="metric-delta">
                  {daily.traffic > 0
                    ? `of ${daily.traffic.toLocaleString("en-US")} unique visitors`
                    : "traffic not captured"}
                </span>
              </div>
            </>
          )}
          <div className="metric">
            <span className="metric-label">Signups / day · last 7 days</span>
            <span className="metric-value">{avg(last7).toFixed(0)}</span>
            <span className="metric-delta">
              <Delta value={prev7.length ? signupDelta : null} /> vs prior 7 days
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">Signup rate · last 7 days</span>
            <span className="metric-value">{(rateAvg(last7) * 100).toFixed(2)}%</span>
            <span className="metric-delta">
              <Delta value={prev7.length ? rateDelta : null} unit="pp" digits={2} /> vs prior 7 days
            </span>
          </div>
        </div>
        <p className="section-note">
          Unique users who viewed a migrated page (Page Viewed) and then fired{" "}
          <code>{signupEvent}</code>, from Amplitude. Rate = signups ÷ unique visitors.
          Day-over-day swings follow the weekday cycle, so the headline compares
          against the same weekday last week.
        </p>
      </section>

      <section className="section" aria-label="Shipped work">
        <div className="section-head">
          <h2>Shipped · last 7 days</h2>
        </div>
        <div className="metric-band metric-band-three">
          <div className="metric">
            <span className="metric-label">PRs merged</span>
            <span className="metric-value">{mergesLast7}</span>
            <span className="metric-delta">
              {stats.total.toLocaleString("en-US")} total
              {stats.firstMergeDay ? ` since ${formatDay(stats.firstMergeDay)}` : ""}
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">Touched a page</span>
            <span className="metric-value">{pageMergesLast7}</span>
            <span className="metric-delta">
              {mergesLast7 ? `${Math.round((pageMergesLast7 / mergesLast7) * 100)}% of merged PRs` : "no merges"}
              {" "}· design, copy, or a route
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">Infrastructure</span>
            <span className="metric-value">{mergesLast7 - pageMergesLast7}</span>
            <span className="metric-delta">no visitor-facing change</span>
          </div>
        </div>
      </section>

      <section className="section" aria-label="Impact chart">
        <div className="section-head">
          <h2>Shipped work vs signups</h2>
        </div>
        <ImpactChart points={points} mergeDays={mergeDayList} today={torontoToday()} />
        <p className="section-note">
          Bars show merged PRs per day from {MERGE_REPO} (
          {mergeSource === "github" ? "live from GitHub" : "seeded snapshot"}
          ) on their own scale — orange is PRs that touch a page (design, copy,
          or a route), gray is infrastructure. Click a day to see exactly which
          PRs merged and how each was classified. An explicit{" "}
          <code>page-touch</code> or <code>infra</code> GitHub label overrides
          the heuristic.
          {signupSeries.source === "amplitude"
            ? ` Signups (${signupEvent}) and traffic are live from the Amplitude Export API (unique users); days before the live window come from the captured snapshot. Live days count users with a qualifying Page Viewed and the signup event on the same day. Signup rate = signups ÷ traffic.`
            : signupSeries.source === "omni"
              ? " Signups are live from Omni."
              : " Signups and traffic come from the Amplitude funnel (Page Viewed with product_area mw_ → Owner Account Created, unique users, captured via Amplitude MCP). Owner Account Created was first tracked on Jun 26, so the series starts Jun 27, its first full day. Signup rate = signups ÷ traffic."}
        </p>
      </section>

      <section className="section" aria-label="Projects">
        <div className="section-head">
          <h2>Active projects</h2>
        </div>
        <div className="project-grid">
          {TRACKER_PROJECTS.map((p, index) => {
            const overview = overviews[index];
            const next = overview ? nextMilestone(overview.milestones) : null;
            const overdue = Boolean(
              next?.targetDate && next.targetDate < torontoToday(),
            );
            return (
              <Link key={p.key} className="project-card" href={`/projects/${p.key}`}>
                <span className="project-card-top">
                  <span className="project-card-name">{p.name}</span>
                  {overview && <HealthPill health={overview.health} />}
                </span>
                <span className="project-card-purpose">{p.shortPurpose}</span>
                {overview && (
                  <span className={`project-card-next${overdue ? " project-card-overdue" : ""}`}>
                    {next ? (
                      <>
                        Next: <strong>{next.name}</strong> · {next.progress}%
                        {next.targetDate
                          ? ` · due ${formatDay(next.targetDate)}${overdue ? " (overdue)" : ""}`
                          : " · no due date"}
                      </>
                    ) : overview.milestones.length ? (
                      "All milestones complete"
                    ) : (
                      "No milestones set in Linear"
                    )}
                  </span>
                )}
                <span className="project-card-meta">
                  {overview
                    ? `${overview.lead ?? "No lead"} · ${overview.counts.completionPct}% of issues done`
                    : "Linear data unavailable"}
                </span>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
