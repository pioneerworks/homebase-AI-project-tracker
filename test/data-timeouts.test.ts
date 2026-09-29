import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  AMPLITUDE_FAILURE_TTL_MS,
  getAmplitudeFunnel,
  resetAmplitudeCacheForTests,
} from "../src/lib/amplitude";
import { fetchWithTimeout } from "../src/lib/fetch-timeout";
import { getRunningExperiments, resetStatsigCacheForTests } from "../src/lib/statsig";

const env = { AMPLITUDE_API_KEY: "k", AMPLITUDE_SECRET: "s" };
const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  resetAmplitudeCacheForTests();
  resetStatsigCacheForTests();
});

/** A fetch that never answers until its signal aborts, like a stalled upstream. */
function hangingFetch(counter: { calls: number }): typeof fetch {
  return ((_input: RequestInfo | URL, init?: RequestInit) => {
    counter.calls++;
    return new Promise<Response>((_resolve, reject) => {
      const signal = init?.signal;
      if (!signal) return; // no deadline: hangs forever
      signal.addEventListener("abort", () => reject(signal.reason));
    });
  }) as typeof fetch;
}

test("fetchWithTimeout rejects a stalled request with a readable error", async () => {
  globalThis.fetch = hangingFetch({ calls: 0 });
  const started = Date.now();
  await assert.rejects(
    fetchWithTimeout("https://example.test", {}, 50, "Example API"),
    /Example API timed out after 50ms/,
  );
  assert.ok(Date.now() - started < 1000);
});

test("fetchWithTimeout passes non-timeout errors through", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  await assert.rejects(fetchWithTimeout("https://example.test", {}, 50, "X"), TypeError);
});

test("getAmplitudeFunnel skips Amplitude after a failure, then retries after the TTL", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  const t0 = 1_000_000;
  await assert.rejects(getAmplitudeFunnel(env, t0), /failed: 404/);
  assert.equal(calls, 1);

  // inside the failure window: no network call
  await assert.rejects(getAmplitudeFunnel(env, t0 + 60_000), /skipped after a recent failure/);
  assert.equal(calls, 1);

  // window elapsed: tries again
  await assert.rejects(getAmplitudeFunnel(env, t0 + AMPLITUDE_FAILURE_TTL_MS + 1), /failed: 404/);
  assert.equal(calls, 2);
});

test("getAmplitudeFunnel returns null without credentials and never fetches", async () => {
  const counter = { calls: 0 };
  globalThis.fetch = hangingFetch(counter);
  assert.equal(await getAmplitudeFunnel({}), null);
  assert.equal(counter.calls, 0);
});

test("getRunningExperiments fails fast when Statsig stalls", async () => {
  const counter = { calls: 0 };
  globalThis.fetch = hangingFetch(counter);
  // the real deadline is seconds; this just proves a signal is attached so
  // the call can't hang forever
  const pending = getRunningExperiments({ STATSIG_CONSOLE_API_KEY: "key" });
  const outcome = await Promise.race([
    pending.then(
      () => "resolved",
      (error: Error) => error.message,
    ),
    new Promise((resolve) => setTimeout(() => resolve("still hanging"), 7_500)),
  ]);
  assert.match(String(outcome), /Statsig Console API timed out/);
  assert.equal(counter.calls, 1);
});
