import assert from "node:assert/strict";
import { test } from "node:test";

import type { ProjectMilestoneSummary, ProjectOverview } from "../src/lib/linear-projects";
import {
  attentionItems,
  attentionSummary,
  initials,
  healthState,
  projectIdentity,
  projectState,
  type AttentionProject,
} from "../src/lib/overview";
import type { ExperimentCard } from "../src/lib/statsig";

const milestone = (over: Partial<ProjectMilestoneSummary> = {}): ProjectMilestoneSummary => ({
  id: "m1",
  name: "M1 · First live experiments",
  description: null,
  targetDate: "2026-09-25",
  progress: 19,
  issues: [],
  ...over,
});

const overview = (
  over: Partial<Pick<ProjectOverview, "health" | "milestones">> = {},
): ProjectOverview =>
  ({
    health: "onTrack",
    milestones: [milestone()],
    ...over,
  }) as ProjectOverview;

const experiment = (over: Partial<ExperimentCard> = {}): ExperimentCard => ({
  id: "exp_a",
  title: "Scheduling LP module",
  permalink: "https://console.statsig.com/x",
  hypothesis: null,
  started: "2026-09-24",
  day: 4,
  durationDays: 28,
  primaryMetric: "Owner signups",
  percentChange: -53.4,
  ci: [-75, -22.6],
  pValue: 0.004,
  significant: true,
  controlRate: 0.025,
  testRate: 0.0116,
  controlUnits: 1683,
  testUnits: 1720,
  verdict: "losing",
  noDataReason: null,
  ...over,
});

const fmt = (iso: string) => iso;

test("projectState: an overdue milestone overrides reported health", () => {
  const state = projectState(overview(), "2026-09-28");
  assert.equal(state.key, "overdue");
  assert.equal(state.label, "Overdue");
  assert.equal(state.lateDays, 3);
});

test("projectState: due today is not overdue", () => {
  assert.equal(projectState(overview(), "2026-09-25").key, "onTrack");
});

test("projectState: falls back to Linear health, then No health set", () => {
  const undated = [milestone({ targetDate: null })];
  assert.equal(projectState(overview({ milestones: undated, health: "atRisk" }), "2026-09-28").key, "atRisk");
  assert.equal(projectState(overview({ milestones: undated, health: null }), "2026-09-28").key, "none");
  assert.equal(projectState(null, "2026-09-28").key, "none");
});

test("projectState: completed milestones are never overdue", () => {
  const done = [milestone({ progress: 100 })];
  assert.equal(projectState(overview({ milestones: done }), "2026-09-28").key, "onTrack");
});

test("attentionItems: losing experiments first, then flagged projects in order", () => {
  const today = "2026-09-28";
  const projects: AttentionProject[] = [
    { key: "a", name: "Agents", overview: overview({ milestones: [] }), state: projectState(overview({ milestones: [] }), today) },
    { key: "b", name: "A/B testing", overview: overview(), state: projectState(overview(), today) },
    {
      key: "c",
      name: "Tools",
      overview: overview({ health: "offTrack", milestones: [] }),
      state: projectState(overview({ health: "offTrack", milestones: [] }), today),
    },
  ];
  const items = attentionItems(
    [experiment(), experiment({ id: "exp_b", verdict: "winning", percentChange: 7.3 })],
    projects,
    fmt,
  );
  assert.deepEqual(
    items.map((i) => i.kind),
    ["experiment", "overdue", "health"],
  );
  assert.equal(items[0].title, "Losing: Scheduling LP module");
  assert.equal(items[0].meta, "−53.4% Owner signups · significant (p = 0.004)");
  assert.equal(items[1].title, "A/B testing · M1 · First live experiments");
  assert.equal(items[1].meta, "Due 2026-09-25 · 19% done");
  assert.equal(items[2].title, "Tools is off track");
  assert.equal(attentionSummary(items, projects), "1 overdue · 1 off track · 1 losing test");
});

test("attentionItems: no experiments and healthy projects means nothing to flag", () => {
  const projects: AttentionProject[] = [
    { key: "a", name: "Agents", overview: null, state: projectState(null, "2026-09-28") },
  ];
  assert.deepEqual(attentionItems(null, projects, fmt), []);
});

test("initials", () => {
  assert.equal(initials("Brian Nguyen"), "BN");
  assert.equal(initials("Loki"), "L");
  assert.equal(initials(null), "?");
});

test("projectState: a dated open milestone wins over an undated one", () => {
  const milestones = [
    milestone({ id: "u", name: "Undated", targetDate: null, progress: 10 }),
    milestone({ id: "d", name: "Dated", targetDate: "2026-09-20", progress: 50 }),
  ];
  const state = projectState(overview({ milestones }), "2026-09-28");
  assert.equal(state.key, "overdue");
  assert.equal(state.lateDays, 8);
});

test("projectState: tolerates a relay payload without milestones", () => {
  const legacy = { health: "onTrack", milestones: undefined } as unknown as ProjectOverview;
  assert.equal(projectState(legacy, "2026-09-28").key, "onTrack");
});

test("projectIdentity uses Linear's live name and summary", () => {
  assert.deepEqual(
    projectIdentity("ab-testing", { name: " A/B testing ", description: " Building the environment. " }),
    { name: "A/B testing", description: "Building the environment." },
  );
});

test("projectIdentity has no hardcoded copy to fall back to", () => {
  assert.deepEqual(projectIdentity("ab-testing", null), { name: "ab-testing", description: "" });
  assert.deepEqual(projectIdentity("ab-testing", { name: "  ", description: null }), {
    name: "ab-testing",
    description: "",
  });
});

test("healthState follows Linear health, even with an overdue milestone", () => {
  // M1 due Sep 25, still open: the table calls this overdue, the dot doesn't
  assert.equal(projectState(overview(), "2026-10-01").key, "overdue");
  assert.equal(healthState(overview()), "onTrack");
  assert.equal(healthState(overview({ health: "atRisk" })), "atRisk");
  assert.equal(healthState(overview({ health: "offTrack" })), "offTrack");
  assert.equal(healthState(overview({ health: null })), "none");
  assert.equal(healthState(null), "none");
});
