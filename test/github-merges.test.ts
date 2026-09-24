import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchMergedPrs, hasGithubToken } from "../src/lib/github-merges";

type PullStub = {
  number: number;
  title: string;
  merged_at: string | null;
  updated_at?: string;
  user: { login: string } | null;
  labels: { name: string }[] | null;
};

const DAY = 86_400_000;

/** Merged inside the 120-day window by default. */
const pull = (number: number, over: Partial<PullStub> = {}): PullStub => ({
  number,
  title: `feat: pr ${number}`,
  merged_at: new Date(Date.now() - 1 * DAY).toISOString(),
  updated_at: new Date(Date.now() - 1 * DAY).toISOString(),
  user: { login: "twong-prog" },
  labels: null,
  ...over,
});

const fullPage = (startNumber: number): PullStub[] =>
  Array.from({ length: 100 }, (_, i) => pull(startNumber + i));

type PageStub = { status: number; pulls: PullStub[] };

/**
 * Run fetchMergedPrs with global fetch stubbed per GitHub page number.
 * Pages without an entry return an empty page (never a failure) so batched
 * prefetch of unrequested pages doesn't abort the round. Returns the page
 * numbers that were actually requested.
 */
async function withStubbedFetch(
  pages: Record<number, PageStub>,
  run: () => Promise<unknown>,
): Promise<number[]> {
  const originalFetch = globalThis.fetch;
  const originalToken = process.env.GITHUB_TOKEN;
  const requested: number[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const page = Number(new URL(String(input)).searchParams.get("page"));
    requested.push(page);
    const entry = pages[page] ?? { status: 200, pulls: [] };
    return {
      ok: entry.status < 400,
      status: entry.status,
      json: async () => entry.pulls,
    };
  }) as unknown as typeof fetch;
  process.env.GITHUB_TOKEN = "test-token";
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
    if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
    else process.env.GITHUB_TOKEN = originalToken;
  }
  return requested;
}

test("hasGithubToken ignores masked placeholders", () => {
  const original = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "SENSITIVE placeholder";
  assert.equal(hasGithubToken(), false);
  process.env.GITHUB_TOKEN = "real-token";
  assert.equal(hasGithubToken(), true);
  if (original === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = original;
});

test("fetchMergedPrs stops after a short page", async () => {
  let result: unknown;
  const requested = await withStubbedFetch(
    { 1: { status: 200, pulls: [pull(1), pull(2), pull(3)] } },
    async () => {
      result = await fetchMergedPrs("marketing-site-payload");
    },
  );
  // pages 2-3 of the first batch are fetched and discarded after page 1's
  // short-page exit
  assert.deepEqual(requested, [1, 2, 3]);
  assert.equal((result as { number: number }[] | null)?.length, 3);
});

test("fetchMergedPrs pages through full pages in parallel batches", async () => {
  let result: unknown;
  const requested = await withStubbedFetch(
    {
      1: { status: 200, pulls: fullPage(1) },
      2: { status: 200, pulls: fullPage(101) },
      3: { status: 200, pulls: [pull(201), pull(202)] },
    },
    async () => {
      result = await fetchMergedPrs("marketing-site-payload");
    },
  );
  // pages 1-3 are one parallel batch; the short page 3 ends the loop there
  assert.deepEqual(requested, [1, 2, 3]);
  assert.equal((result as { number: number }[] | null)?.length, 202);
});

test("fetchMergedPrs stops on a stale unmerged page", async () => {
  let result: unknown;
  const requested = await withStubbedFetch(
    {
      1: {
        status: 200,
        pulls: [
          pull(1, {
            merged_at: null,
            updated_at: new Date(Date.now() - 200 * DAY).toISOString(),
          }),
        ],
      },
    },
    async () => {
      result = await fetchMergedPrs("marketing-site-payload");
    },
  );
  // the stale-page exit fires while page 1 is processed; pages 2-3 of the
  // batch were fetched and discarded
  assert.deepEqual(requested, [1, 2, 3]);
  assert.equal(result, null);
});

test("fetchMergedPrs returns null when a page fails", async () => {
  let result: unknown;
  const requested = await withStubbedFetch(
    {
      1: { status: 200, pulls: [pull(1)] },
      2: { status: 403, pulls: [] },
    },
    async () => {
      result = await fetchMergedPrs("marketing-site-payload");
    },
  );
  assert.deepEqual(requested.sort((a, b) => a - b), [1, 2, 3]);
  assert.equal(result, null);
});

test("fetchMergedPrs dedupes a PR that shifts across page boundaries", async () => {
  let result: unknown;
  await withStubbedFetch(
    {
      // page 1 must be full so the loop continues to page 2; PR 100 appears
      // on both pages because it shifted between the parallel requests
      1: { status: 200, pulls: fullPage(1) },
      2: { status: 200, pulls: [pull(100), pull(101), pull(102)] },
    },
    async () => {
      result = await fetchMergedPrs("marketing-site-payload");
    },
  );
  const numbers = (result as { number: number }[]).map((pr) => pr.number);
  assert.equal(numbers.length, 102);
  assert.equal(new Set(numbers).size, numbers.length, "no duplicate PRs");
  assert.equal(numbers.filter((n) => n === 100).length, 1);
});
