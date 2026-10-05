# AI Hub · Experiments tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an "A/B testing" item under Overview that opens `/experiments`. That route swaps in the Experiments sidebar and shows every Statsig experiment: a table with expandable detail rows, KPIs, a decision banner and a test calendar, all from live Statsig Console API data.

**Architecture:**
- **Pure derivation:** `src/lib/experiments-derive.ts`, client-safe and unit-tested. It turns Statsig DTOs into a typed page model.
- **Fetching and caching:** `src/lib/experiments.ts`, server-only. It fetches with `ttlCache` and builds the list model and per-experiment detail.
- **Server shell:** a server page streams the list into one client component tree under `src/components/experiments/`.
- **Detail API:** `GET /api/experiments/[id]` loads a row's detail the first time it is expanded.
- **Sidebar:** `AppShell` picks the Experiments sidebar by pathname.

**Tech Stack:**
- Next.js 16.2 App Router and React 19.2
- TypeScript
- Plain CSS in `src/app/globals.css` (no Tailwind)
- `lucide-react`, `recharts`
- `node:test` via `tsx` (`npm test`), `tsc` (`npm run check`)

**Spec:** `docs/superpowers/specs/2026-10-05-experiments-tab-design.md`. Read it, plus `~/ai-accel/handoffs/ai-hub-experiments-2026-10-04/HANDOFF.md` §3, §4, §7 and §8 for the visual detail. The pixel reference is `~/ai-accel/handoffs/ai-hub-experiments-2026-10-04/_export/XrNZp.png`, and exact px values are in `experiments.html` in the same folder. Where the spec and the handoff disagree, **the spec wins**: no device split, no screenshots, and Statsig-derived defaults.

## Global Constraints

- **Branch:** work on branch `ab-testing-hub-tab` (already checked out). Never push to `main`. Open a PR with `gh pr create --base main`. Squash-merge only, and only if Brian authorizes it.
- **Before opening the PR:** `git fetch origin && git rebase origin/main`, then `npm run check` and `npm test` must both pass.
- **No new dependencies.**
- **Statsig is read-only:** only HTTP `GET` to `https://statsigapi.net/console/v1`. No `POST`/`PATCH`/`DELETE` to Statsig anywhere.
- **API key stays server-side:** `STATSIG_CONSOLE_API_KEY` is read only through `statsigConfig()` in `import "server-only"` modules. Nothing under `src/components/` imports `src/lib/experiments.ts` or `src/lib/statsig.ts`. Client code may import `src/lib/experiments-derive.ts` and `src/lib/experiments-types.ts`, which must not import `server-only` modules.
- **Styling:**
  - Plain CSS appended to `src/app/globals.css`, with class prefix `exp-`.
  - New tokens go in `:root`: `--purple-chip: #f7ebff; --status-teal: #16b8a6; --exp-control: #9a82e6; --exp-test: #b3262b;`. Reuse the existing tokens for everything else.
  - No box shadows on cards.
  - `font-variant-numeric: tabular-nums` on every number.
- **Numbers and copy:**
  - Lift: one decimal with a real minus sign (U+2212 `−`).
  - Rates: two decimals.
  - Thousands separators: `toLocaleString("en-US")`.
- **No "New experiment" button. No "Live now" section in Main.**
- **The detail panel has exactly four blocks, in this order:** 01 Hypothesis, 02 Traffic split, 03 What the pages look like, 04 Daily exposures & signups.
- **Accessibility:** WCAG 2.2 AA (PRODUCT.md). Expand toggles are `<button aria-expanded aria-controls>`. Filter tabs use `aria-current`. Status is never shown by colour alone.
- **Tests:** `test/*.test.ts` style, `node:test` plus `node:assert/strict`, importing from `../src/lib/...`. Mock fetch by reassigning `globalThis.fetch` and restoring it in `afterEach`, as `test/linear-refresh.test.ts` does.
- **Comments:** keep the existing density, which is sparse. Add module doc comments like those at the top of `statsig.ts`.

## Review Focus

1. **Experiment with no pulse row, or a pulse `error` (e.g. `no_data` on day 1).** The row renders "—" for rates, lift and significance instead of `NaN%` or a crash. Pinned in Task 1 (`toListItem handles missing pulse`).
2. **Cumulative counts that dip from one day to the next.** Statsig can re-load a day lower. Daily deltas clamp at 0 and are never negative bars. Pinned in Task 1 (`dailyFromCumulative clamps negative deltas`).
3. **Multi-arm or zero-size control (e.g. `redirect_test`, whose control has `size: 0`).** The target split uses the picked arms' sizes. A zero total returns SRM `null` instead of dividing by zero. Pinned in Task 1 (`srm returns null when target split is degenerate`).
4. **Unknown or invalid query params (`?view=bogus&surface=x`).** They fall back to `all`/no surface without throwing. Pinned in Task 1 (`parseFilters ignores unknown values`).
5. **Detail route called for an id that isn't in the list, or with path-traversal characters.** It returns 404 without calling Statsig, and the id must match `/^[A-Za-z0-9_\-]+$/`. Pinned in Task 3 (`detail route rejects unknown ids`).

---

## File map

| File | Responsibility |
| --- | --- |
| `src/lib/experiments-types.ts` (create) | Page-model types shared by the server and the client. No runtime imports. |
| `src/lib/experiments-derive.ts` (create) | Pure functions: status mapping, field extraction, list item, KPIs, decision, SRM, daily deltas, calendar, filters, nav counts, CSV, formatting. |
| `src/lib/statsig-types.ts` (modify) | Add the DTO fields used: `owner`, `creatorName`, `lastModifierName`, `createdTime`, `scheduledStartTime`, `sidecarEditorURL`, `groups[].parameterValues`, `CumulativeExposuresDto`. |
| `src/lib/statsig.ts` (modify) | Export `consoleGet` (unchanged behaviour). |
| `src/lib/experiments.ts` (create, server-only) | `getExperimentsPage()` and `getExperimentDetail(id)`, cached. |
| `src/app/api/experiments/[id]/route.ts` (create) | Authenticated JSON for a row's detail. |
| `src/app/(authed)/experiments/page.tsx` (create) | Server page: auth, load the page model, render `<ExperimentsView>`. |
| `src/app/(authed)/experiments/loading.tsx` (create) | Skeleton at final size. |
| `src/app/(authed)/layout.tsx` (modify) | Pass the `experimentsNav` promise to `AppShell`. |
| `src/components/app-shell.tsx` (modify) | "A/B testing" nav item, plus the sidebar switch on `/experiments`. |
| `src/components/experiments/experiments-sidebar.tsx` (create) | The Experiments sidebar. |
| `src/components/experiments/experiments-view.tsx` (create) | Header, table section, KPIs, banner, calendar. Owns the URL filter state. |
| `src/components/experiments/experiment-table.tsx` (create) | Table rows plus expand logic. |
| `src/components/experiments/experiment-detail.tsx` (create) | The four-block detail panel and the slim panel. |
| `src/components/experiments/daily-charts.tsx` (create) | Two recharts bar charts plus the rate table. |
| `src/components/experiments/test-calendar.tsx` (create) | The Gantt calendar. |
| `src/components/experiments/stop-dialog.tsx` (create) | Confirm dialog that links out to Statsig. |
| `test/experiments.test.ts` (create) | Derivation unit tests. |
| `test/experiments-data.test.ts` (create) | Fetch/cache and route tests with a mocked `fetch`. |

---

### Task 1: Types and pure derivations

**Files:**
- Create: `src/lib/experiments-types.ts`, `src/lib/experiments-derive.ts`, `test/experiments.test.ts`
- Modify: `src/lib/statsig-types.ts`

**Interfaces:**
- Consumes: `ExternalExperimentDto` and `ExperimentPulseResultsDto` from `src/lib/statsig-types.ts`; `verdictFromPrimary`, `pickArms`, `experimentTitle`, `experimentDay`, `ExperimentVerdict` from `src/lib/statsig.ts`.
  - `statsig.ts` imports `server-only`, but `tsx --conditions=react-server` resolves it, so tests are fine.
  - **However**, `experiments-derive.ts` must stay client-safe. So **move** `verdictFromPrimary`, `pickArms`, `experimentTitle`, `experimentDay` and `ExperimentVerdict` into a new `src/lib/statsig-pure.ts`, with no `server-only` import, and re-export them from `statsig.ts` so existing imports and tests keep working.
- Produces, in `experiments-types.ts`:

```ts
export type HubStatus = "live" | "queued" | "draft" | "concluded";
export type Surface = "landing_page" | "signup_flow" | "tool_page";
export type View = "all" | "live" | "decision" | "queued" | "draft" | "concluded";
export type Verdict = "winning" | "losing" | "no-signal" | "no-data";
export type MetricResult = { label: string; control: number; test: number; controlRate: number; testRate: number; lift: number | null };
export type ExperimentListItem = {
  id: string; name: string; path: string | null; surface: Surface; status: HubStatus;
  primaryMetric: string | null; owner: string | null; statsigUrl: string | null;
  hypothesis: string | null; guardrails: string; plannedRun: string;
  controlRate: number | null; testRate: number | null; lift: number | null;   // % values, e.g. 2.09
  pValue: number | null; verdict: Verdict;
  controlN: number | null; testN: number | null;
  day: number | null; totalDays: number | null; startDate: string | null; endDate: string | null;
  targetSplit: [number, number];
  armUrls: { control: string | null; test: string | null };
  armNames: { control: string; test: string };
  results: MetricResult[];            // [Sign ups, 1D1s] when present
  progressLabel: string;              // "Day 10 of 28" | "Starts Oct 20" | "Unscheduled" | "Ended Oct 1"
};
export type Kpi = { id: string; label: string; value: string; context: string; tone?: "danger" };
export type Decision = { experimentId: string; title: string; body: string; statsigUrl: string | null; slackUrl: string };
export type CalendarRow = { id: string; label: string; sub: string; start: string | null; end: string | null; barLabel: string; tone: "live" | "losing" | "queued" | "draft" | "concluded" };
export type ExperimentsNav = { counts: Record<View, number>; surfaces: Record<Surface, number>; live: { id: string; name: string; lift: number | null; losing: boolean; day: number | null; totalDays: number | null }[]; sync: { ok: boolean; at: string | null } };
export type ExperimentsPage = { today: string; week: { start: string; end: string }; sync: { ok: boolean; at: string | null }; experiments: ExperimentListItem[]; kpis: Kpi[]; decision: Decision | null; calendar: { start: string; weeks: string[]; rows: CalendarRow[] } };
export type DailyPoint = { date: string; exposures: { control: number; test: number }; signups: { control: number; test: number } };
export type ExperimentDetail = { id: string; exposures: { control: number; test: number } | null; srm: { ok: boolean; pValue: number } | null; daily: DailyPoint[] | null };
```

- Produces, in `experiments-derive.ts`. These are the exact names the later tasks use:
  - `hubStatus(e: ExternalExperimentDto): HubStatus | null`
  - `experimentPath(e): string | null`
  - `surfaceOf(path: string | null): Surface`
  - `ownerOf(e): string | null`
  - `armUrls(e, path): { control: string | null; test: string | null }`
  - `toListItem(e, pulse: ExperimentPulseResultsDto | undefined, now: number): ExperimentListItem`
  - `sortExperiments(items): ExperimentListItem[]`
  - `buildKpis(items, opts: { visitors7d: { control: number; test: number } | null; milestone: { progress: number; targetDate: string | null } | null; today: string }): Kpi[]`
  - `pickDecision(items): Decision | null`
  - `srm(counts: [number, number], target: [number, number]): { ok: boolean; pValue: number } | null`
  - `dailyFromCumulative(series: { date: string; value: number }[]): { date: string; value: number }[]`
  - `buildCalendar(items, today: string): ExperimentsPage["calendar"]`
  - `parseFilters(params: { view?: string | null; surface?: string | null }): { view: View; surface: Surface | null }`
  - `filterItems(items, f): ExperimentListItem[]`
  - `buildNav(items, sync): ExperimentsNav`
  - `toCsv(items): string`
  - `formatLift(n: number | null): string`
  - `formatRate(n: number | null): string`
  - `significanceLabel(item): { text: string; tone: "danger" | "success" | "muted" | null }`
  - `SURFACE_LABELS: Record<Surface, string>`
  - `SLACK_CHANNEL_URL = "https://homebase.slack.com/app_redirect?channel=ab-testing"`
  - `STATSIG_EXPERIMENTS_URL = "https://console.statsig.com/experiments"`

Build fixtures at the top of `test/experiments.test.ts` with `exp(overrides: Partial<ExternalExperimentDto>): ExternalExperimentDto` and `pulse(primary, secondary?)` helpers. Use these real values from the 2026-10-05 probe:
- `exp_free_employee_scheduling_app_lp_module`, active, `startTime = Date.UTC(2026,8,25)`, `duration` 28, tags `["Marketing"]`.
  - `description`: `'A/B test on /free-employee-scheduling-app-lp: "module" varies between the groups.'`
  - `owner.ownerName`: `"CONSOLE API - console-3nfq"`; `lastModifierName`: `"Meg Jump"`.
  - groups: `control` (id `c1`, size 50, `isControl`) and `test` (id `t1`, size 50).
  - `secondaryMetrics`: `[{name:"1D1"},{name:"Week1-2D7"}]`.
- Its pulse:
  - primary: `Owner Signups`, `controlMean: 0.02086981903093987`, `testMean: 0.02024811065164694`, `controlUnits: 6852`, `testUnits: 7013`, `percentChange: -2.9789830873532517`, `pValue: 0.7964795069605728`, `adjustedAlpha: 0.05`.
  - secondary: `1D1`, `controlMean: 0.11188811188811189`, `testMean: 0.1347517730496454`, `controlUnits: 143`, `testUnits: 141`, `percentChange: 20.43439716312057`, `pValue: 0.5578`.

- [ ] **Step 1: Write the failing tests** in `test/experiments.test.ts`:

```ts
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
```

`base` is a complete `ExperimentListItem` literal at the top of the test file. All its numbers are `null`; it has `status: "live"`, `surface: "landing_page"`, `verdict: "no-data"`, `results: []`, `targetSplit: [50, 50]`, and the remaining fields set to empty or `null`.

- [ ] **Step 2: Run the tests to make sure they fail**
  - Run: `npm test -- test/experiments.test.ts` (or `npx tsx --conditions=react-server --test test/experiments.test.ts`).
  - Expected: FAIL, cannot find module `../src/lib/experiments-derive`.

- [ ] **Step 3: Implement.** Create `src/lib/statsig-pure.ts` (move the pure helpers out of `statsig.ts` and re-export them from it). Extend `statsig-types.ts` with:
  - `owner?: { ownerName?: string } | null`
  - `creatorName?: string | null`
  - `lastModifierName?: string | null`
  - `createdTime?: number`
  - `scheduledStartTime?: number | null`
  - `sidecarEditorURL?: string`
  - `groups[].parameterValues?: Record<string, unknown>`
  - `export interface CumulativeExposuresDto { groupID: string; groupName: string; results: { date: string; exposures: number }[] }`

  Then write `experiments-types.ts` and `experiments-derive.ts` to the spec's "Field derivations" section. A few decisions the tests don't pin down:
  - **Results labels:** the primary row is labelled "Sign ups". The secondary row with `metricName === "1D1"` is labelled "1D1s". Counts are `Math.round(mean * units)`; rates are `mean * 100`.
  - **SRM:** the `p` value comes from the complementary error function, using the Abramowitz–Stegun 7.1.26 approximation:

    ```ts
    function erfc(x: number) { const t = 1 / (1 + 0.3275911 * x); return t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429)))) * Math.exp(-x * x); }
    // chi2 = Σ (obs-exp)²/exp with exp = n * share; p = erfc(sqrt(chi2 / 2)); ok = p >= 0.01
    ```

  - **Daily cost in the decision banner:** `(controlRate - testRate) / 100 * testN / day`, rounded. With the test inputs, `(2.5 − 1.16)/100 × 1720/4 = 5.76`, which rounds to 6.
  - **KPI context:** "landing pages" stays plural even when the count is 1. That matches the mock and keeps it simple.
  - **Dates:** format with `toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })`.
  - **Calendar start:** the Monday on or before `today − 14d`.
  - **`progressLabel` by status:**
    - live: `Day ${day} of ${totalDays}`
    - queued with a scheduled start: `Starts ${Mon d}`
    - draft, or queued without one: `Unscheduled`
    - concluded: `Ended ${Mon d}` (from `startTime + duration`)

- [ ] **Step 4: Run the tests to make sure they pass**
  - Run: `npx tsx --conditions=react-server --test test/experiments.test.ts test/statsig.test.ts`
  - Expected: PASS, including the old statsig tests (the re-exports keep them working).

- [ ] **Step 5: Commit:** `git add -A src/lib test && git commit -m "Experiments: page model types and pure derivations"`

---

### Task 2: Server data loader

**Files:**
- Create: `src/lib/experiments.ts`, `test/experiments-data.test.ts`
- Modify: `src/lib/statsig.ts` (export `consoleGet`)

**Interfaces:**
- Consumes: everything Task 1 produces; `consoleGet`, `statsigConfig`, `pickArms`, `statsigTimeout` from `statsig.ts`; `ttlCache` from `src/lib/ttl-cache.ts`; `torontoToday`, `shiftDate` from `src/lib/standup.ts`; `getProjectOverview` from `src/lib/linear-projects.ts`; `nextMilestone` from `src/lib/milestones.ts`; `trackerProject("ab-testing")` from `src/lib/tracker-projects.ts`.
- Produces:
  - `getExperimentsPage(env?: Record<string,string|undefined>, now?: number): Promise<ExperimentsPage | null>`
    - Returns `null` when no key is configured.
    - Throws when the list call fails and nothing is cached.
  - `getExperimentDetail(id: string, env?, now?): Promise<ExperimentDetail | null>`
    - Returns `null` for an id that isn't in the current list.
  - `loadExperimentsPage`: a React `cache()` wrapper that returns `ExperimentsPage | null | undefined` and logs on failure (same pattern as `loadExperiments` in `overview-data.ts`).
  - `loadExperimentsNav(): Promise<ExperimentsNav | null>`
    - Built from `loadExperimentsPage` via `buildNav`.
    - On failure: `{ counts: zeros, surfaces: zeros, live: [], sync: { ok: false, at: null } }`.
  - `resetExperimentsCacheForTests(): void`

Behaviour:
1. **List call:** `consoleGet<ExternalExperimentDto[]>(key, "/experiments?limit=100")`. Drop the experiments where `hubStatus` returns null.
2. **Pulses:** for live and concluded items that have `pickArms`, fetch `pulse_results?control=..&test=..`. A failure in one pulse doesn't affect the others.
3. **Visitors in test · 7d:**
   - For each live experiment, call `cumulative_exposures`. For each arm, take `last − value at (last date − 7 days)`, using 0 when that earlier date is missing.
   - Sum across experiments.
   - If any call fails, `visitors7d` is `null`.
4. **Milestone:** `nextMilestone((await getProjectOverview(slug, "ab-testing"))?.milestones)`. Wrap it in a catch that returns null.
5. **Assemble:**
   - `sync = { ok: true, at: new Date(now).toISOString() }`
   - `week`: the Monday–Sunday that contains `today`
   - `kpis = buildKpis(...)`
   - `decision = pickDecision(...)`
   - `calendar = buildCalendar(...)`
6. **Detail:**
   - Find the item. Return null if it's missing or the status is queued or draft (those use list data only).
   - Fetch `cumulative_exposures`. Map the groups to control/test via `pickArms` ids.
   - Daily exposures come from `dailyFromCumulative` per arm.
   - For each date in that series (the last 28 at most), fetch `pulse_results?…&date=${date}` with at most 6 running at once.
     - Signups at that point are `Math.round(controlMean*controlUnits)` / `Math.round(testMean*testUnits)`, then `dailyFromCumulative` again.
     - If any dated pulse fails, `daily = null` but `exposures` and `srm` are still returned.
   - `exposures` = the last cumulative values.
   - `srm = srm([c, t], item.targetSplit)`.
7. **Caches:** use `ttlCache`. The page has one key. Detail is keyed by id. Use `ttlMs: 60*60*1000` and `failureTtlMs: 2*60*1000`. If any pulse failed, store the page with a 5-minute TTL instead. `ttlCache` doesn't support per-entry TTLs, so implement that by holding a `partialUntil` timestamp and skipping the cache while it is in effect. Expose `resetExperimentsCacheForTests` by recreating the caches.

- [ ] **Step 1: Write the failing tests** in `test/experiments-data.test.ts`. Replace `globalThis.fetch` with a router keyed by URL path that returns `{ data }` JSON and records every request's method and URL. Restore `fetch` and call `resetExperimentsCacheForTests()` in `afterEach`. Tests:
  - `getExperimentsPage returns null without a key`: call with `env = {}`. The result is `null` and no fetch happens.
  - `getExperimentsPage builds the model`: the list returns scheduling (active), `exp_goose_h1` (setup) and `archived_one` (archived); the pulse returns the Task 1 values; `cumulative_exposures` returns control `[{2026-09-27,1507},{2026-10-04,6852}]` and test `[{2026-09-27,1549},{2026-10-04,7013}]`. Use `env = { STATSIG_CONSOLE_API_KEY: "console-test" }`, `now = Date.UTC(2026,9,5,12)`, and stub Linear by setting `LINEAR_API_KEY` unset so `getProjectOverview` returns null (check `linear-projects.ts` for its no-key behaviour and stub that path). Assert:
    - `experiments.map(i=>i.id)` is `["exp_free_employee_scheduling_app_lp_module","exp_goose_h1"]`
    - `kpis[2].value === "10,809"` (5345 + 5464)
    - `kpis[4].value === "—"`
    - `decision === null`
  - `only GET requests reach Statsig`: after the build test, every recorded request has method `GET` (or none) and a URL starting with `https://statsigapi.net/console/v1/`.
  - `getExperimentsPage throws when the list fails cold, serves cache when warm`: the first call with a list that returns 500 rejects. After one successful call, advance `now` by 61 minutes and make the list return 500; the call resolves to the cached model.
  - `getExperimentDetail builds daily series and SRM`:
    - cumulative: control `[566,1075,1507]` and test `[587,1087,1549]` on `2026-09-25..27`
    - dated pulses: signups control `[10,26,42]` and test `[5,10,20]` (build each as `mean = n/units` with the matching units)
    - assert `daily.map(d=>d.exposures.control)` is `[566,509,432]`
    - assert `daily.map(d=>d.signups.test)` is `[5,5,10]`
    - assert `exposures` is `{control:1507,test:1549}`
    - assert `srm.ok === true`
  - `getExperimentDetail returns daily null when a dated pulse fails`: one date returns 500. `daily === null` and `srm` is non-null.
  - `getExperimentDetail returns null for unknown or draft ids`.

- [ ] **Step 2: Run the tests to make sure they fail**
  - Run: `npx tsx --conditions=react-server --test test/experiments-data.test.ts`
  - Expected: FAIL, module not found.

- [ ] **Step 3: Implement `src/lib/experiments.ts`** (`import "server-only"` and a module doc comment that lists the endpoints used). Export `consoleGet` from `statsig.ts`.

- [ ] **Step 4: Run all the tests**
  - Run: `npm test`
  - Expected: PASS.

- [ ] **Step 5: Commit:** `git commit -am "Experiments: Statsig loader for list, KPIs and per-row detail"` (stage the new files first).

---

### Task 3: Detail API route

**Files:**
- Create: `src/app/api/experiments/[id]/route.ts`
- Test: add to `test/experiments-data.test.ts`

**Interfaces:**
- Consumes: `getExperimentDetail`; `getSessionUser` from `src/lib/oidc-session.ts`.
- Produces: `GET /api/experiments/{id}`, which the client uses in Task 6. Responses:
  - `200` with an `ExperimentDetail` JSON body
  - `401 { error: "Unauthorized" }`
  - `404 { error: "Unknown experiment" }`
  - `502 { error: "Statsig unavailable" }`
  - Every response sends `Cache-Control: private, no-store`.

- [ ] **Step 1: Write the failing test `detail route rejects unknown ids`.**
  - Extract the route's logic into an exported `handleDetail(id: string, deps: { user: unknown; getDetail: (id: string) => Promise<ExperimentDetail | null> }): Promise<Response>` in the same route file.
  - Assertions:
    - no user → 401
    - `"../etc"` → 404, and `getDetail` is never called
    - an id `getDetail` doesn't know (returns null) → 404
    - `getDetail` throws → 502
    - a valid id → 200 with the JSON body
  - Next route files may export only route handlers and config, so put `handleDetail` in `src/lib/experiments-route.ts`. It's server-only and the route file imports it.

- [ ] **Step 2: Run it and make sure it fails.**

- [ ] **Step 3: Implement it.**
  - Validate the id with `/^[A-Za-z0-9_\-]{1,100}$/`.
  - Set `export const runtime = "nodejs"`.
  - The `GET` handler awaits `params` and calls `handleDetail(id, { user: await getSessionUser(), getDetail: getExperimentDetail })`.
  - Log errors the same way `api/projects/[key]/route.ts` does.

- [ ] **Step 4: Run it and make sure it passes.** `npm test`, PASS.

- [ ] **Step 5: Commit.**

---

### Task 4: Sidebar switch and the "A/B testing" nav item

**Files:**
- Create: `src/components/experiments/experiments-sidebar.tsx`
- Modify: `src/components/app-shell.tsx`, `src/app/(authed)/layout.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: the `ExperimentsNav` type; `loadExperimentsNav()` (Task 2); `parseFilters` and `SURFACE_LABELS` (Task 1).
- Produces:
  - `AppShell` takes a new prop `experimentsNav: Promise<ExperimentsNav | null>`.
  - `ExperimentsSidebar({ nav: Promise<ExperimentsNav | null>, user, onNavigate })`.

- [ ] **Step 1: Hub sidebar**
  - In `app-shell.tsx`, add a second `.sidebar-nav-item` link under Overview: `href="/experiments"`, `<FlaskConical size={18} />`, text "A/B testing", and `aria-current="page"` when `pathname.startsWith("/experiments")`.
  - If `pathname.startsWith("/experiments")`, render `<ExperimentsSidebar>` inside the same `<aside id="app-sidebar">` in place of the hub content. Keep the toggle, backdrop and Escape handling shared.

- [ ] **Step 2: Build `ExperimentsSidebar`.** It follows HANDOFF §3 and `XrNZp.png`, using the existing `.sidebar*` classes plus new `exp-side-*` classes. From top to bottom:
  1. **Brand:** a `--purple-rain` chip with `FlaskConical`, then "Experiments" and the subline "AI Hub · Statsig".
  2. **Back link:** a bordered pill, `ArrowLeft` "Back to AI Hub" → `/`.
  3. **VIEWS:** six links to `/experiments?view=…`, each keeping the current `surface`. Icons: `LayoutGrid` All experiments, `Radio` Live, `Gavel` Needs a decision (with a danger badge when it's above 0), `ListOrdered` Queued, `PencilLine` Drafts, `Archive` Concluded. Each has a count badge, and the active one comes from `useSearchParams()` through `parseFilters`.
  4. **LIVE NOW:** one link per `nav.live` to `/experiments?view=all&open={id}#exp-{id}`, with a dot (danger if losing, otherwise purple-rain), the name, and `"{formatLift} · Day n/N"`.
  5. **BY SURFACE:** three links that toggle `?surface=`, each with a count.
  6. **Spacer, then the sync box** (`--mid-dark-purple` bg):
     - ok: a teal dot, "Statsig synced", "Results refresh hourly", "Last sync N min ago" (from `sync.at`)
     - failed: an amber `--warning` dot and "Statsig sync failed"
  7. **The existing user/profile block.** Reuse the markup by extracting `SidebarUser({ user })` in `app-shell.tsx`.
  - While the promise is pending, show zero badges with skeleton lines. Wrap it in `<Suspense>` and resolve it with `use()`, as `ProjectLabel` does.
- [ ] **Step 3: Layout.** In `(authed)/layout.tsx`, pass `experimentsNav={loadExperimentsNav()}`. It's a promise, so don't await it.
- [ ] **Step 4: CSS.** Add the tokens from Global Constraints and the `exp-side-*` styles. The sizes come from `experiments.html`: sidebar headings 11/800/+1.4px uppercase, and the active item has a `--brand-purple` bg.
- [ ] **Step 5: Verify**
  - `npm run check` passes.
  - `npm run dev`, then open `/` and click "A/B testing". The sidebar swaps (the page itself 404s until Task 5), and "Back to AI Hub" restores the hub sidebar.
- [ ] **Step 6: Commit.**

---

### Task 5: The Experiments page (header, table, KPIs, banner, calendar)

**Files:**
- Create: `src/app/(authed)/experiments/page.tsx`, `src/app/(authed)/experiments/loading.tsx`, `src/components/experiments/experiments-view.tsx`, `src/components/experiments/experiment-table.tsx`, `src/components/experiments/test-calendar.tsx`, `src/components/experiments/stop-dialog.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**
- Consumes: `loadExperimentsPage` (Task 2), and from Task 1: `filterItems`, `parseFilters`, `formatLift`, `formatRate`, `significanceLabel`, `toCsv`, `SLACK_CHANNEL_URL`, `STATSIG_EXPERIMENTS_URL`.
- Produces: `<ExperimentsView page={ExperimentsPage | null | undefined} />`, where `undefined` means the fetch failed and `null` means no key. `ExperimentTable` renders `<ExperimentDetail>` from Task 6 inside each expanded row. Until Task 6 lands, render a placeholder `<div>`.
- `StopDialog({ experiment: { name, statsigUrl, controlArmName }, open, onClose })`.

- [ ] **Step 1: The page**
  - `page.tsx`: set `dynamic = "force-dynamic"` and `maxDuration = 30`.
  - If there's no session user, `redirect("/login?callbackUrl=/experiments")`.
  - `const page = await loadExperimentsPage()`, then render `<ExperimentsView page={page} />`.
  - `loading.tsx` shows a skeleton: a header plus 5 table rows at 44px.

- [ ] **Step 2: `ExperimentsView`** (`"use client"`). Read the filters from `useSearchParams()` through `parseFilters`, and write them with `router.replace` (no scroll). Sections, in order (HANDOFF §3):
  1. **Header**
     - eyebrow `A/B TESTING · WEEK OF {Sep 21–27}` from `page.week`
     - H1 "Experiments"
     - dek "Every test we're running, what it's doing to signups, and which ones need a call."
     - right side: an outline "Open in Statsig" button (`ArrowUpRight`, `STATSIG_EXPERIMENTS_URL`, `target=_blank rel=noreferrer`) and a dark primary "Export results" button (`Download`). Export makes a `Blob` from `toCsv(filtered)` and downloads `experiments-{today}.csv`.
  2. **All experiments**
     - H2, plus a summary such as `"5 total · 2 live · 2 queued · 1 draft · expand a row for details"`
     - segmented tabs All/Live/Queued/Drafts/Concluded. These are `<button>`s with `aria-current`, and "decision" highlights none.
     - the table card (`ExperimentTable`)
     - then, when there are no concluded items, the strip with `Archive` and "No concluded experiments yet — results and learnings will collect here once M1 tests are called." It stays visible whatever the filter.
     - If `page === undefined`, the table card shows "Couldn't reach Statsig · " plus a `<button>` "retry" that calls `router.refresh()`.
     - If `page === null`, it shows "Statsig isn't configured for this deployment."
  3. **KPIs:** 5 cells in one card with vertical dividers. If the page is missing, every value is "—".
  4. **Decision banner:** shown only when `page.decision` is set.
     - danger-soft bg and a `Gavel` chip
     - title and body
     - a "Discuss in #ab-testing" link (`SLACK_CHANNEL_URL`)
     - a "Stop & keep control" danger button that opens `StopDialog`
  5. **Test calendar:** `<TestCalendar calendar={page.calendar} today={page.today} />`.

- [ ] **Step 3: `ExperimentTable`**
  - Columns: chevron · Experiment (name plus the path in muted text) · Status pill · Primary metric · Control → Test (`formatRate → formatRate`, or "—") · Lift (`formatLift`, 14/800, danger when negative, success when positive) · Significance (`significanceLabel`) · Samples (`"1,683 vs 1,720"`, or "—") · Progress (live: a bar at `day/totalDays` plus the label; others: the label) · Owner (or "Unassigned").
  - Each row is a `<tr>`. The chevron cell holds `<button aria-expanded aria-controls="exp-panel-{id}" aria-label="Show details for {name}">`, and clicking anywhere on the row toggles it too.
  - The open set is a `Set<string>` in state, seeded from `?open=` (Live now links), with `scrollIntoView` for the seeded row.
  - An expanded row and its panel `<tr><td colSpan=10>` get the `--purple-chip` bg.
  - The table wrapper is `overflow-x: auto` with `min-width: 1100px` on the table.

- [ ] **Step 4: `TestCalendar`**
  - A 6-column week grid with headers from `calendar.weeks`, plus a vertical "Today" line positioned at `(today − start)/42`.
  - One row per `calendar.rows`: a label and sub on the left, and a bar spanning `start..end` clamped to the window.
  - Tone colours: live `--brand-purple`, losing `--danger`, queued `--purple-rain`, draft is italic muted text with no bar, concluded `--border`.
  - The legend reads Live · Losing · Queued · | Today.
  - The subheading reads "28-day windows on shared traffic."

- [ ] **Step 5: `StopDialog`**
  - A native `<dialog>` (`showModal()`) whose title names the experiment and the kept arm: "Stop {name} and keep {control}?"
  - Body: "This is done in Statsig. You'll make the decision on the experiment page there."
  - Buttons: Cancel, and "Open in Statsig" (link to `statsigUrl`, new tab). No fetch.

- [ ] **Step 6: CSS**
  - Use `exp-*` classes, with values from `experiments.html`.
  - Main area: padding 32 40 56 40, gap 32.
  - Type: H1 40/800/−0.8, H2 22/800/−0.4, column headers 10/800/+0.8 uppercase.
  - Rows 44px minimum. Pills use radius 999. Cards use `--white`, a 1px `--border` and radius 12.
- [ ] **Step 7: Verify**
  - `npm run check` and `npm test` pass.
  - `npm run dev` with `.env.local` (already pulled), then open `/experiments` at 1440 wide.
  - Compare section by section against `XrNZp.png`.
  - Check that the tabs, sidebar views and surface filters all agree, and that the URL round-trips the state.
  - Check that Export downloads a CSV.
  - Save a screenshot to `.context/experiments-1440.png`.
- [ ] **Step 8: Commit.**

---

### Task 6: Detail panel (four blocks) and the daily charts

**Files:**
- Create: `src/components/experiments/experiment-detail.tsx`, `src/components/experiments/daily-charts.tsx`
- Modify: `src/components/experiments/experiment-table.tsx`, `src/app/globals.css`

**Interfaces:**
- Consumes: `ExperimentListItem`, `ExperimentDetail`, `GET /api/experiments/{id}` (Task 3), `formatRate`, `formatLift`, `StopDialog`.
- Produces: `<ExperimentDetailPanel item={ExperimentListItem} />`, which fetches on mount and keeps its own state. Results are kept in a module-level `Map<string, ExperimentDetail>` so reopening a row doesn't fetch again.

- [ ] **Step 1: Slim panel, for queued and draft rows**
  - Block 01 only: the hypothesis, or "No hypothesis written yet.".
  - Facts: Primary metric, Guardrails, MDE "—", Planned run.
  - No fetch.

- [ ] **Step 2: Full panel, for live and concluded rows**
  - **Detail bar:**
    - `Calendar` "Started {Thu, Sep 25} · ends {…}"
    - `Timer` "Day n of N"
    - `Split` "{50 / 50} split"
    - `Target` the metric name
    - on the right: "Open in Statsig" (outline) and "Stop & keep control" (danger, `Square` icon) → `StopDialog`
  - **01 Hypothesis** (fills the space):
    - the hypothesis text at 15/600
    - a facts row: Primary metric / Guardrails / MDE / Planned run
    - a results line from `item.results`, one entry per row: label, `control → test` counts, `formatLift(lift)` coloured by sign, and `controlRate% → testRate%` in muted text. Missing → "—". No "· sample" suffix, since this is real data.
  - **02 Traffic split** (380 wide):
    - "Target {a / b}"
    - a two-part bar at the actual percentages from `detail.exposures`, with "Control 49.4%" and "Test 50.6%"
    - exposure counts under each side
    - an SRM pill: a `CircleCheck` success "No sample-ratio mismatch · p = 0.17", or a danger "Sample-ratio mismatch · p = …"
    - then the muted line "Device split isn't available from Statsig yet."
    - While the detail is loading, show a skeleton.
  - **03 What the pages look like:**
    - caption "Above the fold · desktop"
    - two browser frames side by side: the arm pill (Control in purple-rain, Test in danger) with its signup rate, then a frame with three dots, the URL bar text (`armUrls` host plus path, without `https://`), and a grey body containing an `Image` icon and "Placeholder — swap in the test variant screenshot from Statsig"
    - each frame links to its URL in a new tab
  - **04 Daily exposures & signups:**
    - date range in the title, and a legend: Control (`--exp-control`), Test (`--exp-test`)
    - `<DailyCharts daily={detail.daily} />`
    - if `detail.daily` is null or empty: one line, "Daily breakdown isn't available yet."
  - **If the fetch fails:** an inline error "Couldn't load details from Statsig." with a retry button. The detail bar and block 01 still render, because they come from list data.

- [ ] **Step 3: `DailyCharts`**
  - Two recharts `BarChart`s side by side: "Exposures / day" and "Owner signups / day".
  - Each subtitle shows the totals, e.g. "Control 1,507 · Test 1,549".
  - Each day has two bars (`control`, `test`). Use `<LabelList position="top">` with 9/700 labels, no `CartesianGrid`, an XAxis with `axisLine` and no ticks lines, and a hidden YAxis.
  - Tooltip: date, arm, n, and that day's signup rate.
  - Below the charts, a rate table "Signup rate by day": one column per day plus a final `${n}-day` column; Control and Test rows (Test text in `--danger`). Each cell is `signups/exposures` as `formatRate`. The last column is `Σsignups/Σexposures`.
  - When a day has 0 exposures, show "—".
  - Wrap the charts in a `ResponsiveContainer` with a fixed height of 180.

- [ ] **Step 4:** In `ExperimentTable`, render `<ExperimentDetailPanel>` in the expanded row, replacing the Task 5 placeholder.

- [ ] **Step 5: Verify**
  - `npm run check` and `npm test` pass.
  - In dev, expand Scheduling LP Module. The daily charts show 10 days, the exposure totals equal the table's samples (6,852 vs 7,013), and SRM reads p ≈ 0.17.
  - Expanding two rows at once works.
  - Draft rows show the slim panel.
  - Save `.context/experiments-expanded.png`.

- [ ] **Step 6: Commit.**

---

### Task 7: Final verification, rebase, PR and review loop

- [ ] **Step 1:** `git fetch origin && git rebase origin/main && npm run check && npm test`. All must pass.
- [ ] **Step 2: Check that no secret reaches the client.**
  - Run `npm run build`, then `grep -r "STATSIG_CONSOLE_API_KEY\|console-" .next/static | head`.
  - Expected: no matches that contain a key value. The literal name in server chunks is fine.
- [ ] **Step 3: Check that the only Statsig write is nothing.**
  - Run `grep -rn "statsigapi" src | grep -v "console/v1\"" ; grep -rn "method:" src/lib/experiments.ts src/lib/statsig.ts`.
  - Expected: no POST, PATCH or DELETE.
- [ ] **Step 4: Push and open the PR.**
  - Run `git push -u origin ab-testing-hub-tab`, then `gh pr create --base main --title "AI Hub: Experiments (A/B testing) tab on live Statsig data"`.
  - The body summarises the spec decisions: no device split, the `dimensional_exposures` finding, the status mapping, and that Stop is link-out only. Embed both screenshots.
- [ ] **Step 5: Reviewer loop.** This follows the user's AGENTS.md rule for this repo. Don't ping anyone in Slack.
  - Spawn 2 fresh reviewer subagents in parallel:
    - (a) correctness, edge cases and security
    - (b) tests, repo conventions (AGENTS.md, PRODUCT.md, this plan's Global Constraints) and scope creep
  - Give each one `git diff origin/main...HEAD`, the spec and this plan.
  - They report blocker / nit / question with file:line.
  - Fix, push, and run fresh reviewers again. Stop at the first clean round, or after 4 rounds.
- [ ] **Step 6: Report to Brian:** PR link, head SHA, the rounds, what was fixed and what was rejected. **Don't merge** unless Brian authorizes it.
