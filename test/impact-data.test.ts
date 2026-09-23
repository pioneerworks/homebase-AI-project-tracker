import assert from "node:assert/strict";
import { test } from "node:test";

import {
  isChore,
  mergeStats,
  ticketKey,
  type MergedPr,
} from "../src/lib/merges";
import { mapOmniRows, omniConfigured } from "../src/lib/omni";
import { sampleSignups } from "../src/lib/mock-signups";

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

test("sample signup series is deterministic and well-formed", () => {
  const a = sampleSignups();
  const b = sampleSignups();
  assert.equal(a.length, b.length);
  assert.deepEqual(a[0], b[0]);
  assert.equal(a.length, 71);
  for (const day of a) {
    assert.match(day.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(day.signups > 0);
    assert.ok(day.rate > 0 && day.rate < 1);
  }
});

test("mapOmniRows supports object and column-array rows", () => {
  const fieldMap = {
    date: "signups.day",
    count: "signups.count",
    rate: "signups.rate",
  };
  const fromObjects = mapOmniRows(
    fieldMap ? Object.values(fieldMap) : [],
    [
      { "signups.day": "2026-09-01T00:00:00Z", "signups.count": 12, "signups.rate": 0.03 },
      { "signups.day": "bad", "signups.count": 5, "signups.rate": 0.03 },
    ],
    fieldMap,
  );
  assert.deepEqual(fromObjects, [
    { date: "2026-09-01", signups: 12, rate: 0.03 },
  ]);

  const fromArrays = mapOmniRows(
    ["signups.day", "signups.count", "signups.rate"],
    [["2026-09-02T00:00:00Z", 30, 0.041]],
    fieldMap,
  );
  assert.deepEqual(fromArrays, [
    { date: "2026-09-02", signups: 30, rate: 0.041 },
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
