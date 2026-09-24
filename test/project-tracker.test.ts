import assert from "node:assert/strict";
import { test } from "node:test";

import { nextMilestone, toProjectOverview } from "../src/lib/linear-projects";
import { dailySignupSummary, pctChange, torontoToday } from "../src/lib/standup";

const issue = (over: Record<string, unknown> = {}) => ({
  identifier: "AIA-1",
  title: "Do the thing",
  url: "https://linear.app/x/issue/AIA-1",
  completedAt: null,
  canceledAt: null,
  state: { name: "Backlog", type: "backlog" },
  assignee: { name: "Loki Nichlani" },
  projectMilestone: { id: "m1" },
  ...over,
});

const projectNode = (over: Record<string, unknown> = {}) => ({
  id: "p1",
  name: "A/B testing",
  slugId: "d9f5d074ffc1",
  description: "One-line summary.",
  content: "## Why\n\nThe full brief.",
  icon: null,
  color: null,
  status: { name: "Now" },
  lead: { name: "Loki Nichlani" },
  health: "atRisk",
  targetDate: "2026-10-30",
  startedAt: null,
  projectMilestones: {
    nodes: [
      { id: "m2", name: "M2", description: null, targetDate: "2026-10-09", progress: 0, sortOrder: 2 },
      { id: "m1", name: "M1", description: "Ship it", targetDate: "2026-09-25", progress: 16.67, sortOrder: 1 },
    ],
  },
  issues: {
    nodes: [
      issue({ identifier: "AIA-2", state: { name: "Done", type: "completed" }, completedAt: "2026-09-20T00:00:00Z" }),
      issue({ identifier: "AIA-3", state: { name: "In Progress", type: "started" }, assignee: null }),
      issue({ identifier: "AIA-4", projectMilestone: { id: "m2" } }),
      issue({ identifier: "AIA-5", projectMilestone: null }),
    ],
  },
  projectUpdates: { nodes: [] },
  ...over,
});

test("toProjectOverview maps owner, health, brief and milestones", () => {
  const overview = toProjectOverview(projectNode() as never);
  assert.equal(overview.lead, "Loki Nichlani");
  assert.equal(overview.health, "atRisk");
  assert.equal(overview.content, "## Why\n\nThe full brief.");
  assert.deepEqual(
    overview.milestones.map((m) => [m.name, m.progress]),
    [
      ["M1", 17],
      ["M2", 0],
    ],
  );
  // milestone issues: in-flight work first, done after, unassigned kept
  assert.deepEqual(
    overview.milestones[0].issues.map((i) => [i.identifier, i.assignee]),
    [
      ["AIA-3", null],
      ["AIA-2", "Loki Nichlani"],
    ],
  );
  assert.deepEqual(overview.milestones[1].issues.map((i) => i.identifier), ["AIA-4"]);
});

test("toProjectOverview tolerates missing lead, health and brief", () => {
  const overview = toProjectOverview(
    projectNode({ lead: null, health: null, content: "  " }) as never,
  );
  assert.equal(overview.lead, null);
  assert.equal(overview.health, null);
  assert.equal(overview.content, null);
});

test("nextMilestone picks the earliest-dated open milestone", () => {
  const m = (name: string, targetDate: string | null, progress: number) => ({
    id: name,
    name,
    description: null,
    targetDate,
    progress,
    issues: [],
  });
  assert.equal(
    nextMilestone([m("done", "2026-09-01", 100), m("later", "2026-10-09", 0), m("soon", "2026-09-25", 20)])?.name,
    "soon",
  );
  assert.equal(nextMilestone([m("undated", null, 0)])?.name, "undated");
  assert.equal(nextMilestone([m("done", "2026-09-01", 100)]), null);
});

test("dailySignupSummary skips today's partial day and compares day and week", () => {
  const day = (date: string, signups: number) => ({ date, signups, traffic: 100, rate: signups / 100 });
  const days = [
    day("2026-09-15", 200),
    day("2026-09-21", 274),
    day("2026-09-22", 237),
    day("2026-09-23", 12), // today, partial
  ];
  const summary = dailySignupSummary(days, "2026-09-23");
  assert.equal(summary?.date, "2026-09-22");
  assert.equal(summary?.signups, 237);
  assert.deepEqual(summary?.prevDay, { date: "2026-09-21", signups: 274 });
  assert.deepEqual(summary?.lastWeek, { date: "2026-09-15", signups: 200 });
  assert.equal(dailySignupSummary([day("2026-09-23", 5)], "2026-09-23"), null);
});

test("pctChange has no baseline for missing or zero values", () => {
  assert.equal(pctChange(110, 100)?.toFixed(1), "10.0");
  assert.equal(pctChange(10, 0), null);
  assert.equal(pctChange(10, null), null);
});

test("torontoToday uses the Toronto calendar", () => {
  // 02:00 UTC on Sep 24 is still Sep 23 in Toronto
  assert.equal(torontoToday(new Date("2026-09-24T02:00:00Z")), "2026-09-23");
});

test("presetRange anchors on the latest day and clamps to the first", async () => {
  const { presetRange } = await import("../src/lib/standup");
  assert.deepEqual(presetRange("7d", "2026-06-01", "2026-09-22"), { from: "2026-09-16", to: "2026-09-22" });
  assert.deepEqual(presetRange("90d", "2026-08-01", "2026-09-22"), { from: "2026-08-01", to: "2026-09-22" });
  assert.deepEqual(presetRange("all", "2026-06-01", "2026-09-22"), { from: "2026-06-01", to: "2026-09-22" });
});
