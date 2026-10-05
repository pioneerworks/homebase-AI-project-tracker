import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  getExperimentDetail,
  getExperimentsPage,
  resetExperimentsCacheForTests,
} from "../src/lib/experiments";
import { handleDetail } from "../src/lib/experiments-route";
import type { ExperimentDetail } from "../src/lib/experiments-types";
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

test("a failed cumulative call is retried after 5 minutes, not served for an hour", async () => {
  installFetch();
  let cumulativeOk = false;
  router = (url) => {
    const path = url.pathname;
    if (path === "/console/v1/experiments") return data(listDtos());
    if (path === `/console/v1/experiments/${SCHEDULING_ID}/pulse_results`) {
      return data(schedulingPulse);
    }
    if (path === `/console/v1/experiments/${SCHEDULING_ID}/cumulative_exposures`) {
      return cumulativeOk
        ? data(pageCumulative())
        : new Response("cumulative failed", { status: 500 });
    }
    // Linear relay with no LINEAR_API_KEY: unavailable, so the milestone is "—".
    if (path.startsWith("/api/projects/")) {
      return new Response("linear unavailable", { status: 503 });
    }
    return new Response(`no route for ${path}`, { status: 404 });
  };
  const listCalls = () => requests.filter((r) => r.url.endsWith("experiments?limit=100")).length;

  // list + pulse succeed, cumulative fails → visitors7d "—" and the page is partial
  const partial = await getExperimentsPage(ENV, NOW);
  assert.ok(partial);
  assert.equal(partial.kpis[2].value, "—");
  assert.equal(listCalls(), 1);

  // within the 5-minute window the cached partial page is served as-is
  const withinWindow = await getExperimentsPage(ENV, NOW + 60 * 1000);
  assert.ok(withinWindow);
  assert.equal(withinWindow.kpis[2].value, "—");
  assert.equal(listCalls(), 1);

  // past the window the page is retried; cumulative still fails
  const retried = await getExperimentsPage(ENV, NOW + 6 * 60 * 1000);
  assert.ok(retried);
  assert.equal(retried.kpis[2].value, "—");
  assert.equal(listCalls(), 2);

  // once cumulative recovers, the next retry picks it up
  cumulativeOk = true;
  const recovered = await getExperimentsPage(ENV, NOW + 12 * 60 * 1000);
  assert.ok(recovered);
  assert.equal(recovered.kpis[2].value, "10,809");
  assert.equal(listCalls(), 3);
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

test("getExperimentDetail keeps srm null when one arm's cumulative series is empty", async () => {
  installFetch();
  standardRouter({ cumulative: [detailCumulative()[0]] }); // test arm missing entirely
  const detail = await getExperimentDetail(SCHEDULING_ID, ENV, NOW);
  assert.ok(detail);
  // no usable pair: exposures and SRM stay null instead of judging [0, N]
  assert.equal(detail.exposures, null);
  assert.equal(detail.srm, null);
  // the daily series still renders; the missing arm reads as 0 exposures
  assert.ok(detail.daily);
  assert.deepEqual(
    detail.daily.map((d) => d.exposures),
    [
      { control: 566, test: 0 },
      { control: 509, test: 0 },
      { control: 432, test: 0 },
    ],
  );
  assert.deepEqual(
    detail.daily.map((d) => d.signups.test),
    [5, 5, 10],
  );
});

test("getExperimentDetail keeps srm null when an arm's last exposure is 0", async () => {
  installFetch();
  const [control, test] = detailCumulative();
  standardRouter({
    cumulative: [control, { ...test, results: [{ date: "2026-09-27", exposures: 0 }] }],
  });
  const detail = await getExperimentDetail(SCHEDULING_ID, ENV, NOW);
  assert.ok(detail);
  assert.equal(detail.exposures, null);
  assert.equal(detail.srm, null);
  assert.ok(detail.daily);
  assert.deepEqual(
    detail.daily.map((d) => d.exposures.test),
    [0, 0, 0],
  );
});

test("getExperimentDetail returns null for unknown or draft ids", async () => {
  installFetch();
  standardRouter();
  assert.equal(await getExperimentDetail("exp_unknown", ENV, NOW), null);
  assert.equal(await getExperimentDetail("exp_goose_h1", ENV, NOW), null);
});

// ---------------------------------------------------------------------------
// Detail API route handler (src/lib/experiments-route.ts)
// ---------------------------------------------------------------------------

const DETAIL: ExperimentDetail = {
  id: SCHEDULING_ID,
  exposures: { control: 1507, test: 1549 },
  srm: { ok: true, pValue: 0.8 },
  daily: [],
};

/** getDetail stub that records the ids it was called with. */
function getDetailStub(result: ExperimentDetail | null | Error) {
  const calls: string[] = [];
  return {
    calls,
    getDetail: async (id: string): Promise<ExperimentDetail | null> => {
      calls.push(id);
      if (result instanceof Error) throw result;
      return result;
    },
  };
}

test("detail route returns 401 without a user", async () => {
  const stub = getDetailStub(DETAIL);
  const response = await handleDetail(SCHEDULING_ID, { user: null, getDetail: stub.getDetail });
  assert.equal(response.status, 401);
  assert.deepEqual(await response.json(), { error: "Unauthorized" });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(stub.calls, []);
});

test("detail route rejects unknown ids", async () => {
  const user = { email: "brian@joinhomebase.com" };

  // path-traversal-shaped id: rejected before any lookup
  const traversal = getDetailStub(DETAIL);
  const bad = await handleDetail("../etc", { user, getDetail: traversal.getDetail });
  assert.equal(bad.status, 404);
  assert.deepEqual(await bad.json(), { error: "Unknown experiment" });
  assert.equal(bad.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(traversal.calls, []);

  // well-formed id the loader doesn't know: still a 404
  const unknown = getDetailStub(null);
  const missing = await handleDetail("exp_unknown", { user, getDetail: unknown.getDetail });
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { error: "Unknown experiment" });
  assert.equal(missing.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(unknown.calls, ["exp_unknown"]);
});

test("detail route returns 502 when the loader throws", async () => {
  const stub = getDetailStub(new Error("console down"));
  const response = await handleDetail(SCHEDULING_ID, {
    user: { email: "brian@joinhomebase.com" },
    getDetail: stub.getDetail,
  });
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "Statsig unavailable" });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(stub.calls, [SCHEDULING_ID]);
});

test("detail route returns the detail JSON for a valid id", async () => {
  const stub = getDetailStub(DETAIL);
  const response = await handleDetail(SCHEDULING_ID, {
    user: { email: "brian@joinhomebase.com" },
    getDetail: stub.getDetail,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), DETAIL);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(stub.calls, [SCHEDULING_ID]);
});
