import ImpactChart, { type ImpactPoint } from "@/components/impact-chart";
import ProjectTable, { type ProjectRow } from "@/components/project-table";
import { amplitudeConfig } from "@/lib/amplitude";
import { nextMilestone } from "@/lib/linear-projects";
import { getMergeDays, mergeStats, pageTouchCount } from "@/lib/merges";
import { dailySignupSummary, pctChange, shiftDate, torontoToday } from "@/lib/standup";
import { getSignupSeries } from "@/lib/omni";
import { getSessionUser } from "@/lib/oidc-session";
import {
  attentionItems,
  attentionSummary,
  DONE_STATE,
  formatPValue,
  projectState,
  type AttentionItem,
} from "@/lib/overview";
import { getRunningExperiments, type ExperimentCard } from "@/lib/statsig";
import { getTrackerOverviews } from "@/lib/tracker-overviews";
import { DONE_PROJECTS, TRACKER_PROJECTS } from "@/lib/tracker-projects";
import {
  ArrowUpRight,
  CalendarX,
  CircleCheck,
  FlaskConical,
  TriangleAlert,
} from "lucide-react";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

const MERGE_REPO = "marketing-site-payload";
// Chart window: Owner Account Created was first tracked Jun 26 2026; the
// first full day is Jun 27
const CHART_START = "2026-06-27";
// The marketing site migration shipped (Payload cutover) on Jul 15 2026.
const MIGRATION_SHIPPED = "2026-07-15";
const STATSIG_CONSOLE = "https://console.statsig.com";

function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function shortDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString("en-US", {
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

/** "Sep 21–27", or "Sep 29–Oct 5" across a month boundary. */
function weekLabel(from: string, to: string): string {
  const sameMonth = from.slice(0, 7) === to.slice(0, 7);
  const end = sameMonth ? String(Number(to.slice(8, 10))) : shortDay(to);
  return `${shortDay(from)}–${end}`;
}

type Dir = "up" | "down" | "flat";

function Delta({
  value,
  unit = "%",
  digits = 1,
}: {
  value: number | null;
  unit?: string;
  digits?: number;
}) {
  if (value == null || value === 0) return <b className="flat">—</b>;
  const up = value >= 0;
  return (
    <b className={up ? "up" : "down"}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      <span className="sr-only">{up ? "up" : "down"}</span> {Math.abs(value).toFixed(digits)}
      {unit}
    </b>
  );
}

const dirOf = (value: number | null): Dir =>
  value == null || value === 0 ? "flat" : value > 0 ? "up" : "down";

function Spark({ values, dir }: { values: number[]; dir: Dir }) {
  const max = Math.max(0, ...values) || 1;
  return (
    <span className="spark" aria-hidden="true">
      {values.map((v, i) => (
        <span
          key={i}
          className={i === values.length - 1 ? `spark-last spark-${dir}` : undefined}
          style={{ height: `${Math.max(3, Math.round((32 * v) / max))}px` }}
        />
      ))}
    </span>
  );
}

function Kpi({
  label,
  value,
  spark,
  dir,
  children,
}: {
  label: string;
  value: string;
  spark: number[];
  dir: Dir;
  children: React.ReactNode;
}) {
  return (
    <article className="card kpi">
      <span className="kpi-label">{label}</span>
      <span className="kpi-row">
        <span className="kpi-value">{value}</span>
        <Spark values={spark} dir={dir} />
      </span>
      <span className="kpi-delta">{children}</span>
    </article>
  );
}

function AttentionStrip({ items, summary }: { items: AttentionItem[]; summary: string }) {
  if (items.length === 0) {
    return (
      <section className="card attention attention-clear" aria-label="Needs attention">
        <span className="attention-chip attention-chip-ok">
          <CircleCheck size={18} aria-hidden="true" />
        </span>
        <span className="attention-title">Nothing needs attention</span>
      </section>
    );
  }
  return (
    <section className="card attention" aria-labelledby="attention-title">
      <div className="attention-head">
        <span className="attention-chip">
          <TriangleAlert size={18} aria-hidden="true" />
        </span>
        <div>
          <div className="attention-title" id="attention-title">
            {items.length} need{items.length === 1 ? "s" : ""} attention
          </div>
          <div className="attention-sub">{summary}</div>
        </div>
      </div>
      <ul className="alerts">
        {items.map((item) => {
          const Icon = item.kind === "experiment" ? FlaskConical : CalendarX;
          const body = (
            <>
              <span className="alert-title">
                <Icon size={14} aria-hidden="true" style={{ display: "inline" }} />
                {item.title}
              </span>
              <span className="alert-meta">{item.meta}</span>
            </>
          );
          return (
            <li key={`${item.kind}-${item.href}-${item.title}`}>
              {item.external ? (
                <a className="alert" href={item.href} target="_blank" rel="noreferrer">
                  {body}
                </a>
              ) : (
                <Link className="alert" href={item.href}>
                  {body}
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const signedPct = (value: number) =>
  `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;

function Experiment({ experiment }: { experiment: ExperimentCard }) {
  const lift = experiment.percentChange;
  const significant = experiment.significant && lift != null && experiment.verdict !== "no-signal";
  const winning = experiment.verdict === "winning";
  const liftClass = significant ? (winning ? "up" : "down") : "";
  const rates =
    experiment.controlRate != null && experiment.testRate != null
      ? `${(experiment.controlRate * 100).toFixed(2)}% → ${(experiment.testRate * 100).toFixed(2)}%`
      : "—";
  const samples =
    experiment.controlUnits != null && experiment.testUnits != null
      ? `${experiment.controlUnits.toLocaleString("en-US")} vs ${experiment.testUnits.toLocaleString("en-US")}`
      : "—";
  const metric = experiment.primaryMetric ?? "Primary metric";
  const detail =
    experiment.verdict === "no-data"
      ? "Not enough data yet"
      : significant
        ? `${formatPValue(experiment.pValue)}${
            experiment.ci
              ? ` · CI ${signedPct(experiment.ci[0])} to ${signedPct(experiment.ci[1])}`
              : ""
          }`
        : "Needs more traffic to call";
  const progress =
    experiment.day != null && experiment.durationDays
      ? Math.min(100, (experiment.day / experiment.durationDays) * 100)
      : null;
  return (
    <article className="exp">
      {experiment.permalink ? (
        <a className="exp-name" href={experiment.permalink} target="_blank" rel="noreferrer">
          {experiment.title}
        </a>
      ) : (
        <span className="exp-name">{experiment.title}</span>
      )}
      <div className="exp-lift">
        <strong className={liftClass}>{lift == null ? "—" : signedPct(lift)}</strong>
        {significant ? (
          <span className={`pill ${winning ? "pill-onTrack" : "pill-overdue"}`}>
            Significant {winning ? "win" : "loss"}
          </span>
        ) : (
          <span className="pill pill-none">
            {experiment.verdict === "no-data" ? "No data yet" : "Not yet significant"}
          </span>
        )}
      </div>
      <div className="exp-metric">
        {metric} · {detail}
      </div>
      <dl className="exp-stats">
        <div>
          <dt>Control → test</dt>
          <dd>{rates}</dd>
        </div>
        <div>
          <dt>Samples</dt>
          <dd>{samples}</dd>
        </div>
      </dl>
      <div className="exp-progress">
        <span className="track">
          {progress != null && <span style={{ width: `${progress}%` }} />}
        </span>
        {experiment.day != null
          ? experiment.durationDays
            ? `Day ${experiment.day} of ${experiment.durationDays}`
            : `Day ${experiment.day}`
          : experiment.started
            ? `Started ${formatDay(experiment.started)}`
            : ""}
      </div>
    </article>
  );
}

export default async function OverviewPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?callbackUrl=/");

  const [{ days: mergeDayList, source: mergeSource }, signupSeries, runningExperiments, overviews] =
    await Promise.all([
      getMergeDays(MERGE_REPO),
      getSignupSeries(),
      getRunningExperiments().catch((error) => {
        console.log(
          "[overview] Statsig fetch failed:",
          error instanceof Error ? error.message : error,
        );
        return undefined;
      }),
      getTrackerOverviews(),
    ]);
  const today = torontoToday();
  const signupEvent = amplitudeConfig()?.signupEvent ?? "Owner Account Created";
  const daily = dailySignupSummary(signupSeries.days, today);
  const dayDelta = daily ? pctChange(daily.signups, daily.prevDay?.signups) : null;
  const weekDelta = daily ? pctChange(daily.signups, daily.lastWeek?.signups) : null;
  const dailyIsYesterday = daily?.date === shiftDate(today, -1);

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
  const trafficByDay = new Map(signupSeries.days.map((d) => [d.date, d.traffic]));

  const stats = mergeStats(mergeDayList);
  // signup averages use complete days only, so today's partial count can't drag them down
  const completePoints = points.filter((p) => p.date < today);
  const last7 = completePoints.slice(-7);
  const prev7 = completePoints.slice(-14, -7);
  const avg = (rows: ImpactPoint[]) =>
    rows.length ? rows.reduce((s, r) => s + (r.signups ?? 0), 0) / rows.length : 0;
  const rateAvg = (rows: ImpactPoint[]) =>
    rows.length ? rows.reduce((s, r) => s + (r.rate ?? 0), 0) / rows.length : 0;
  const signupDelta = prev7.length ? (avg(last7) / avg(prev7) - 1) * 100 : null;
  const rateDelta = prev7.length ? (rateAvg(last7) - rateAvg(prev7)) * 100 : null;
  const mergesLast7 = last7.reduce((s, r) => s + (r.merges ?? 0), 0);
  const pageMergesLast7 = last7.reduce((s, r) => s + (r.pageMerges ?? 0), 0);
  const visitorsLast7 = last7.reduce((s, r) => s + (trafficByDay.get(r.date) ?? 0), 0);

  // yesterday's card compares against the same weekday, so its spark shows
  // that weekday over the last seven weeks
  const sameWeekday = daily
    ? Array.from({ length: 7 }, (_, i) => shiftDate(daily.date, -7 * (6 - i)))
        .map((date) => signupSeries.days.find((d) => d.date === date)?.signups)
        .filter((v): v is number => v != null)
    : [];

  const projects = TRACKER_PROJECTS.map((p, index) => ({
    key: p.key,
    shortName: p.shortName,
    overview: overviews[index],
    state: projectState(overviews[index], today),
  }));
  const attention = attentionItems(runningExperiments ?? null, projects, formatDay);
  const attentionText = attentionSummary(attention, projects);

  const rows: ProjectRow[] = [
    ...TRACKER_PROJECTS.map((p, index): ProjectRow => {
      const overview = overviews[index];
      const next = overview ? nextMilestone(overview.milestones) : null;
      return {
        key: p.key,
        href: `/projects/${p.key}`,
        name: p.name,
        description: overview?.description || p.shortPurpose,
        owner: overview ? overview.lead : null,
        state: projects[index].state,
        available: Boolean(overview),
        milestone: next
          ? { name: next.name, progress: next.progress, due: next.targetDate }
          : overview?.milestones.length
            ? { name: "All milestones complete", progress: 100, due: null }
            : null,
        issuesDonePct: overview ? overview.counts.completionPct : null,
      };
    }),
    ...DONE_PROJECTS.map(
      (p): ProjectRow => ({
        key: p.key,
        href: p.href,
        name: p.name,
        description: p.summary,
        owner: p.lead,
        state: DONE_STATE,
        available: true,
        milestone: { name: "Complete", progress: 100, due: null, completedOn: MIGRATION_SHIPPED },
        issuesDonePct: 100,
      }),
    ),
  ];

  const weekFrom = last7[0]?.date;
  const weekTo = last7.at(-1)?.date;

  return (
    <div className="page overview">
      <header className="page-header">
        <p className="eyebrow-label">
          AI team{weekFrom && weekTo ? ` · last 7 days, ${weekLabel(weekFrom, weekTo)}` : ""}
        </p>
        <h1 className="h1">Overview</h1>
        <p className="dek">What we shipped, what it did to signups, and which projects need a hand.</p>
        {daily && !dailyIsYesterday && (
          <p className="stale-note" role="status">
            Latest complete day is {formatDay(daily.date)}; the live feed is behind.
          </p>
        )}
      </header>

      <AttentionStrip items={attention} summary={attentionText} />

      <section aria-label="Signup KPIs">
        <div className="kpis">
          {daily ? (
            <Kpi
              label={`Signups · ${dailyIsYesterday ? "yesterday" : formatDay(daily.date)}`}
              value={daily.signups.toLocaleString("en-US")}
              spark={sameWeekday}
              dir={dirOf(weekDelta)}
            >
              <Delta value={weekDelta} />
              <span>
                vs{" "}
                {daily.lastWeek
                  ? `${daily.lastWeek.signups} last ${weekdayOf(daily.lastWeek.date)}`
                  : "last week"}
              </span>
              {dayDelta != null && daily.prevDay && (
                <span className="kpi-delta-quiet">
                  {dayDelta >= 0 ? "▲" : "▼"} {Math.abs(dayDelta).toFixed(1)}% vs{" "}
                  {daily.prevDay.signups} the day before
                </span>
              )}
            </Kpi>
          ) : (
            <article className="card kpi kpi-empty">
              <span className="kpi-label">Signups · yesterday</span>
              <span className="kpi-value">—</span>
              <span className="kpi-delta">No complete day in the feed yet</span>
            </article>
          )}
          <Kpi
            label="Signups / day · 7d avg"
            value={avg(last7).toFixed(0)}
            spark={last7.map((p) => p.signups ?? 0)}
            dir={dirOf(signupDelta)}
          >
            <Delta value={signupDelta} />
            <span>vs {avg(prev7).toFixed(0)} prior 7 days</span>
          </Kpi>
          <Kpi
            label="Signup rate · 7d"
            value={`${(rateAvg(last7) * 100).toFixed(2)}%`}
            spark={last7.map((p) => p.rate ?? 0)}
            dir={dirOf(rateDelta)}
          >
            <Delta value={rateDelta} unit="pp" digits={2} />
            <span>
              {visitorsLast7 > 0
                ? `of ${visitorsLast7.toLocaleString("en-US")} visitors in 7 days`
                : "traffic not captured"}
            </span>
          </Kpi>
          <Kpi
            label="PRs merged · 7d"
            value={String(mergesLast7)}
            spark={last7.map((p) => p.merges ?? 0)}
            dir="flat"
          >
            <b className="flat">{pageMergesLast7} page-touching</b>
            <span>
              {mergesLast7 - pageMergesLast7} infra · {stats.total.toLocaleString("en-US")}
              {stats.firstMergeDay ? ` since ${shortDay(stats.firstMergeDay)}` : " total"}
            </span>
          </Kpi>
        </div>
        <p className="section-note">
          Signups are unique users who viewed a migrated page (Page Viewed) and then fired{" "}
          <code>{signupEvent}</code>, from Amplitude. Rate = signups ÷ unique visitors.
          Day-over-day swings follow the weekday cycle, so yesterday is compared with the same
          weekday last week.
        </p>
      </section>

      <ImpactChart
        title="Shipped work vs signups"
        points={points}
        mergeDays={mergeDayList}
        today={today}
        footnote={
          <>
            Bars show merged PRs per day from {MERGE_REPO} (
            {mergeSource === "github" ? "live from GitHub" : "seeded snapshot"}) on their own
            scale. Orange PRs touch a page (design, copy, or a route) and grey PRs are
            infrastructure. Click a day to see which PRs merged and how each was classified. A{" "}
            <code>page-touch</code> or <code>infra</code> GitHub label overrides the heuristic.
            {signupSeries.source === "amplitude"
              ? ` Signups (${signupEvent}) and traffic are live from the Amplitude Export API (unique users); days before the live window come from the captured snapshot.`
              : signupSeries.source === "omni"
                ? " Signups are live from Omni."
                : " Signups and traffic come from the captured Amplitude funnel (Page Viewed with product_area mw_ → Owner Account Created, unique users). Owner Account Created was first tracked on Jun 26, so the series starts Jun 27."}
          </>
        }
      />

      <section className="card exp-card" aria-labelledby="exp-title">
        <div className="exp-head">
          <h2 className="h2" id="exp-title">
            Live experiments · Statsig
          </h2>
          <a className="ext-link" href={STATSIG_CONSOLE} target="_blank" rel="noreferrer">
            Statsig <ArrowUpRight size={14} aria-hidden="true" />
          </a>
        </div>
        {runningExperiments === undefined ? (
          <p className="card-empty card-error">
            Couldn&apos;t reach Statsig. Reload to retry.
          </p>
        ) : runningExperiments === null ? (
          <p className="card-empty">Statsig isn&apos;t connected on this deployment.</p>
        ) : runningExperiments.length === 0 ? (
          <p className="card-empty">
            No live experiments.{" "}
            <a href={STATSIG_CONSOLE} target="_blank" rel="noreferrer">
              Open Statsig
            </a>
          </p>
        ) : (
          <div className="exps">
            {runningExperiments.map((experiment) => (
              <Experiment key={experiment.id} experiment={experiment} />
            ))}
          </div>
        )}
        <p className="section-note">
          A/B tests running in Statsig, with the primary metric&apos;s lift (test vs control) and
          significance from the Statsig Console API. Wins and losses are only called when the
          p-value clears Statsig&apos;s adjusted alpha; otherwise the raw lift is shown.
        </p>
      </section>

      <ProjectTable rows={rows} />
    </div>
  );
}
