/**
 * Page model for the Experiments (A/B testing) tab. These types are the
 * contract between the pure derivations (experiments-derive.ts), the server
 * loaders, and the client UI — none of them import server-only modules.
 */

export type HubStatus = "live" | "queued" | "draft" | "concluded";
export type Surface = "landing_page" | "signup_flow" | "tool_page";
export type View = "all" | "live" | "decision" | "queued" | "draft" | "concluded";
export type Verdict = "winning" | "losing" | "no-signal" | "no-data";

export type MetricResult = {
  label: string;
  control: number;
  test: number;
  controlRate: number;
  testRate: number;
  lift: number | null;
};

export type TaglineState = "ahead" | "losing" | "too_early" | "not_started";
export type Tagline = { state: TaglineState; text: string; reason?: string };

export type ExperimentListItem = {
  id: string;
  name: string;
  path: string | null;
  surface: Surface;
  status: HubStatus;
  primaryMetric: string | null;
  owner: string | null;
  statsigUrl: string | null;
  hypothesis: string | null;
  guardrails: string;
  plannedRun: string;
  /** % values, e.g. 2.09 */
  controlRate: number | null;
  testRate: number | null;
  lift: number | null;
  pValue: number | null;
  verdict: Verdict;
  controlN: number | null;
  testN: number | null;
  day: number | null;
  totalDays: number | null;
  startDate: string | null;
  endDate: string | null;
  /** Statsig createdTime (ms), for the within-group sort tiebreak. */
  createdTime: number | null;
  targetSplit: [number, number];
  armUrls: { control: string | null; test: string | null };
  armNames: { control: string; test: string };
  /** [Sign ups, 1D1s] when present */
  results: MetricResult[];
  /** One-line verdict under the name (handoff §6): ahead / losing / too early / not started. */
  tagline: Tagline;
  /** "Day 10 of 28" | "Starts Oct 20" | "Unscheduled" | "Ended Oct 1" */
  progressLabel: string;
};

export type Kpi = {
  id: string;
  label: string;
  value: string;
  context: string;
  tone?: "danger";
};

export type Decision = {
  experimentId: string;
  title: string;
  body: string;
  statsigUrl: string | null;
  slackUrl: string;
};

export type ExperimentsNav = {
  counts: Record<View, number>;
  surfaces: Record<Surface, number>;
  live: {
    id: string;
    name: string;
    lift: number | null;
    losing: boolean;
    day: number | null;
    totalDays: number | null;
  }[];
  sync: { ok: boolean; at: string | null };
};

export type ExperimentsPage = {
  today: string;
  week: { start: string; end: string };
  sync: { ok: boolean; at: string | null };
  experiments: ExperimentListItem[];
  kpis: Kpi[];
  decision: Decision | null;
};

export type DailyPoint = {
  date: string;
  exposures: { control: number; test: number };
  signups: { control: number; test: number };
};

export type ExperimentDetail = {
  id: string;
  exposures: { control: number; test: number } | null;
  srm: { ok: boolean; pValue: number } | null;
  daily: DailyPoint[] | null;
};
