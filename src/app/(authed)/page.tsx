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

function DeltaCell({
  label,
  delta,
  detail,
  value,
}: {
  label: string;
  delta: number | null;
  detail: string | null;
  value?: string;
}) {
  return (
    <div className="metric">
      <span className="metric-label">{label}</span>
      <span
        className={`metric-value${delta == null ? "" : delta >= 0 ? " metric-up" : " metric-down"}`}
      >
        {value ?? (delta == null ? "—" : `${delta >= 0 ? "▲" : "▼"} ${Math.abs(delta).toFixed(1)}%`)}
      </span>
      <span className="metric-delta">{detail ?? "no data for that day"}</span>
    </div>
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

      {daily && (
        <section className="section standup" aria-label="Daily signups for standup">
          <div className="section-head">
            <h2>Signups · {formatDay(daily.date)}</h2>
            <span className="standup-caveat">
              Definition: Page Viewed → <code>{signupEvent}</code> funnel in Amplitude, unique users.
              {!dailyIsYesterday &&
                " Latest complete day in the data; the live feed is behind."}
            </span>
          </div>
          <div className="metric-band standup-band">
            <div className="metric">
              <span className="metric-label">
                {dailyIsYesterday ? "Signups yesterday" : "Signups"}
              </span>
              <span className="metric-value">{daily.signups}</span>
              <span className="metric-delta">
                {daily.rate != null
                  ? `${(daily.rate * 100).toFixed(2)}% of site traffic`
                  : "traffic not captured"}
              </span>
            </div>
            <DeltaCell
              label="vs day before"
              delta={dayDelta}
              detail={daily.prevDay && `${daily.prevDay.signups} on ${formatDay(daily.prevDay.date)}`}
            />
            <DeltaCell
              label="vs same day last week"
              delta={weekDelta}
              detail={daily.lastWeek && `${daily.lastWeek.signups} on ${formatDay(daily.lastWeek.date)}`}
            />
            <DeltaCell
              label="Site traffic"
              delta={null}
              value={daily.traffic > 0 ? daily.traffic.toLocaleString("en-US") : "—"}
              detail={daily.traffic > 0 ? "unique visitors that day" : "traffic not captured"}
            />
          </div>
        </section>
      )}

      <section className="metric-band metric-band-five" aria-label="Last 7 days vs previous 7 days">
        <div className="metric">
          <span className="metric-label">Signups / day (7d avg)</span>
          <span className="metric-value">{avg(last7).toFixed(0)}</span>
          <span
            className={`metric-delta ${signupDelta >= 0 ? "metric-up" : "metric-down"}`}
          >
            {signupDelta >= 0 ? "▲" : "▼"} {Math.abs(signupDelta).toFixed(1)}% vs prior 7d
          </span>
        </div>
        <div className="metric">
          <span className="metric-label">Signup rate (7d avg)</span>
          <span className="metric-value">{(rateAvg(last7) * 100).toFixed(2)}%</span>
          <span
            className={`metric-delta ${rateDelta >= 0 ? "metric-up" : "metric-down"}`}
          >
            {rateDelta >= 0 ? "▲" : "▼"} {Math.abs(rateDelta).toFixed(2)}pp vs prior 7d
          </span>
        </div>
        <div className="metric">
          <span className="metric-label">PRs merged (7d)</span>
          <span className="metric-value">{mergesLast7}</span>
          <span className="metric-delta">
            {stats.total} total since {stats.firstMergeDay}
          </span>
        </div>
        <div className="metric">
          <span className="metric-label">Page-touching PRs (7d)</span>
          <span className="metric-value">{pageMergesLast7}</span>
          <span className="metric-delta">
            {mergesLast7 - pageMergesLast7} infra · of {mergesLast7} merged (7d)
          </span>
        </div>
        <div className="metric">
          <span className="metric-label">Active projects</span>
          <span className="metric-value">{TRACKER_PROJECTS.length}</span>
          <span className="metric-delta">tracked in Linear</span>
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
          ) — orange is PRs that touch a page (design, copy, or a route), gray
          is infrastructure. Click a bar to see exactly which PRs merged that
          day and how each was classified. An explicit{" "}
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
