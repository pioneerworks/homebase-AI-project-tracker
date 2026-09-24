import assert from "node:assert/strict";
import { test } from "node:test";

import {
  aggregateFromLines,
  amplitudeConfig,
  toSignupDays,
} from "../src/lib/amplitude";
import { mergeSignupSources } from "../src/lib/omni";
import type { SignupDay } from "../src/lib/signup-data";

const config = {
  signupEvent: "Owner Account Created",
  pageviewEvent: "Page Viewed",
  productAreaPrefix: "mw_",
};

const ev = (over: Record<string, unknown>) =>
  JSON.stringify({
    event_time: "2026-09-01T12:00:00.000Z",
    user_id: "u1",
    device_id: "d1",
    event_properties: { product_area: "mw_home", device_family: "Windows" },
    ...over,
  });

test("aggregateFromLines counts unique users per day with funnel filters", () => {
  const lines = [
    // qualifying pageview + signup for u1
    ev({ event_type: "Page Viewed" }),
    ev({ event_type: "Owner Account Created" }),
    // same user again — must not double count
    ev({ event_type: "Page Viewed", event_time: "2026-09-01T20:00:00Z" }),
    // second user pageview only
    ev({ user_id: "u2", event_type: "Page Viewed" }),
    // Linux device excluded
    ev({ user_id: "u3", event_properties: { product_area: "mw_home", device_family: "Linux" } }),
    // non-mw product area excluded
    ev({ user_id: "u4", event_properties: { product_area: "blog", device_family: "Mac" } }),
    // signup without pageview counts toward signups only
    ev({ user_id: "u5", event_type: "Owner Account Created" }),
    // next day pageview
    ev({ user_id: "u2", event_time: "2026-09-02T10:00:00Z", event_type: "Page Viewed" }),
    // other event types ignored
    ev({ event_type: "Button Click" }),
    // malformed line skipped
    "not json",
  ];

  const byDay = aggregateFromLines(lines, config);
  const days = toSignupDays(byDay);

  assert.equal(days.length, 2);
  const d1 = days.find((d) => d.date === "2026-09-01")!;
  const d2 = days.find((d) => d.date === "2026-09-02")!;
  // u1, u5 (signup only, no pageview) signed up; u1, u2 viewed
  assert.equal(d1.signups, 2);
  assert.equal(d1.traffic, 2);
  assert.equal(d1.rate, 1); // 2 signups / 2 viewers in this tiny fixture
  assert.equal(d2.traffic, 1);
  assert.equal(d2.signups, 0);
  assert.equal(d2.rate, 0);
});

test("aggregateFromLines falls back to device_id when user_id is absent", () => {
  const lines = [
    ev({ user_id: null, device_id: "anon-1", event_type: "Page Viewed" }),
    ev({ user_id: null, device_id: "anon-1", event_type: "Page Viewed" }),
  ];
  const days = toSignupDays(aggregateFromLines(lines, config));
  assert.equal(days[0].traffic, 1);
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
