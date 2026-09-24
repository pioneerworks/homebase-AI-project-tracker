import ImpactChart, { type ImpactPoint } from "@/components/impact-chart";
import { amplitudeConfig } from "@/lib/amplitude";
import { getMergeDays, mergeStats, pageTouchCount } from "@/lib/merges";
import { getSignupSeries } from "@/lib/omni";
import { getSessionUser } from "@/lib/oidc-session";
import { TRACKER_PROJECTS } from "@/lib/tracker-projects";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

const MERGE_REPO = "marketing-site-payload";
// Chart window: Jun 1 2026 onward
const CHART_START = "2026-06-01";

export default async function OverviewPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?callbackUrl=/");

  const [{ days: mergeDayList, source: mergeSource }, signupSeries] =
    await Promise.all([getMergeDays(MERGE_REPO), getSignupSeries()]);
  const signupEvent = amplitudeConfig()?.signupEvent;

  const mergesByDay = new Map(mergeDayList.map((d) => [d.date, d.count]));
  const pageMergesByDay = new Map(
    mergeDayList.map((d) => [d.date, pageTouchCount(d.prs)]),
  );

  // align both series on the signup calendar, chart window starts Jun 1 2026
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
  const last7 = points.slice(-7);
  const prev7 = points.slice(-14, -7);
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
        <ImpactChart points={points} mergeDays={mergeDayList} />
        <p className="section-note">
          Bars show merged PRs per day from {MERGE_REPO} (
          {mergeSource === "github" ? "live from GitHub" : "seeded snapshot"}
          ) — orange is PRs that touch a page (design, copy, or a route), gray
          is infrastructure. Click a bar to see exactly which PRs merged that
          day and how each was classified. An explicit{" "}
          <code>page-touch</code> or <code>infra</code> GitHub label overrides
          the heuristic.
          {signupSeries.source === "amplitude"
            ? ` Signups (${signupEvent}) and traffic are live from the Amplitude Export API (unique users); days before the live window come from the captured snapshot, which counts Owner Sign Up. Signup rate = signups ÷ traffic.`
            : signupSeries.source === "omni"
              ? " Signups are live from Omni."
              : " Signups and traffic are real Amplitude data (unique users, captured via Amplitude MCP; signups count Owner Sign Up). Signup rate = signups ÷ traffic."}
        </p>
      </section>

      <section className="section" aria-label="Projects">
        <div className="section-head">
          <h2>Active projects</h2>
        </div>
        <div className="project-grid">
          {TRACKER_PROJECTS.map((p) => (
            <Link key={p.key} className="project-card" href={`/projects/${p.key}`}>
              <span className="project-card-name">{p.name}</span>
              <span className="project-card-purpose">{p.shortPurpose}</span>
              <span className="project-card-meta">
                Linear · {p.repos.length} repo{p.repos.length > 1 ? "s" : ""} tracked
              </span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
