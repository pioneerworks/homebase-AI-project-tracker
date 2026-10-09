import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { amplitudeConfig } from "../src/lib/amplitude";
import {
  armFunnelQuery,
  getArmResults,
  parseArmFunnel,
  resetArmResultsCacheForTests,
} from "../src/lib/experiment-amplitude";

const ENV = { AMPLITUDE_API_KEY: "k", AMPLITUDE_SECRET: "s" };
const config = amplitudeConfig(ENV)!;
const NOW = Date.UTC(2026, 9, 9, 15); // Fri 2026-10-09 15:00 UTC

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
  resetArmResultsCacheForTests();
});

test("armFunnelQuery filters Page Viewed to mw_, non-Linux, and one arm of the experiment", () => {
  const url = new URL(
    armFunnelQuery(config, {
      experimentId: "exp_payroll_facebook_url_split",
      arm: 1,
      start: "2026-10-01",
      end: "2026-10-09",
    }),
  );
  assert.equal(url.origin + url.pathname, "https://amplitude.com/api/2/funnels");
  const [pageview, signup] = url.searchParams.getAll("e").map((e) => JSON.parse(e));
  assert.deepEqual(pageview, {
    event_type: "Page Viewed",
    filters: [
      { subprop_type: "event", subprop_key: "product_area", subprop_op: "contains", subprop_value: ["mw_"] },
      { subprop_type: "user", subprop_key: "device", subprop_op: "is not", subprop_value: ["Linux"] },
      {
        subprop_type: "event",
        subprop_key: "exp_payroll_facebook_url_split",
        subprop_op: "is",
        subprop_value: ["1"],
      },
    ],
  });
  assert.deepEqual(signup, { event_type: "Owner Account Created", filters: [] });
  assert.equal(url.searchParams.get("start"), "20261001");
  // today is included: that's the point of reading Amplitude instead of Statsig
  assert.equal(url.searchParams.get("end"), "20261009");
  assert.equal(url.searchParams.get("mode"), "ordered");
  assert.equal(url.searchParams.get("i"), "1");
  assert.equal(url.searchParams.get("cs"), String(7 * 86400));
});

test("parseArmFunnel reads unique totals and the per-day series", () => {
  const body = {
    data: [
      {
        cumulativeRaw: [1200, 30],
        dayFunnels: {
          xValues: ["2026-10-08", "2026-10-09"],
          series: [
            [700, 20],
            [550, 11],
          ],
        },
      },
    ],
  };
  assert.deepEqual(parseArmFunnel(body), {
    visitors: 1200,
    signups: 30,
    daily: [
      { date: "2026-10-08", visitors: 700, signups: 20 },
      { date: "2026-10-09", visitors: 550, signups: 11 },
    ],
  });
});

test("parseArmFunnel rejects a response without totals", () => {
  assert.throws(() => parseArmFunnel({ data: [] }), /no funnel totals/);
  assert.throws(
    () => parseArmFunnel({ data: [{ cumulativeRaw: [10], dayFunnels: { xValues: [], series: [] } }] }),
    /no funnel totals/,
  );
});

function funnelBody(visitors: number, signups: number) {
  return {
    data: [
      {
        cumulativeRaw: [visitors, signups],
        dayFunnels: { xValues: ["2026-10-09"], series: [[visitors, signups]] },
      },
    ],
  };
}

test("getArmResults queries each arm once and caches the pair", async () => {
  const calls: string[] = [];
  globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    const step = JSON.parse(url.searchParams.getAll("e")[0]);
    const arm = step.filters[2].subprop_value[0];
    calls.push(arm);
    return Response.json(arm === "0" ? funnelBody(1000, 20) : funnelBody(1010, 31));
  };
  const experiment = { id: "exp_x", start: "2026-10-01", end: "2026-10-09" };
  const results = await getArmResults(experiment, ENV, NOW);
  assert.ok(results);
  assert.equal(results.control.visitors, 1000);
  assert.equal(results.test.signups, 31);
  assert.deepEqual(calls.sort(), ["0", "1"]);

  await getArmResults(experiment, ENV, NOW + 60_000);
  assert.equal(calls.length, 2);
});

test("getArmResults returns null without Amplitude keys", async () => {
  globalThis.fetch = async () => {
    throw new Error("no fetch expected");
  };
  assert.equal(await getArmResults({ id: "exp_x", start: "2026-10-01", end: "2026-10-09" }, {}, NOW), null);
});

test("getArmResults throws when an arm fails", async () => {
  globalThis.fetch = async (input) => {
    const step = JSON.parse(new URL(String(input)).searchParams.getAll("e")[0]);
    return step.filters[2].subprop_value[0] === "1"
      ? new Response("rate limited", { status: 429 })
      : Response.json(funnelBody(1000, 20));
  };
  await assert.rejects(
    getArmResults({ id: "exp_x", start: "2026-10-01", end: "2026-10-09" }, ENV, NOW),
    /429/,
  );
});
