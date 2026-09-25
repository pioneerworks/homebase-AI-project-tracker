import assert from "node:assert/strict";
import { test } from "node:test";

import {
  classifyPageTouch,
  extractRoute,
  isChore,
  mergeStats,
  pageTouchCount,
  ticketKey,
  type MergedPr,
} from "../src/lib/merges";
import { mapOmniRows, omniConfigured } from "../src/lib/omni";
import { signupHistory } from "../src/lib/signup-data";

const pr = (over: Partial<MergedPr> = {}): MergedPr => ({
  number: 1,
  title: "feat: something",
  mergedAt: "2026-09-01T12:00:00Z",
  author: "twong-prog",
  labels: [],
  ...over,
});

test("mergeStats buckets and aggregates per-day counts", () => {
  const stats = mergeStats([
    { date: "2026-09-01", count: 3, prs: [] },
    { date: "2026-09-02", count: 0, prs: [] },
    { date: "2026-09-03", count: 9, prs: [] },
  ]);
  assert.equal(stats.total, 12);
  assert.equal(stats.daysWithMerges, 2);
  assert.equal(stats.firstMergeDay, "2026-09-01");
  assert.equal(stats.lastMergeDay, "2026-09-03");
  assert.equal(stats.medianPerActiveDay, 9);
});

test("ticketKey extracts Linear ticket keys from PR titles", () => {
  assert.equal(ticketKey("AIA-3293: A/B test URL split"), "AIA-3293");
  assert.equal(ticketKey("ATR-100 fix hero"), "ATR-100");
  assert.equal(ticketKey("fix: signup form spacing"), null);
});

test("isChore filters housekeeping merges", () => {
  assert.equal(isChore(pr({ title: "chore: bump deps" })), true);
  assert.equal(isChore(pr({ title: "docs: readme" })), true);
  assert.equal(isChore(pr({ author: "vercel[bot]" })), true);
  assert.equal(isChore(pr({ title: "feat: AIA-100 new section" })), false);
});

test("extractRoute pulls a leading route path from a title", () => {
  assert.equal(extractRoute("feat(pages): native /payroll page"), "/payroll");
  assert.equal(
    extractRoute("feat(industry-payroll): migrate /industry/retail-payroll off Webflow"),
    "/industry/retail-payroll",
  );
  assert.equal(extractRoute("chore(deps): bump sharp"), null);
});

test("classifyPageTouch marks route and page-keyword PRs as page-touching", () => {
  assert.equal(
    classifyPageTouch(pr({ title: "feat(pages): native /payroll page" })).touchesPage,
    true,
  );
  assert.equal(
    classifyPageTouch(
      pr({ title: "feat(service-other): migrate service-other page family off Webflow" }),
    ).touchesPage,
    true,
  );
  assert.equal(
    classifyPageTouch(pr({ title: "Fix homepage visual-parity gaps" })).touchesPage,
    true,
  );
  assert.equal(
    classifyPageTouch(pr({ title: "AIA-1028: Port /methodology" })).route,
    "/methodology",
  );
});

test("classifyPageTouch marks infra, deps, docs, and bot PRs as not page-touching", () => {
  assert.equal(
    classifyPageTouch(pr({ title: "chore(deps): bump sharp" })).touchesPage,
    false,
  );
  assert.equal(
    classifyPageTouch(pr({ title: "docs(agents): announce every finished PR" })).touchesPage,
    false,
  );
  assert.equal(
    classifyPageTouch(pr({ title: "feat(seo): pages collection, per-page meta from the DB" }))
      .touchesPage,
    false,
  );
  assert.equal(
    classifyPageTouch(pr({ author: "app/dependabot", title: "bump next" })).touchesPage,
    false,
  );
});

test("classifyPageTouch lets an explicit GitHub label override the heuristic", () => {
  assert.equal(
    classifyPageTouch(
      pr({ title: "chore(deps): bump sharp", labels: ["page"] }),
    ).touchesPage,
    true,
  );
  assert.equal(
    classifyPageTouch(
      pr({ title: "ATR-10: Restore employee scheduling subhead copy", labels: ["page", "page:publish"] }),
    ).touchesPage,
    true,
  );
  assert.equal(
    classifyPageTouch(
      pr({ title: "feat(home): rebuild the homepage", labels: ["infra"] }),
    ).touchesPage,
    false,
  );
  assert.equal(
    classifyPageTouch(
      pr({ title: "chore(deps): bump sharp", labels: ["page"] }),
    ).source,
    "label",
  );
  assert.equal(
    classifyPageTouch(
      pr({ title: "Add end-of-year payroll offer landing page", labels: ["paid-lp", "paid-lp:publish"] }),
    ).touchesPage,
    true,
  );
});

test("pageTouchCount counts only page-touching PRs", () => {
  const prs = [
    pr({ title: "feat(pages): native /payroll page" }),
    pr({ title: "chore(deps): bump sharp" }),
    pr({ title: "fix(pricing): restore /pricing parity with live" }),
  ];
  assert.equal(pageTouchCount(prs), 2);
});

test("captured signup history is well-formed and rate = signups/traffic", () => {
  assert.ok(signupHistory.length > 60, "expected a substantial history");
  const dates = signupHistory.map((d) => d.date);
  assert.deepEqual(dates, [...dates].sort(), "dates must be sorted");
  for (const day of signupHistory) {
    assert.match(day.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(day.signups > 0, day.date + " should have signups");
    if (day.traffic > 0) {
      // derived traffic must reproduce the rate within rounding tolerance
      assert.ok(
        Math.abs(day.rate! - day.signups / day.traffic) < 0.001,
        day.date + " rate mismatch",
      );
    } else {
      assert.equal(day.rate, null);
    }
  }
});

test("mapOmniRows supports object and column-array rows", () => {
  const fieldMap = {
    date: "signups.day",
    count: "signups.count",
    rate: "signups.rate",
  };
  const fromObjects = mapOmniRows(
    ["signups.day", "signups.count", "signups.rate"],
    [
      { "signups.day": "2026-09-01T00:00:00Z", "signups.count": 12, "signups.rate": 0.03 },
      { "signups.day": "bad", "signups.count": 5, "signups.rate": 0.03 },
    ],
    fieldMap,
  );
  assert.deepEqual(fromObjects, [
    { date: "2026-09-01", signups: 12, traffic: 0, rate: 0.03 },
  ]);

  const fromArrays = mapOmniRows(
    ["signups.day", "signups.count", "signups.rate"],
    [["2026-09-02T00:00:00Z", 30, 0.041]],
    fieldMap,
  );
  assert.deepEqual(fromArrays, [
    { date: "2026-09-02", signups: 30, traffic: 0, rate: 0.041 },
  ]);
});

test("omniConfigured requires all connection env vars and ignores placeholders", () => {
  assert.equal(
    omniConfigured({
      OMNI_API_KEY: "[SENSITIVE_VALUE_EXCLUDED]",
      OMNI_INSTANCE_URL: "https://x.omniapp.co",
      OMNI_MODEL_ID: "m",
      OMNI_SIGNUPS_TABLE: "t",
      OMNI_SIGNUPS_DATE_FIELD: "d",
      OMNI_SIGNUPS_COUNT_FIELD: "c",
    }),
    false,
  );
  assert.equal(omniConfigured({}), false);
  assert.equal(
    omniConfigured({
      OMNI_API_KEY: "tok_123",
      OMNI_INSTANCE_URL: "https://x.omniapp.co",
      OMNI_MODEL_ID: "m",
      OMNI_SIGNUPS_TABLE: "t",
      OMNI_SIGNUPS_DATE_FIELD: "d",
      OMNI_SIGNUPS_COUNT_FIELD: "c",
    }),
    true,
  );
});
