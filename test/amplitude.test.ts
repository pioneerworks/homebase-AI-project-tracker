import assert from "node:assert/strict";
import { test } from "node:test";

import {
  amplitudeConfig,
  funnelQuery,
  funnelToSignupDays,
} from "../src/lib/amplitude";
import { mergeSignupSources } from "../src/lib/omni";
import type { SignupDay } from "../src/lib/signup-data";

const config = amplitudeConfig({ AMPLITUDE_API_KEY: "k", AMPLITUDE_SECRET: "s" })!;

test("funnelQuery asks for the dashboard's daily Page Viewed → signup funnel", () => {
  const now = Date.UTC(2026, 9, 1, 15, 42); // Oct 1, mid-day
  const { url, windowStart } = funnelQuery(config, now);
  const params = new URL(url).searchParams;

  assert.equal(new URL(url).origin + new URL(url).pathname, "https://amplitude.com/api/2/funnels");
  const [pageview, signup] = params.getAll("e").map((e) => JSON.parse(e));
  assert.deepEqual(pageview, {
    event_type: "Page Viewed",
    filters: [
      { subprop_type: "event", subprop_key: "product_area", subprop_op: "contains", subprop_value: ["mw_"] },
      { subprop_type: "user", subprop_key: "device", subprop_op: "is not", subprop_value: ["Linux"] },
    ],
  });
  assert.deepEqual(signup, { event_type: "Owner Account Created", filters: [] });
  assert.equal(params.get("mode"), "ordered");
  assert.equal(params.get("i"), "1");
  assert.equal(params.get("cs"), "86400");
  // 30 complete days, ending yesterday; today's partial day is excluded
  assert.equal(params.get("end"), "20260930");
  assert.equal(params.get("start"), "20260901");
  assert.equal(windowStart, "2026-09-01");
});

test("funnelToSignupDays maps daily step counts to traffic, signups and rate", () => {
  const body = {
    data: [
      {
        dayFunnels: {
          xValues: ["2026-09-29", "2026-09-30"],
          series: [
            [20840, 250],
            [20807, 252],
          ],
        },
      },
    ],
  };
  assert.deepEqual(funnelToSignupDays(body), [
    { date: "2026-09-29", signups: 250, traffic: 20840, rate: 250 / 20840 },
    { date: "2026-09-30", signups: 252, traffic: 20807, rate: 252 / 20807 },
  ]);
});

test("funnelToSignupDays gives a null rate on a zero-traffic day", () => {
  const body = { data: [{ dayFunnels: { xValues: ["2026-09-29"], series: [[0, 0]] } }] };
  assert.deepEqual(funnelToSignupDays(body), [
    { date: "2026-09-29", signups: 0, traffic: 0, rate: null },
  ]);
});

test("funnelToSignupDays rejects a response without daily funnel data", () => {
  assert.throws(() => funnelToSignupDays({ data: [] }), /no daily funnel data/);
  assert.throws(() => funnelToSignupDays({}), /no daily funnel data/);
});

test("amplitudeConfig ignores masked or missing credentials", () => {
  assert.equal(
    amplitudeConfig({ AMPLITUDE_API_KEY: "[SENSITIVE]", AMPLITUDE_SECRET: "[SENSITIVE]" }),
    null,
  );
  assert.equal(amplitudeConfig({ AMPLITUDE_API_KEY: "k" }), null);
  assert.deepEqual(
    amplitudeConfig({ AMPLITUDE_API_KEY: "k", AMPLITUDE_SECRET: "s" }),
    {
      apiKey: "k",
      secret: "s",
      signupEvent: "Owner Account Created",
      pageviewEvent: "Page Viewed",
      productAreaPrefix: "mw_",
      windowDays: 30,
    },
  );
  assert.equal(
    amplitudeConfig({
      AMPLITUDE_API_KEY: "k",
      AMPLITUDE_SECRET: "s",
      AMPLITUDE_SIGNUP_EVENT: "Custom Event",
    })?.signupEvent,
    "Custom Event",
  );
});

test("mergeSignupSources prefers amplitude days and keeps older captured days", () => {
  const captured: SignupDay[] = [
    { date: "2026-08-01", signups: 400, traffic: 2400, rate: 0.17 },
    { date: "2026-09-01", signups: 500, traffic: 2500, rate: 0.2 },
  ];
  const amplitude = {
    windowStart: "2026-08-25",
    days: [{ date: "2026-09-01", signups: 480, traffic: 2100, rate: 0.229 }],
  };
  const merged = mergeSignupSources(captured, amplitude);
  assert.deepEqual(merged, [
    { date: "2026-08-01", signups: 400, traffic: 2400, rate: 0.17 },
    { date: "2026-09-01", signups: 480, traffic: 2100, rate: 0.229 },
  ]);
  // no amplitude -> captured untouched
  assert.deepEqual(mergeSignupSources(captured, null), captured);
});
