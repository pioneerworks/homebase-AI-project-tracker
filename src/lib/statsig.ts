import "server-only";

import { fetchWithTimeout, readJson } from "@/lib/fetch-timeout";

/**
 * Running Statsig experiments via the Console API.
 *
 * Lists the experiments currently in `active` status and, for each one, pulls
 * its Pulse results for the primary metric (control vs first test group):
 *
 *   GET https://statsigapi.net/console/v1/experiments?status=active
 *   GET /console/v1/experiments/{id}/pulse_results?control=..&test=..
 *
 * Auth is a Console API key created in Project Settings → API Keys, sent in
 * the STATSIG-API-KEY header. Like the Linear and Amplitude keys, it is
 * server-side only: reads a Vercel/local env var and is never shipped to the
 * browser. Without the key this module returns null and the overview section
 * simply does not render.
 *
 * Pulse results return regular (frequentist) stats for these experiments;
 * sequential-testing fields are exposed on the DTO but we use the regular
 * CI/p-value because the project does not enable sequential testing.
 */
import type { ExperimentPulseResultsDto, ExternalExperimentDto } from "./statsig-types";

const CONSOLE_BASE = "https://statsigapi.net/console/v1";
const API_VERSION = "20240601";
// One call per experiment + one list call, so an hourly refresh stays far
// below the Console API limit (~900 req / 15 min).
const CACHE_TTL_MS = 60 * 60 * 1000;

export type ExperimentVerdict = "winning" | "losing" | "no-signal" | "no-data";

export interface ExperimentCard {
  id: string;
  title: string;
  permalink: string | null;
  hypothesis: string | null;
  started: string | null;
  /** 1-based day of the experiment, or null when unused. */
  day: number | null;
  durationDays: number | null;
  primaryMetric: string | null;
  /** Signed percent change of test vs control, e.g. -53.4 is "test is down 53%". */
  percentChange: number | null;
  /** Percent-change CI bounds, [low, high]. */
  ci: [number, number] | null;
  pValue: number | null;
  /** True when the p-value clears Statsig's adjusted alpha for this experiment. */
  significant: boolean;
  /** Per-unit mean of each arm (conversion rate when the metric is binomial). */
  controlRate: number | null;
  testRate: number | null;
  controlUnits: number | null;
  testUnits: number | null;
  verdict: ExperimentVerdict;
  noDataReason: string | null;
}

export function statsigConfig(
  env: Record<string, string | undefined> = process.env,
): { apiKey: string } | null {
  const apiKey = env.STATSIG_CONSOLE_API_KEY?.trim();
  if (!apiKey || apiKey.includes("SENSITIVE")) return null;
  return { apiKey };
}

/** exp_free_employee_scheduling_app_lp_module -> "Free employee scheduling app LP module". */
export function experimentTitle(id: string): string {
  return id
    .replace(/^exp_/, "")
    .replace(/_/g, " ")
    .replace(/\blp\b/gi, "LP")
    .replace(/\burl\b/gi, "URL")
    .replace(/\bid\b/gi, "ID")
    .replace(/\bapp\b/gi, "App")
    .replace(/\bai\b/gi, "AI")
    .split(" ")
    .map((word) =>
      /^(LP|URL|ID)$/.test(word) || word === word.toUpperCase()
        ? word
        : word.charAt(0).toUpperCase() + word.slice(1),
    )
    .join(" ");
}

export function experimentDay(
  startTimeMs: number | null | undefined,
  now: number = Date.now(),
): number | null {
  if (!startTimeMs) return null;
  // Counts elapsed 24h periods like a stopwatch; Statsig's own day counter can
  // differ by one when an experiment started mid-day UTC (documented like the
  // UTC day bucketing note in amplitude.ts).
  return Math.max(1, Math.floor((now - startTimeMs) / 86400000) + 1);
}

/**
 * Turn the primary-metric pulse row into a dashboard verdict. `directionality`
 * is Statsig's desired direction ("increase" means a positive lift is good).
 */
export function verdictFromPrimary(
  metric: ExperimentPulseResultsDto["primaryMetrics"][number],
): Pick<ExperimentCard, "verdict" | "significant" | "noDataReason" | "percentChange" | "ci" | "pValue"> {
  if (metric.error) {
    return {
      verdict: "no-data",
      significant: false,
      noDataReason: metric.error,
      percentChange: null,
      ci: null,
      pValue: null,
    };
  }
  const ci = metric.percentConfidenceInterval;
  const significant = metric.pValue != null && metric.adjustedAlpha != null
    ? metric.pValue < metric.adjustedAlpha
    : false;
  const desired = metric.directionality === "decrease" ? -1 : 1;
  const lift = metric.percentChange ?? null;
  let verdict: ExperimentVerdict = "no-signal";
  if (significant && lift != null && lift !== 0) {
    verdict = lift * desired > 0 ? "winning" : "losing";
  }
  return {
    verdict,
    significant,
    noDataReason: null,
    percentChange: lift,
    ci: ci && ci.lower != null && ci.upper != null ? [ci.lower, ci.upper] : null,
    pValue: metric.pValue ?? null,
  };
}

/** Per-request deadline; the pulse calls run in parallel after the list call. Mutable for tests. */
export const statsigTimeout = { ms: 6_000 };

async function consoleGet<T>(apiKey: string, path: string): Promise<T> {
  const response = await fetchWithTimeout(
    `${CONSOLE_BASE}${path}`,
    {
      headers: {
        "STATSIG-API-KEY": apiKey,
        "STATSIG-API-VERSION": API_VERSION,
      },
      cache: "no-store",
    },
    statsigTimeout.ms,
    "Statsig Console API",
  );
  if (!response.ok) {
    throw new Error(`Statsig Console API failed: ${response.status}`);
  }
  const body = await readJson<{ data: T }>(response, statsigTimeout.ms, "Statsig Console API");
  return body.data;
}

/**
 * Pick the control and (first) test group for an experiment's pulse query.
 * Multi-arm experiments: Statsig's pulse endpoint compares one test group
 * against control, so we surface the first non-control arm today rather than
 * issuing one call per arm.
 */
export function pickArms(
  experiment: ExternalExperimentDto,
): { controlId: string | null; testId: string | null } {
  const control =
    experiment.groups.find((g) => g.id && g.id === experiment.controlGroupID) ??
    experiment.groups.find((g) => g.isControl);
  const test = experiment.groups.find((g) => g.id && g.id !== control?.id);
  return { controlId: control?.id ?? null, testId: test?.id ?? null };
}

/** Group DTOs plus pulse results, flattened into dashboard cards. */
export function toExperimentCards(
  experiments: ExternalExperimentDto[],
  pulses: Map<string, ExperimentPulseResultsDto>,
  now: number = Date.now(),
): ExperimentCard[] {
  return experiments.map((experiment) => {
    const pulse = pulses.get(experiment.id);
    const primaryRow = pulse?.primaryMetrics?.[0];
    const verdict = primaryRow
      ? verdictFromPrimary(primaryRow)
      : { verdict: "no-data" as const, significant: false, noDataReason: "no pull yet", percentChange: null, ci: null, pValue: null };

    return {
      id: experiment.id,
      title: experimentTitle(experiment.name),
      permalink: experiment.permalink ?? null,
      hypothesis: experiment.hypothesis || null,
      started: experiment.startTime
        ? new Date(experiment.startTime).toISOString().slice(0, 10)
        : null,
      day: experimentDay(experiment.startTime, now),
      durationDays: experiment.duration ?? null,
      primaryMetric: primaryRow?.metricName ?? experiment.primaryMetrics?.[0]?.name ?? null,
      percentChange: verdict.percentChange,
      ci: verdict.ci,
      pValue: verdict.pValue,
      significant: verdict.significant,
      controlRate: primaryRow?.controlMean ?? null,
      testRate: primaryRow?.testMean ?? null,
      controlUnits: primaryRow?.controlUnits ?? null,
      testUnits: primaryRow?.testUnits ?? null,
      verdict: verdict.verdict,
      noDataReason: verdict.noDataReason,
    };
  });
}

let cache: { at: number; ttl: number; cards: ExperimentCard[] } | null = null;
let failure: { at: number; error: unknown } | null = null;
/** Cards where some pulse failed are retried sooner than a clean load. */
const PARTIAL_CACHE_TTL_MS = 5 * 60 * 1000;
/** After a failed list call, skip Statsig briefly instead of waiting on it every view. */
const FAILURE_TTL_MS = 2 * 60 * 1000;

export function resetStatsigCacheForTests(): void {
  cache = null;
  failure = null;
}

/**
 * Running experiments with their quick primary-metric status, or null when
 * no key is configured. Fetch failures throw; callers catch and fall back.
 */
export async function getRunningExperiments(
  env: Record<string, string | undefined> = process.env,
  now: number = Date.now(),
): Promise<ExperimentCard[] | null> {
  const config = statsigConfig(env);
  if (!config) return null;

  if (cache && now - cache.at < cache.ttl) {
    return cache.cards;
  }
  if (failure && now - failure.at < FAILURE_TTL_MS) {
    if (cache) return cache.cards;
    throw failure.error;
  }

  let experiments: ExternalExperimentDto[];
  try {
    experiments = await consoleGet<ExternalExperimentDto[]>(
      config.apiKey,
      "/experiments?status=active&limit=100",
    );
  } catch (error) {
    failure = { at: now, error };
    // a stale list beats an error card
    if (cache) return cache.cards;
    throw error;
  }
  failure = null;
  let partial = false;

  const pulses = new Map<string, ExperimentPulseResultsDto>();
  await Promise.all(
    experiments.map(async (experiment) => {
      const { controlId, testId } = pickArms(experiment);
      if (!controlId || !testId) return;
      try {
        pulses.set(
          experiment.id,
          await consoleGet<ExperimentPulseResultsDto>(
            config.apiKey,
            `/experiments/${experiment.id}/pulse_results?control=${controlId}&test=${testId}`,
          ),
        );
      } catch {
        // one experiment failing to load results shouldn't hide the others
        partial = true;
      }
    }),
  );

  const cards = toExperimentCards(experiments, pulses, now);
  cache = { at: now, ttl: partial ? PARTIAL_CACHE_TTL_MS : CACHE_TTL_MS, cards };
  return cards;
}
