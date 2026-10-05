import assert from "node:assert/strict";
import { test } from "node:test";

import {
  armUrls,
  buildCalendar,
  buildKpis,
  buildNav,
  dailyFromCumulative,
  experimentPath,
  filterItems,
  formatLift,
  formatRate,
  hubStatus,
  ownerOf,
  parseFilters,
  pickDecision,
  significanceLabel,
  sortExperiments,
  surfaceOf,
  srm,
  toCsv,
  toListItem,
} from "../src/lib/experiments-derive";
import type { ExperimentListItem } from "../src/lib/experiments-types";
import type { ExperimentPulseResultsDto, ExternalExperimentDto } from "../src/lib/statsig-types";

function exp(overrides: Partial<ExternalExperimentDto> = {}): ExternalExperimentDto {
  return {
    id: "exp_free_employee_scheduling_app_lp_module",
    name: "exp_free_employee_scheduling_app_lp_module",
    status: "active",
    startTime: Date.UTC(2026, 8, 25),
    duration: 28,
    tags: ["Marketing"],
    description: 'A/B test on /free-employee-scheduling-app-lp: "module" varies between the groups.',
    owner: { ownerName: "CONSOLE API - console-3nfq" },
    lastModifierName: "Meg Jump",
    groups: [
      { name: "control", id: "c1", size: 50, isControl: true, parameterValues: {} },
      { name: "test", id: "t1", size: 50, parameterValues: {} },
    ],
    secondaryMetrics: [
      { name: "1D1", type: "user_warehouse" },
      { name: "Week1-2D7", type: "user_warehouse" },
    ],
    ...overrides,
  };
}

function pulse(
  primary: Partial<ExperimentPulseResultsDto["primaryMetrics"][number]>,
  secondary?: Partial<NonNullable<ExperimentPulseResultsDto["secondaryMetrics"]>[number]>,
): ExperimentPulseResultsDto {
  return {
    primaryMetrics: [
      {
        metricID: "Owner Signups::user_warehouse",
        metricName: "Owner Signups",
        directionality: "increase",
        ...primary,
      },
    ],
    secondaryMetrics: secondary
      ? [
          {
            metricID: "1D1::user_warehouse",
            metricName: "1D1",
            directionality: "increase",
            ...secondary,
          },
        ]
      : undefined,
  };
}

const scheduling = exp();

const schedulingPulse = pulse(
  {
    controlMean: 0.02086981903093987,
    testMean: 0.02024811065164694,
    controlUnits: 6852,
    testUnits: 7013,
    percentChange: -2.9789830873532517,
    pValue: 0.7964795069605728,
    adjustedAlpha: 0.05,
  },
  {
    controlMean: 0.11188811188811189,
    testMean: 0.1347517730496454,
    controlUnits: 143,
    testUnits: 141,
    percentChange: 20.43439716312057,
    pValue: 0.5578,
  },
);

const base: ExperimentListItem = {
  id: "exp_base",
  name: "Base Experiment",
  path: null,
  surface: "landing_page",
  status: "live",
  primaryMetric: null,
  owner: null,
  statsigUrl: null,
  hypothesis: null,
  guardrails: "—",
  plannedRun: "—",
  controlRate: null,
  testRate: null,
  lift: null,
  pValue: null,
  verdict: "no-data",
  controlN: null,
  testN: null,
  day: null,
  totalDays: null,
  startDate: null,
  endDate: null,
  targetSplit: [50, 50],
  armUrls: { control: null, test: null },
  armNames: { control: "control", test: "test" },
  results: [],
  progressLabel: "Unscheduled",
};

test("hubStatus maps Statsig statuses", () => {
  assert.equal(hubStatus(exp({ status: "active" })), "live");
  assert.equal(hubStatus(exp({ status: "setup" })), "draft");
  assert.equal(hubStatus(exp({ status: "setup", tags: ["queued"] })), "queued");
  assert.equal(hubStatus(exp({ status: "setup", scheduledStartTime: Date.UTC(2026, 9, 20) })), "queued");
  for (const s of ["decision_made", "experiment_stopped", "assignment_stopped"] as const)
    assert.equal(hubStatus(exp({ status: s })), "concluded");
  assert.equal(hubStatus(exp({ status: "archived" })), null);
  assert.equal(hubStatus(exp({ status: "abandoned" })), null);
});

test("experimentPath prefers description, then sidecar URL, then destination_url", () => {
  assert.equal(experimentPath(exp({ description: 'A/B test on /free-time-clock-app-lp: "x" varies' })), "/free-time-clock-app-lp");
  assert.equal(experimentPath(exp({ description: "", sidecarEditorURL: "https://www.joinhomebase.com/pricing" })), "/pricing");
  assert.equal(experimentPath(exp({ description: "", groups: [{ name: "control", id: "c", size: 50, isControl: true, parameterValues: { destination_url: "https://www.joinhomebase.com/solutions" } }, { name: "test", id: "t", size: 50, parameterValues: {} }] })), "/solutions");
  assert.equal(experimentPath(exp({ description: "" })), null);
});

test("surfaceOf classifies paths", () => {
  assert.equal(surfaceOf("/signup/owner"), "signup_flow");
  assert.equal(surfaceOf("/tools/overtime"), "tool_page");
  assert.equal(surfaceOf("/free-time-clock-app-lp"), "landing_page");
  assert.equal(surfaceOf(null), "landing_page");
});

test("ownerOf skips CONSOLE API owners", () => {
  assert.equal(ownerOf(exp({ owner: { ownerName: "CONSOLE API - console-3nfq" }, lastModifierName: "Meg Jump" })), "Meg Jump");
  assert.equal(ownerOf(exp({ owner: { ownerName: "Brian Nguyen" } })), "Brian Nguyen");
  assert.equal(ownerOf(exp({ owner: { ownerName: "" }, lastModifierName: "CONSOLE API - x" })), null);
});

test("toListItem flattens the live scheduling experiment", () => {
  const item = toListItem(scheduling, schedulingPulse, Date.UTC(2026, 9, 4, 12));
  assert.equal(item.status, "live");
  assert.equal(item.path, "/free-employee-scheduling-app-lp");
  assert.equal(item.owner, "Meg Jump");
  assert.equal(item.controlRate?.toFixed(2), "2.09");
  assert.equal(item.testRate?.toFixed(2), "2.02");
  assert.equal(item.lift?.toFixed(1), "-3.0");
  assert.equal(item.verdict, "no-signal");
  assert.equal(item.controlN, 6852);
  assert.equal(item.day, 10);
  assert.equal(item.progressLabel, "Day 10 of 28");
  assert.equal(item.guardrails, "1D1 · Week1-2D7");
  assert.deepEqual(item.results.map((r) => [r.label, r.control, r.test]), [["Sign ups", 143, 142], ["1D1s", 16, 19]]);
});

test("toListItem handles missing pulse", () => {
  const item = toListItem(scheduling, undefined, Date.UTC(2026, 9, 4));
  assert.equal(item.controlRate, null);
  assert.equal(item.lift, null);
  assert.equal(item.verdict, "no-data");
  assert.equal(significanceLabel(item).text, "—");
  const errored = toListItem(scheduling, { primaryMetrics: [{ metricID: "m", metricName: "Owner Signups", error: "no_data" }] }, Date.UTC(2026, 9, 4));
  assert.equal(errored.lift, null);
  assert.equal(formatLift(errored.lift), "—");
});

test("formatting uses real minus and fixed decimals", () => {
  assert.equal(formatLift(-53.43), "−53.4%");
  assert.equal(formatLift(7.3), "+7.3%");
  assert.equal(formatLift(null), "—");
  assert.equal(formatRate(2.5), "2.50%");
});

test("significanceLabel per verdict", () => {
  assert.deepEqual(significanceLabel({ ...base, status: "live", verdict: "losing", pValue: 0.004 }), { text: "Sig. loss", tone: "danger" });
  assert.deepEqual(significanceLabel({ ...base, status: "live", verdict: "winning", pValue: 0.01 }), { text: "Sig. win", tone: "success" });
  assert.deepEqual(significanceLabel({ ...base, status: "live", verdict: "no-signal", pValue: 0.7964 }), { text: "Not yet · p≈0.80", tone: "muted" });
  assert.deepEqual(significanceLabel({ ...base, status: "queued", verdict: "no-data", pValue: null }), { text: "—", tone: null });
});

test("srm matches chi-square goodness of fit", () => {
  assert.equal(srm([6852, 7013], [50, 50])!.pValue.toFixed(2), "0.17");
  assert.equal(srm([6852, 7013], [50, 50])!.ok, true);
  assert.equal(srm([1000, 1200], [50, 50])!.ok, false);
});

test("srm returns null when target split is degenerate", () => {
  assert.equal(srm([0, 0], [50, 50]), null);
  assert.equal(srm([10, 10], [0, 0]), null);
});

test("dailyFromCumulative clamps negative deltas", () => {
  assert.deepEqual(
    dailyFromCumulative([{ date: "d1", value: 566 }, { date: "d2", value: 1075 }, { date: "d3", value: 1070 }]),
    [{ date: "d1", value: 566 }, { date: "d2", value: 509 }, { date: "d3", value: 0 }],
  );
});

test("sortExperiments orders live, queued, draft, concluded", () => {
  const sorted = sortExperiments([{ ...base, id: "c", status: "concluded" }, { ...base, id: "d", status: "draft" }, { ...base, id: "l", status: "live" }, { ...base, id: "q", status: "queued" }]);
  assert.deepEqual(sorted.map((i) => i.id), ["l", "q", "d", "c"]);
});

test("pickDecision picks first losing live experiment", () => {
  assert.equal(pickDecision([{ ...base, status: "live", verdict: "no-signal" }]), null);
  const d = pickDecision([{ ...base, id: "x", name: "Scheduling LP Module", status: "live", verdict: "losing", controlRate: 2.5, testRate: 1.16, lift: -53.6, pValue: 0.004, testN: 1720, day: 4 }]);
  assert.equal(d?.experimentId, "x");
  assert.equal(d?.title, "Needs a decision: stop the Scheduling LP Module test");
  assert.match(d!.body, /^Test arm converts at less than half of control \(2\.50% → 1\.16%, p = 0\.004\)\. Keeping it live costs roughly 6 owner signups a day\.$/);
  const mild = pickDecision([{ ...base, status: "live", verdict: "losing", controlRate: 2.5, testRate: 2.0, lift: -20, pValue: 0.03, testN: 1000, day: 5 }]);
  assert.match(mild!.body, /^Test arm converts below control/);
});

test("buildKpis computes the five cells", () => {
  const items = [
    { ...base, status: "live" as const, surface: "landing_page" as const, verdict: "losing" as const, results: [{ label: "Sign ups", control: 42, test: 20, controlRate: 2.5, testRate: 1.16, lift: -53.6 }] },
    { ...base, status: "live" as const, surface: "landing_page" as const, verdict: "no-signal" as const, results: [{ label: "Sign ups", control: 33, test: 38, controlRate: 2.79, testRate: 3.0, lift: 7.3 }] },
    { ...base, status: "queued" as const },
  ];
  const kpis = buildKpis(items, { visitors7d: { control: 2864, test: 2987 }, milestone: { progress: 19, targetDate: "2026-09-25" }, today: "2026-09-28" });
  assert.deepEqual(kpis.map((k) => [k.label, k.value, k.context]), [
    ["Live tests", "2", "2 landing pages · 0 signup flow"],
    ["Significant results", "1", "1 loss · 0 wins"],
    ["Visitors in test · 7d", "5,851", "2,864 control · 2,987 test"],
    ["Owner signups in test", "133", "Control 75 · Test 58"],
    ["M1 · First live experiments", "19%", "Due Fri, Sep 25 · 3 days overdue"],
  ]);
  assert.equal(kpis[4].tone, "danger");
  assert.equal(buildKpis([], { visitors7d: null, milestone: null, today: "2026-09-28" })[2].value, "—");
});

test("parseFilters ignores unknown values", () => {
  assert.deepEqual(parseFilters({ view: "bogus", surface: "x" }), { view: "all", surface: null });
  assert.deepEqual(parseFilters({ view: "decision", surface: "tool_page" }), { view: "decision", surface: "tool_page" });
});

test("filterItems combines view and surface", () => {
  const items = [{ ...base, id: "a", status: "live" as const, surface: "landing_page" as const, verdict: "losing" as const }, { ...base, id: "b", status: "live" as const, surface: "tool_page" as const }, { ...base, id: "c", status: "draft" as const, surface: "tool_page" as const }];
  assert.deepEqual(filterItems(items, { view: "live", surface: "tool_page" }).map((i) => i.id), ["b"]);
  assert.deepEqual(filterItems(items, { view: "decision", surface: null }).map((i) => i.id), ["a"]);
});

test("buildNav counts views and surfaces", () => {
  const nav = buildNav([{ ...base, status: "live", verdict: "losing" }, { ...base, status: "queued" }, { ...base, status: "draft", surface: "tool_page" }], { ok: true, at: "2026-10-05T12:00:00Z" });
  assert.deepEqual(nav.counts, { all: 3, live: 1, decision: 1, queued: 1, draft: 1, concluded: 0 });
  assert.deepEqual(nav.surfaces, { landing_page: 2, signup_flow: 0, tool_page: 1 });
  assert.equal(nav.live.length, 1);
  assert.equal(nav.live[0].losing, true);
});

test("buildCalendar spans six weeks and places bars", () => {
  const cal = buildCalendar([{ ...base, id: "l", status: "live", startDate: "2026-09-25", endDate: "2026-10-23", lift: -3, verdict: "no-signal" }, { ...base, id: "d", status: "draft" }], "2026-10-05");
  assert.equal(cal.start, "2026-09-21");
  assert.equal(cal.weeks.length, 6);
  assert.deepEqual([cal.rows[0].start, cal.rows[0].end, cal.rows[0].tone, cal.rows[0].barLabel], ["2026-09-25", "2026-10-23", "live", "−3.0% · not yet significant"]);
  assert.deepEqual([cal.rows[1].start, cal.rows[1].tone], [null, "draft"]);
});

test("toCsv quotes fields and has one row per experiment", () => {
  const csv = toCsv([{ ...base, name: 'Has "quotes", commas', status: "live", lift: -3 }]);
  const lines = csv.trim().split("\n");
  assert.equal(lines[0], "Experiment,Path,Status,Primary metric,Control rate,Test rate,Lift,Significance,Control n,Test n,Progress,Owner");
  assert.equal(lines.length, 2);
  assert.match(lines[1], /^"Has ""quotes"", commas",/);
});

test("armUrls falls back to the joinhomebase path", () => {
  assert.deepEqual(armUrls(scheduling, "/free-employee-scheduling-app-lp"), {
    control: "https://www.joinhomebase.com/free-employee-scheduling-app-lp",
    test: "https://www.joinhomebase.com/free-employee-scheduling-app-lp",
  });
  assert.deepEqual(
    armUrls(exp({ groups: [
      { name: "control", id: "c1", size: 50, isControl: true, parameterValues: { destination_url: "https://www.joinhomebase.com/free-time-clock-app-lp?arm=c" } },
      { name: "test", id: "t1", size: 50, parameterValues: { destination_url: "https://www.joinhomebase.com/free-time-clock-app-lp?arm=t" } },
    ] }), null),
    {
      control: "https://www.joinhomebase.com/free-time-clock-app-lp?arm=c",
      test: "https://www.joinhomebase.com/free-time-clock-app-lp?arm=t",
    },
  );
});
