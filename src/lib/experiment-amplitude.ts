import "server-only";

/**
 * Per-arm experiment results from the Amplitude Dashboard REST API, so the
 * Experiments tab isn't limited to Statsig's once-a-day Databricks sync.
 *
 * One funnel per arm: "Page Viewed" (product_area contains mw_, user device
 * != Linux, event property <experiment id> = 0 for control or 1 for test) →
 * "Owner Account Created" within 7 days, from the experiment's start through
 * today. The marketing site stamps that arm property on every event of a
 * visitor in the experiment (hb-exp-<id> cookie), and the shared device id
 * carries the visitor into the app where the signup fires.
 *
 * Amplitude only sees consented visitors (about half of Statsig's), equally in
 * both arms, so its rates and lift are fair while its visitor counts are not
 * Statsig's exposures. Uses the same AMPLITUDE_API_KEY / AMPLITUDE_SECRET as
 * the Overview funnel (amplitude.ts).
 */
import { amplitudeConfig, type AmplitudeConfig } from "@/lib/amplitude";
import type { ArmFunnel, ArmResults } from "@/lib/experiments-types";
import { fetchWithTimeout, readJson } from "@/lib/fetch-timeout";
import { ttlCache } from "@/lib/ttl-cache";

const AMPLITUDE_FUNNELS_URL = "https://amplitude.com/api/2/funnels";
const LABEL = "Amplitude Dashboard API (experiments)";
/** Signups count when they land within 7 days of the qualifying page view. */
export const CONVERSION_WINDOW_SECONDS = 7 * 86_400;
const CACHE_TTL_MS = 15 * 60 * 1000;
const FAILURE_TTL_MS = 2 * 60 * 1000;
/** Amplitude allows 5 concurrent REST requests per project; leave room for the Overview. */
const MAX_CONCURRENT = 3;

export const experimentAmplitudeTimeout = { ms: 8_000 };

/** Experiment id plus its UTC date range (YYYY-MM-DD, end inclusive). */
export type ArmWindow = { id: string; start: string; end: string };

const compact = (iso: string) => iso.replaceAll("-", "");

export function armFunnelQuery(
  config: AmplitudeConfig,
  q: { experimentId: string; arm: 0 | 1; start: string; end: string },
): string {
  const params = new URLSearchParams();
  params.append(
    "e",
    JSON.stringify({
      event_type: config.pageviewEvent,
      filters: [
        {
          subprop_type: "event",
          subprop_key: "product_area",
          subprop_op: "contains",
          subprop_value: [config.productAreaPrefix],
        },
        { subprop_type: "user", subprop_key: "device", subprop_op: "is not", subprop_value: ["Linux"] },
        { subprop_type: "event", subprop_key: q.experimentId, subprop_op: "is", subprop_value: [String(q.arm)] },
      ],
    }),
  );
  params.append("e", JSON.stringify({ event_type: config.signupEvent, filters: [] }));
  params.set("start", compact(q.start));
  params.set("end", compact(q.end));
  params.set("mode", "ordered");
  params.set("i", "1");
  params.set("cs", String(CONVERSION_WINDOW_SECONDS));
  return `${AMPLITUDE_FUNNELS_URL}?${params}`;
}

type FunnelsResponse = {
  data?: {
    cumulativeRaw?: number[];
    dayFunnels?: { xValues?: string[]; series?: number[][] };
  }[];
};

/** Unique users over the whole range, plus the per-day step counts. */
export function parseArmFunnel(body: FunnelsResponse): ArmFunnel {
  const row = body.data?.[0];
  const [visitors, signups] = row?.cumulativeRaw ?? [];
  if (!Number.isFinite(visitors) || !Number.isFinite(signups)) {
    throw new Error(`${LABEL} returned no funnel totals`);
  }
  const xValues = row?.dayFunnels?.xValues ?? [];
  const series = row?.dayFunnels?.series ?? [];
  const daily = xValues.map((date, i) => {
    const [dayVisitors, daySignups] = series[i] ?? [];
    if (!Number.isFinite(dayVisitors) || !Number.isFinite(daySignups)) {
      throw new Error(`${LABEL} returned a malformed funnel row for ${date}`);
    }
    return { date, visitors: dayVisitors, signups: daySignups };
  });
  return { visitors, signups, daily };
}

let active = 0;
const waiting: (() => void)[] = [];

async function limited<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= MAX_CONCURRENT) await new Promise<void>((resolve) => waiting.push(resolve));
  active += 1;
  try {
    return await fn();
  } finally {
    active -= 1;
    waiting.shift()?.();
  }
}

async function fetchArm(config: AmplitudeConfig, window: ArmWindow, arm: 0 | 1): Promise<ArmFunnel> {
  const url = armFunnelQuery(config, { experimentId: window.id, arm, start: window.start, end: window.end });
  const auth = Buffer.from(`${config.apiKey}:${config.secret}`).toString("base64");
  return limited(async () => {
    const response = await fetchWithTimeout(
      url,
      { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" },
      experimentAmplitudeTimeout.ms,
      LABEL,
    );
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).replace(/\s+/g, " ").slice(0, 200);
      throw new Error(`${LABEL} failed: ${response.status} ${detail}`.trim());
    }
    return parseArmFunnel(await readJson<FunnelsResponse>(response, experimentAmplitudeTimeout.ms, LABEL));
  });
}

type CacheKey = { config: AmplitudeConfig; window: ArmWindow };

let cache = newCache();

function newCache() {
  return ttlCache<CacheKey, ArmResults>(
    async ({ config, window }) => {
      const [control, test] = await Promise.all([fetchArm(config, window, 0), fetchArm(config, window, 1)]);
      return { control, test };
    },
    {
      ttlMs: CACHE_TTL_MS,
      failureTtlMs: FAILURE_TTL_MS,
      keyOf: ({ window }) => `${window.id}:${window.start}:${window.end}`,
    },
  );
}

export function resetArmResultsCacheForTests(): void {
  cache = newCache();
  active = 0;
  waiting.length = 0;
}

/** Both arms' funnels, or null when the Amplitude keys aren't configured. Failures throw. */
export async function getArmResults(
  window: ArmWindow,
  env: Record<string, string | undefined> = process.env,
  now: number = Date.now(),
): Promise<ArmResults | null> {
  const config = amplitudeConfig(env);
  if (!config) return null;
  return cache.get({ config, window }, now);
}
