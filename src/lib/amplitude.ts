/**
 * Amplitude funnel series via the Export API.
 *
 * Reproduces the team's Amplitude funnel chart ("Page Viewed" filtered to
 * product_area mw_* and device != Linux → "Owner Account Created", unique
 * users, conversion over time) as a daily series:
 *   traffic = unique users with a qualifying Page Viewed that day
 *   signups = users with a qualifying Page Viewed and Owner Account Created
 *             that day
 *   rate    = signups / traffic
 *
 * Uses the Export API (Basic auth with the project API key + secret) which
 * returns a ZIP of hourly gzipped JSONL event files. Requires both
 * AMPLITUDE_API_KEY and AMPLITUDE_SECRET to be set and readable.
 *
 * Known divergences from the Amplitude chart (documented for reviewers):
 *  - day bucketing uses UTC, the Amplitude UI uses the project timezone
 *  - identity = user_id, falling back to device_id (cross-platform stitching
 *    may differ slightly from Amplitude's identity resolution)
 *  - signups count users with a qualifying Page Viewed and the conversion
 *    event on the same day (event order not checked); the chart's 1-day
 *    window can span midnight
 */
import { gunzipSync, unzipSync } from "fflate";

import type { SignupDay } from "@/lib/signup-data";

const AMPLITUDE_EXPORT_URL = "https://amplitude.com/api/2/export";

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
    windowDays: Number(env.AMPLITUDE_WINDOW_DAYS?.trim() || 30),
  };
}

/** Export API wants YYYYMMDDTHH (UTC, inclusive hour range). */
function exportStamp(date: Date): string {
  return (
    date.getUTCFullYear() +
    String(date.getUTCMonth() + 1).padStart(2, "0") +
    String(date.getUTCDate()).padStart(2, "0") +
    "T" +
    String(date.getUTCHours()).padStart(2, "0")
  );
}

export type DayCounts = { date: string; pageviewUsers: number; signupUsers: number };

/**
 * Pure aggregation over JSONL event lines (exported for tests). One line per
 * event; identity is user_id falling back to device_id.
 */
export function aggregateFromLines(
  lines: string[],
  config: Pick<AmplitudeConfig, "signupEvent" | "pageviewEvent" | "productAreaPrefix">,
): Map<string, { pageview: Set<string>; signup: Set<string> }> {
  const byDay = new Map<string, { pageview: Set<string>; signup: Set<string> }>();

  for (const line of lines) {
    if (!line) continue;
    let event: {
      event_type?: string;
      event_time?: string;
      user_id?: string | null;
      device_id?: string | null;
      event_properties?: Record<string, unknown>;
    };
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (!event?.event_type || !event.event_time) continue;

    let isPageview = event.event_type === config.pageviewEvent;
    let isSignup = event.event_type === config.signupEvent;
    if (!isPageview && !isSignup) continue;

    const props = (event.event_properties ?? {}) as Record<string, unknown>;
    if (isPageview) {
      // chart filter: Device type != Linux
      const device = String(props.device_family ?? "").toLowerCase();
      if (device === "linux") continue;
      // chart filter: product_area contains mw_
      const productArea = String(props.product_area ?? "");
      if (!productArea.includes(config.productAreaPrefix)) continue;
    }

    const identity = event.user_id || event.device_id;
    if (!identity) continue;

    const date = event.event_time.slice(0, 10);
    let day = byDay.get(date);
    if (!day) {
      day = { pageview: new Set(), signup: new Set() };
      byDay.set(date, day);
    }
    if (isPageview) day.pageview.add(identity);
    else day.signup.add(identity);
  }

  return byDay;
}

export function toSignupDays(
  byDay: Map<string, { pageview: Set<string>; signup: Set<string> }>,
): SignupDay[] {
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, day]) => {
      const traffic = day.pageview.size;
      // funnel: only users who also had a qualifying Page Viewed that day
      let signups = 0;
      for (const identity of day.signup) if (day.pageview.has(identity)) signups++;
      return {
        date,
        signups,
        traffic,
        rate: traffic > 0 ? signups / traffic : null,
      };
    });
}

/** Decode the Export API ZIP: entries are gzipped JSONL files. */
export function extractLinesFromZip(zip: Uint8Array): string[] {
  const files = unzipSync(zip);
  const lines: string[] = [];
  for (const [name, compressed] of Object.entries(files)) {
    if (!name.endsWith(".gz") && !name.endsWith(".json")) continue;
    const text = name.endsWith(".gz")
      ? new TextDecoder().decode(gunzipSync(compressed))
      : new TextDecoder().decode(compressed);
    for (const line of text.split("\n")) lines.push(line);
  }
  return lines;
}

/** In-memory TTL cache so page views don't re-process the export ZIP. */
let cache: { at: number; days: SignupDay[]; windowStart: string } | null = null;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export function resetAmplitudeCacheForTests(): void {
  cache = null;
}

export async function getAmplitudeFunnel(
  env: Record<string, string | undefined> = process.env,
): Promise<{ days: SignupDay[]; windowStart: string } | null> {
  const config = amplitudeConfig(env);
  if (!config) return null;

  if (cache && Date.now() - cache.at < CACHE_TTL_MS) {
    return { days: cache.days, windowStart: cache.windowStart };
  }

  const end = new Date();
  const start = new Date(end.getTime() - config.windowDays * 86400000);
  const windowStart = start.toISOString().slice(0, 10);

  const auth = Buffer.from(`${config.apiKey}:${config.secret}`).toString("base64");
  const response = await fetch(
    `${AMPLITUDE_EXPORT_URL}?start=${exportStamp(start)}&end=${exportStamp(end)}`,
    {
      headers: { Authorization: `Basic ${auth}` },
      cache: "no-store",
    },
  );
  if (!response.ok) {
    throw new Error(`Amplitude Export API failed: ${response.status}`);
  }

  const zip = new Uint8Array(await response.arrayBuffer());
  const byDay = aggregateFromLines(extractLinesFromZip(zip), config);
  const days = toSignupDays(byDay);

  cache = { at: Date.now(), days, windowStart };
  return { days, windowStart };
}
