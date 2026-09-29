import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import {
  AMPLITUDE_FAILURE_TTL_MS,
  amplitudeTimeout,
  getAmplitudeFunnel,
  resetAmplitudeCacheForTests,
} from "../src/lib/amplitude";
import { fetchWithTimeout, readJson } from "../src/lib/fetch-timeout";
import { getRunningExperiments, resetStatsigCacheForTests, statsigTimeout } from "../src/lib/statsig";
import { ttlCache } from "../src/lib/ttl-cache";

const env = { AMPLITUDE_API_KEY: "k", AMPLITUDE_SECRET: "s" };
const originalFetch = globalThis.fetch;
const defaults = { amplitude: amplitudeTimeout.ms, statsig: statsigTimeout.ms };

beforeEach(() => {
  amplitudeTimeout.ms = 50;
  statsigTimeout.ms = 50;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  amplitudeTimeout.ms = defaults.amplitude;
  statsigTimeout.ms = defaults.statsig;
  resetAmplitudeCacheForTests();
  resetStatsigCacheForTests();
});

/** Never answers until the request's signal aborts, like a stalled upstream. */
function stallBeforeHeaders(counter = { calls: 0 }): typeof fetch {
  return ((_input: RequestInfo | URL, init?: RequestInit) => {
    counter.calls++;
    return new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
    });
  }) as typeof fetch;
}

/** Sends headers and one chunk, then the body never ends until aborted. */
function stallMidBody(): typeof fetch {
  return (async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('{"data":'));
        init?.signal?.addEventListener("abort", () => controller.error(init.signal!.reason));
      },
    });
    return new Response(body, { status: 200 });
  }) as typeof fetch;
}

const within = async <T>(ms: number, run: () => Promise<T>) => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`still pending after ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
};

test("fetchWithTimeout rejects a request that never answers", async () => {
  globalThis.fetch = stallBeforeHeaders();
  await within(1_000, () =>
    assert.rejects(
      fetchWithTimeout("https://example.test", {}, 50, "Example API"),
      /Example API timed out after 50ms/,
    ),
  );
});

test("readJson rejects a body that stalls mid-download", async () => {
  globalThis.fetch = stallMidBody();
  await within(1_000, async () => {
    const response = await fetchWithTimeout("https://example.test", {}, 50, "Example API");
    await assert.rejects(readJson(response, 50, "Example API"), /Example API timed out after 50ms/);
  });
});

test("fetchWithTimeout keeps a caller's own abort distinct from a timeout", async () => {
  globalThis.fetch = stallBeforeHeaders();
  const controller = new AbortController();
  const pending = fetchWithTimeout("https://example.test", { signal: controller.signal }, 5_000, "X");
  controller.abort();
  await within(1_000, () =>
    assert.rejects(pending, (error: Error) => error.name === "AbortError"),
  );
});

test("fetchWithTimeout passes non-timeout errors through", async () => {
  globalThis.fetch = (async () => {
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  await assert.rejects(fetchWithTimeout("https://example.test", {}, 50, "X"), TypeError);
});

test("ttlCache shares one in-flight load between concurrent callers", async () => {
  let loads = 0;
  const cache = ttlCache(
    async () => {
      loads++;
      await new Promise((r) => setTimeout(r, 20));
      return loads;
    },
    { ttlMs: 60_000, failureTtlMs: 60_000 },
  );
  const results = await Promise.all([cache.get("k"), cache.get("k"), cache.get("k")]);
  assert.deepEqual(results, [1, 1, 1]);
  assert.equal(loads, 1);
});

test("ttlCache serves the last good value when a refresh fails", async () => {
  let fail = false;
  const cache = ttlCache(
    async () => {
      if (fail) throw new Error("upstream down");
      return "good";
    },
    { ttlMs: 1_000, failureTtlMs: 60_000 },
  );
  assert.equal(await cache.get("k", 0), "good");
  fail = true;
  assert.equal(await cache.get("k", 5_000), "good"); // expired, refresh fails, stale kept
});

test("ttlCache skips a failing upstream for failureTtlMs, then retries", async () => {
  let loads = 0;
  const cache = ttlCache(
    async () => {
      loads++;
      throw new Error("down");
    },
    { ttlMs: 60_000, failureTtlMs: 1_000 },
  );
  await assert.rejects(cache.get("k", 0), /down/);
  await assert.rejects(cache.get("k", 500), /down/);
  assert.equal(loads, 1);
  await assert.rejects(cache.get("k", 1_500), /down/);
  assert.equal(loads, 2);
});

test("getAmplitudeFunnel: a 404 is cached as a failure, then retried after the TTL", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  const t0 = 1_000_000;
  await assert.rejects(getAmplitudeFunnel(env, t0), /failed: 404/);
  await assert.rejects(getAmplitudeFunnel(env, t0 + 60_000), /failed: 404/);
  assert.equal(calls, 1);
  await assert.rejects(getAmplitudeFunnel(env, t0 + AMPLITUDE_FAILURE_TTL_MS + 1), /failed: 404/);
  assert.equal(calls, 2);
});

test("getAmplitudeFunnel: a stalled export times out and is cached as a failure", async () => {
  const counter = { calls: 0 };
  globalThis.fetch = stallBeforeHeaders(counter);
  await within(1_000, () =>
    assert.rejects(getAmplitudeFunnel(env, 0), /Amplitude Export API timed out after 50ms/),
  );
  await assert.rejects(getAmplitudeFunnel(env, 1_000), /timed out/);
  assert.equal(counter.calls, 1);
});

test("getAmplitudeFunnel: a stalled export body times out", async () => {
  globalThis.fetch = stallMidBody();
  await within(1_000, () =>
    assert.rejects(getAmplitudeFunnel(env, 0), /Amplitude Export API timed out after 50ms/),
  );
});

test("getAmplitudeFunnel returns null without credentials and never fetches", async () => {
  const counter = { calls: 0 };
  globalThis.fetch = stallBeforeHeaders(counter);
  assert.equal(await getAmplitudeFunnel({}), null);
  assert.equal(counter.calls, 0);
});

test("getRunningExperiments fails fast when Statsig stalls, then skips it briefly", async () => {
  const counter = { calls: 0 };
  globalThis.fetch = stallBeforeHeaders(counter);
  const key = { STATSIG_CONSOLE_API_KEY: "key" };
  await within(1_000, () =>
    assert.rejects(getRunningExperiments(key, 0), /Statsig Console API timed out after 50ms/),
  );
  await assert.rejects(getRunningExperiments(key, 30_000), /timed out/);
  assert.equal(counter.calls, 1);
});
