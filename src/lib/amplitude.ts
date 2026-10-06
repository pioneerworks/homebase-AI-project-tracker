import "server-only";

/**
 * Amplitude funnel series via the Dashboard REST API (/api/2/funnels).
 *
 * Runs the team's Amplitude funnel chart server-side ("Page Viewed" filtered
 * to product_area contains mw_ and user device != Linux → "Owner Account
 * Created", ordered, converted within one day, daily) and reads the per-day
 * step counts:
 *   traffic = users entering step 1 that day
 *   signups = users completing step 2
 *   rate    = signups / traffic
 *
 * Amplitude computes the funnel, so identity resolution and the 1-day window
 * match the chart. Days follow the project timezone (UTC for 677513). With
 * the 1-day conversion window, the last day's signups can still rise for up
 * to a day as late conversions land.
 * Requires AMPLITUDE_API_KEY and AMPLITUDE_SECRET (project API key + secret
 * key) to be set and readable.
 */
import { fetchWithTimeout, readJson } from "@/lib/fetch-timeout";
import { ttlCache } from "@/lib/ttl-cache";
import type { SignupDay } from "@/lib/signup-data";

const AMPLITUDE_FUNNELS_URL = "https://amplitude.com/api/2/funnels";
const LABEL = "Amplitude Dashboard API";
const DAY_MS = 86_400_000;

export type AmplitudeConfig = {
  apiKey: string;
  secret: string;
  signupEvent: string;
  pageviewEvent: string;
  productAreaPrefix: string;
  windowDays: number;
};

export function amplitudeConfig(
  env: Record<string, string | undefined> = process.env,
): AmplitudeConfig | null {
  const apiKey = env.AMPLITUDE_API_KEY?.trim();
  const secret = env.AMPLITUDE_SECRET?.trim();
  if (!apiKey || !secret || apiKey.includes("SENSITIVE") || secret.includes("SENSITIVE")) {
    return null;
  }
  return {
    apiKey,
    secret,
    signupEvent: env.AMPLITUDE_SIGNUP_EVENT?.trim() || "Owner Account Created",
    pageviewEvent: env.AMPLITUDE_PAGEVIEW_EVENT?.trim() || "Page Viewed",
    productAreaPrefix: env.AMPLITUDE_PRODUCT_AREA_PREFIX?.trim() || "mw_",
    windowDays: windowDays(env.AMPLITUDE_WINDOW_DAYS),
  };
}

function windowDays(raw: string | undefined): number {
  const days = Number(raw?.trim() || 30);
  return Number.isInteger(days) && days > 0 && days <= 365 ? days : 30;
}

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * The funnel request for the last `windowDays` complete days, ending
 * yesterday (UTC) so today's partial day never enters the series.
 */
export function funnelQuery(
  config: AmplitudeConfig,
  now: number,
): { url: string; windowStart: string } {
  const today = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate(),
  );
  const end = isoDay(today - DAY_MS);
  const windowStart = isoDay(today - config.windowDays * DAY_MS);

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
        // [Amplitude] Device family is the user-level "device" property
        { subprop_type: "user", subprop_key: "device", subprop_op: "is not", subprop_value: ["Linux"] },
      ],
    }),
  );
  params.append("e", JSON.stringify({ event_type: config.signupEvent, filters: [] }));
  params.set("start", windowStart.replaceAll("-", ""));
  params.set("end", end.replaceAll("-", ""));
  params.set("mode", "ordered");
  params.set("i", "1");
  params.set("cs", String(DAY_MS / 1000));

  return { url: `${AMPLITUDE_FUNNELS_URL}?${params}`, windowStart };
}

type FunnelsResponse = {
  data?: { dayFunnels?: { xValues?: string[]; series?: number[][] } }[];
};

/** Map the funnels response's per-day step counts to SignupDay rows. */
export function funnelToSignupDays(body: FunnelsResponse): SignupDay[] {
  const day = body.data?.[0]?.dayFunnels;
  if (!day?.xValues?.length || !day.series?.length) {
    throw new Error(`${LABEL} returned no daily funnel data`);
  }
  const { xValues, series } = day;
  if (series.length !== xValues.length) {
    throw new Error(`${LABEL} returned a malformed funnel: ${series.length} rows for ${xValues.length} days`);
  }
  return xValues.map((date, i) => {
    const [traffic, signups] = series[i] ?? [];
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(traffic) ||
      !Number.isFinite(signups)
    ) {
      throw new Error(`${LABEL} returned a malformed funnel row for ${date}`);
    }
    return { date, signups, traffic, rate: traffic > 0 ? signups / traffic : null };
  });
}

/** In-memory TTL cache so page views share one funnel query. */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * The Overview can't wait on Amplitude indefinitely. Past this deadline the
 * page renders from the captured snapshot instead. Mutable for tests.
 */
export const amplitudeTimeout = { ms: 8_000 };

/**
 * After a failure (bad credentials, 404, timeout) skip Amplitude for a while,
 * so each page view doesn't pay for the same failing call again. A failed
 * refresh with good data already cached keeps serving that data.
 */
export const AMPLITUDE_FAILURE_TTL_MS = 15 * 60 * 1000;

type Funnel = { days: SignupDay[]; windowStart: string };

const funnelCache = ttlCache(
  ({ config, now }: { config: AmplitudeConfig; now: number }) => fetchFunnel(config, now),
  {
    ttlMs: CACHE_TTL_MS,
    failureTtlMs: AMPLITUDE_FAILURE_TTL_MS,
    // the UTC day is part of the key so the window moves forward at midnight
    keyOf: ({ config, now }) => `${config.apiKey}:${config.windowDays}:${isoDay(now)}`,
    onStaleServe: (error) =>
      console.error(
        `${LABEL} refresh failed, serving the cached funnel:`,
        error instanceof Error ? error.message : error,
      ),
  },
);

/**
 * The newest good funnel per config. The day-keyed cache starts empty at
 * midnight, so without this a failure then would drop the page to the
 * snapshot instead of the previous day's live funnel.
 */
const lastGood = new Map<string, { now: number; funnel: Funnel }>();

export function resetAmplitudeCacheForTests(): void {
  funnelCache.clear();
  lastGood.clear();
}

export async function getAmplitudeFunnel(
  env: Record<string, string | undefined> = process.env,
  now: number = Date.now(),
): Promise<Funnel | null> {
  const config = amplitudeConfig(env);
  if (!config) return null;
  const id = `${config.apiKey}:${config.windowDays}`;
  try {
    const funnel = await funnelCache.get({ config, now }, now);
    const latest = lastGood.get(id);
    // a slow load that started before a newer success must not overwrite it
    if (!latest || now >= latest.now) {
      if (latest && isoDay(latest.now) !== isoDay(now)) {
        // drop earlier days' entries (and failures) from the cache
        funnelCache.clear({ config, now: latest.now });
        if (isoDay(latest.now) !== isoDay(now - DAY_MS)) {
          funnelCache.clear({ config, now: now - DAY_MS });
        }
      }
      lastGood.set(id, { now, funnel });
    }
    return funnel;
  } catch (error) {
    const latest = lastGood.get(id);
    // only yesterday's funnel is close enough; older than that, use the snapshot
    if (latest && isoDay(latest.now) >= isoDay(now - DAY_MS)) {
      console.error(
        `${LABEL} failed, serving yesterday's funnel:`,
        error instanceof Error ? error.message : error,
      );
      return latest.funnel;
    }
    throw error;
  }
}

async function fetchFunnel(config: AmplitudeConfig, now: number): Promise<Funnel> {
  const { url, windowStart } = funnelQuery(config, now);
  const auth = Buffer.from(`${config.apiKey}:${config.secret}`).toString("base64");
  const response = await fetchWithTimeout(
    url,
    { headers: { Authorization: `Basic ${auth}` }, cache: "no-store" },
    amplitudeTimeout.ms,
    LABEL,
  );
  if (!response.ok) {
    // A short one-line slice tells a bad key apart from a rate limit in the
    // logs. Credentials travel only in the Authorization header.
    const detail = (await response.text().catch(() => ""))
      .replace(/\s+/g, " ")
      .slice(0, 200);
    throw new Error(`${LABEL} failed: ${response.status} ${detail}`.trim());
  }
  const body = await readJson<FunnelsResponse>(response, amplitudeTimeout.ms, LABEL);
  return { days: funnelToSignupDays(body), windowStart };
}
