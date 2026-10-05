import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  getExperimentDetail,
  getExperimentsPage,
  resetExperimentsCacheForTests,
} from "../src/lib/experiments";
import type {
  CumulativeExposuresDto,
  ExperimentPulseResultsDto,
  ExternalExperimentDto,
} from "../src/lib/statsig-types";

// Env is always explicit here — the test never reads .env.local, and the
// Linear milestone lookup sees LINEAR_API_KEY unset (restored in afterEach).
const ENV = { STATSIG_CONSOLE_API_KEY: "console-test" };
const NOW = Date.UTC(2026, 9, 5, 12); // Mon 2026-10-05 12:00 UTC

const originalFetch = globalThis.fetch;
const originalLinearKey = process.env.LINEAR_API_KEY;

afterEach(() => {
  globalThis.fetch = originalFetch;
  if (originalLinearKey === undefined) delete process.env.LINEAR_API_KEY;
  else process.env.LINEAR_API_KEY = originalLinearKey;
  resetExperimentsCacheForTests();
});

// ---------------------------------------------------------------------------
// fetch router: records every Statsig request, routes by URL path. The Linear
// relay (no LINEAR_API_KEY) is stubbed to fail without being recorded, so the
// milestone KPI degrades to "—" and only Statsig traffic shows up in requests.
// ---------------------------------------------------------------------------

let requests: { method: string; url: string }[] = [];
let router: (url: URL) => Response = () => new Response("no route", { status: 404 });

function installFetch() {
  requests = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.origin === "https://statsigapi.net") {
      requests.push({ method: init?.method ?? "GET", url: url.toString() });
    }
    return router(url);
  };
}

function data(payload: unknown, status = 200): Response {
  return Response.json({ data: payload }, { status });
}

// --- fixtures --------------------------------------------------------------

const SCHEDULING_ID = "exp_free_employee_scheduling_app_lp_module";

function schedulingDto(): ExternalExperimentDto {
  return {
    id: SCHEDULING_ID,
    name: SCHEDULING_ID,
    status: "active",
    startTime: Date.UTC(2026, 8, 25),
    duration: 28,
    description:
      'A/B test on /free-employee-scheduling-app-lp: "module" varies between the groups.',
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
  };
}

/** The Task 1 pulse values for the scheduling experiment. */
const schedulingPulse: ExperimentPulseResultsDto = {
  ds: "2026-10-05",
  primaryMetrics: [
    {
      metricID: "Owner Signups::user_warehouse",
      metricName: "Owner Signups",
      directionality: "increase",
      controlMean: 0.02086981903093987,
      testMean: 0.02024811065164694,
      controlUnits: 6852,
      testUnits: 7013,
      percentChange: -2.9789830873532517,
      pValue: 0.7964795069605728,
      adjustedAlpha: 0.05,
    },
  ],
  secondaryMetrics: [
    {
      metricID: "1D1::user_warehouse",
      metricName: "1D1",
      directionality: "increase",
      controlMean: 0.11188811188811189,
      testMean: 0.1347517730496454,
      controlUnits: 143,
      testUnits: 141,
      percentChange: 20.43439716312057,
      pValue: 0.5578,
    },
  ],
};

function gooseDto(): ExternalExperimentDto {
  return {
    id: "exp_goose_h1",
    name: "exp_goose_h1",
    status: "setup",
    groups: [
      { name: "control", id: "gc", size: 50, isControl: true, parameterValues: {} },
      { name: "test", id: "gt", size: 50, parameterValues: {} },
    ],
  };
}

const archivedDto: ExternalExperimentDto = {
  id: "archived_one",
  name: "archived_one",
  status: "archived",
  groups: [],
};

function listDtos(): ExternalExperimentDto[] {
  return [schedulingDto(), gooseDto(), archivedDto];
}

function pageCumulative(): CumulativeExposuresDto[] {
  return [
    {
      groupID: "c1",
      groupName: "control",
      results: [
        { date: "2026-09-27", exposures: 1507 },
        { date: "2026-10-04", exposures: 6852 },
      ],
    },
    {
      groupID: "t1",
      groupName: "test",
      results: [
        { date: "2026-09-27", exposures: 1549 },
        { date: "2026-10-04", exposures: 7013 },
      ],
    },
  ];
}

function detailCumulative(): CumulativeExposuresDto[] {
  return [
    {
      groupID: "c1",
      groupName: "control",
      results: [
        { date: "2026-09-25", exposures: 566 },
        { date: "2026-09-26", exposures: 1075 },
        { date: "2026-09-27", exposures: 1507 },
      ],
    },
    {
      groupID: "t1",
      groupName: "test",
      results: [
        { date: "2026-09-25", exposures: 587 },
        { date: "2026-09-26", exposures: 1087 },
        { date: "2026-09-27", exposures: 1549 },
      ],
    },
  ];
}

/** Cumulative signups per date, built as mean = n/units with that day's units. */
const detailDays: Record<string, { control: number; test: number; controlUnits: number; testUnits: number }> = {
  "2026-09-25": { control: 10, test: 5, controlUnits: 566, testUnits: 587 },
  "2026-09-26": { control: 26, test: 10, controlUnits: 1075, testUnits: 1087 },
  "2026-09-27": { control: 42, test: 20, controlUnits: 1507, testUnits: 1549 },
};

function datedPulse(date: string): ExperimentPulseResultsDto {
  const day = detailDays[date];
  if (!day) throw new Error(`no fixture for ${date}`);
  return {
    ds: date,
    primaryMetrics: [
      {
        metricID: "Owner Signups::user_warehouse",
        metricName: "Owner Signups",
        directionality: "increase",
        controlMean: day.control / day.controlUnits,
        testMean: day.test / day.testUnits,
        controlUnits: day.controlUnits,
        testUnits: day.testUnits,
      },
    ],
  };
}

function standardRouter(opts: { listStatus?: number; cumulative?: CumulativeExposuresDto[] } = {}) {
  router = (url) => {
    const path = url.pathname;
    if (path === "/console/v1/experiments") {
      return data(listDtos(), opts.listStatus ?? 200);
    }
    const pulse = path.match(/^\/console\/v1\/experiments\/([^/]+)\/pulse_results$/);
    if (pulse) {
      if (pulse[1] !== SCHEDULING_ID) return new Response("unknown experiment", { status: 404 });
      const date = url.searchParams.get("date");
      return date ? data(datedPulse(date)) : data(schedulingPulse);
    }
    if (path === `/console/v1/experiments/${SCHEDULING_ID}/cumulative_exposures`) {
      return data(opts.cumulative ?? pageCumulative());
    }
    // Linear relay with no LINEAR_API_KEY: unavailable, so the milestone is "—".
    if (path.startsWith("/api/projects/")) {
      return new Response("linear unavailable", { status: 503 });
    }
    return new Response(`no route for ${path}`, { status: 404 });
  };
}

// --- tests -----------------------------------------------------------------

test("getExperimentsPage returns null without a key", async () => {
  installFetch();
  router = () => {
    throw new Error("no fetch expected without a key");
  };
  assert.equal(await getExperimentsPage({}, NOW), null);
  assert.equal(requests.length, 0);
});

test("getExperimentsPage builds the model", async () => {
  installFetch();
  standardRouter();
  const page = await getExperimentsPage(ENV, NOW);
  assert.ok(page);

  // archived dropped, live before draft
  assert.deepEqual(
    page.experiments.map((i) => i.id),
    [SCHEDULING_ID, "exp_goose_h1"],
  );
  assert.equal(page.experiments[0].status, "live");
  assert.equal(page.experiments[0].controlN, 6852);
  assert.equal(page.experiments[0].verdict, "no-signal");
  assert.equal(page.experiments[1].status, "draft");

  // visitors in test · 7d: (6852−1507) + (7013−1549) = 5345 + 5464
  assert.equal(page.kpis[2].value, "10,809");
  // Linear unavailable → milestone shows "—"
  assert.equal(page.kpis[4].value, "—");
  // nothing is losing → no decision banner
  assert.equal(page.decision, null);

  assert.deepEqual(page.sync, { ok: true, at: "2026-10-05T12:00:00.000Z" });
  assert.equal(page.today, "2026-10-05");
  assert.deepEqual(page.week, { start: "2026-10-05", end: "2026-10-11" });
});

test("only GET requests reach Statsig", async () => {
  installFetch();
  standardRouter();
  await getExperimentsPage(ENV, NOW);
  assert.ok(requests.length > 0);
  for (const request of requests) {
    assert.match(request.url, /^https:\/\/statsigapi\.net\/console\/v1\//);
    assert.ok(request.method === "GET" || request.method === undefined, request.method);
  }
});

test("getExperimentsPage throws when the list fails cold, serves cache when warm", async () => {
  installFetch();
  standardRouter({ listStatus: 500 });
  await assert.rejects(getExperimentsPage(ENV, NOW), /500/);

  // past the 2-minute failure TTL, a good list populates the cache
  standardRouter();
  const warm = await getExperimentsPage(ENV, NOW + 3 * 60 * 1000);
  assert.ok(warm);

  // 61 minutes later the entry is stale; a failing list still serves it
  standardRouter({ listStatus: 500 });
  const cached = await getExperimentsPage(ENV, NOW + 64 * 60 * 1000);
  assert.deepEqual(cached, warm);
});

test("getExperimentDetail builds daily series and SRM", async () => {
  installFetch();
  standardRouter({ cumulative: detailCumulative() });
  const detail = await getExperimentDetail(SCHEDULING_ID, ENV, NOW);
  assert.ok(detail);
  assert.deepEqual(detail.exposures, { control: 1507, test: 1549 });
  assert.equal(detail.srm?.ok, true);
  assert.ok(detail.daily);
  assert.deepEqual(
    detail.daily.map((d) => d.date),
    ["2026-09-25", "2026-09-26", "2026-09-27"],
  );
  assert.deepEqual(
    detail.daily.map((d) => d.exposures.control),
    [566, 509, 432],
  );
  assert.deepEqual(
    detail.daily.map((d) => d.signups.control),
    [10, 16, 16],
  );
  assert.deepEqual(
    detail.daily.map((d) => d.signups.test),
    [5, 5, 10],
  );
});

test("getExperimentDetail returns daily null when a dated pulse fails", async () => {
  installFetch();
  standardRouter({ cumulative: detailCumulative() });
  const base = router;
  router = (url) => {
    if (url.pathname.endsWith("/pulse_results") && url.searchParams.get("date") === "2026-09-26") {
      return new Response("pulse failed", { status: 500 });
    }
    return base(url);
  };
  const detail = await getExperimentDetail(SCHEDULING_ID, ENV, NOW);
  assert.ok(detail);
  assert.equal(detail.daily, null);
  assert.deepEqual(detail.exposures, { control: 1507, test: 1549 });
  assert.equal(detail.srm?.ok, true);
});

test("getExperimentDetail returns null for unknown or draft ids", async () => {
  installFetch();
  standardRouter();
  assert.equal(await getExperimentDetail("exp_unknown", ENV, NOW), null);
  assert.equal(await getExperimentDetail("exp_goose_h1", ENV, NOW), null);
});
