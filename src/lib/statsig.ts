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
  /** Per-unit conversion rate of each arm (fraction, e.g. 0.025). */
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
      /[LPURL]/.test(word) || word === word.toUpperCase()
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
  return Math.max(1, Math.floor((now - startTimeMs) / 86400000) + 1);
}

/**
 * Turn the primary-metric pulse row into a dashboard verdict. `directionality`
 * is Statsig's desired direction ("increase" means a positive lift is good).
 */
export function verdictFromPrimary(
  metric: ExperimentPulseResultsDto["primaryMetrics"][number],
): Pick<ExperimentCard, "verdict" | "noDataReason" | "percentChange" | "ci" | "pValue"> {
  if (metric.error) {
    return {
      verdict: "no-data",
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
  if (significant && lift != null) {
    verdict = lift * desired > 0 ? "winning" : "losing";
  } else if (significant && lift != null && lift === 0) {
    verdict = "no-signal";
  }
  return {
    verdict,
    noDataReason: null,
    percentChange: lift,
    ci: ci && ci.lower != null && ci.upper != null ? [ci.lower, ci.upper] : null,
    pValue: metric.pValue ?? null,
  };
}

async function consoleGet<T>(apiKey: string, path: string): Promise<T> {
  const response = await fetch(`${CONSOLE_BASE}${path}`, {
    headers: {
      "STATSIG-API-KEY": apiKey,
      "STATSIG-API-VERSION": API_VERSION,
    },
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Statsig Console API failed: ${response.status}`);
  }
  const body = (await response.json()) as { data: T };
  return body.data;
}

/** Group DTOs plus pulse results, flattened into dashboard cards. */
export function toExperimentCards(
  experiments: ExternalExperimentDto[],
  pulses: Map<string, ExperimentPulseResultsDto>,
  now: number = Date.now(),
): ExperimentCard[] {
  return experiments.map((experiment) => {
    const control = experiment.groups.find((g) => g.id === experiment.controlGroupID)
      ?? experiment.groups.find((g) => g.isControl);
    const test = experiment.groups.find((g) => g.id !== control?.id);
    const pulse = pulses.get(experiment.id);
    const primaryRow = pulse?.primaryMetrics?.[0];
    const verdict = primaryRow
      ? verdictFromPrimary(primaryRow)
      : { verdict: "no-data" as const, noDataReason: "no pull yet", percentChange: null, ci: null, pValue: null };

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
      controlRate: primaryRow?.controlMean ?? null,
      testRate: primaryRow?.testMean ?? null,
      controlUnits: primaryRow?.controlUnits ?? null,
      testUnits: primaryRow?.testUnits ?? null,
      verdict: verdict.verdict,
      noDataReason: verdict.noDataReason,
    };
  });
}

let cache: { at: number; cards: ExperimentCard[] } | null = null;

export function resetStatsigCacheForTests(): void {
  cache = null;
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

  if (cache && now - cache.at < CACHE_TTL_MS) {
    return cache.cards;
  }

  const experiments = await consoleGet<ExternalExperimentDto[]>(
    config.apiKey,
    "/experiments?status=active&limit=100",
  );

  const pulses = new Map<string, ExperimentPulseResultsDto>();
  await Promise.all(
    experiments.map(async (experiment) => {
      const control = experiment.controlGroupID
        ?? experiment.groups.find((g) => g.isControl)?.id;
      const test = experiment.groups.find((g) => g.id !== control)?.id;
      if (!control || !test) return;
      try {
        pulses.set(
          experiment.id,
          await consoleGet<ExperimentPulseResultsDto>(
            config.apiKey,
            `/experiments/${experiment.id}/pulse_results?control=${control}&test=${test}`,
          ),
        );
      } catch {
        // one experiment failing to load results shouldn't hide the others
      }
    }),
  );

  const cards = toExperimentCards(experiments, pulses, now);
  cache = { at: now, cards };
  return cards;
}
