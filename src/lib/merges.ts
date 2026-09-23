import rawMerges from "@/data/pr-merges.json";
import { fetchMergedPrs } from "@/lib/github-merges";

export type MergedPr = {
  number: number;
  title: string;
  mergedAt: string;
  author: string | null;
  labels: string[];
};

export type MergeDay = {
  date: string; // YYYY-MM-DD
  count: number;
  prs: MergedPr[];
};

const merges = rawMerges as MergedPr[];

const TICKET_KEY_RE = /\b([A-Z]{3,7}-\d+)\b/;
const CHORE_RE = /^(chore|deps|ci|docs)(\(|:)/i;

export function ticketKey(title: string): string | null {
  return title.match(TICKET_KEY_RE)?.[1] ?? null;
}

export function isChore(pr: MergedPr): boolean {
  return CHORE_RE.test(pr.title) || pr.author === "vercel[bot]";
}

function bucketize(prs: MergedPr[]): MergeDay[] {
  const byDay = new Map<string, MergedPr[]>();
  for (const pr of prs) {
    const day = pr.mergedAt.slice(0, 10);
    const list = byDay.get(day);
    if (list) list.push(pr);
    else byDay.set(day, [pr]);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, prs]) => ({ date, count: prs.length, prs }));
}

export type MergeSource = "github" | "seed";

/**
 * Per-day merged PRs for a repo. Uses live GitHub data when GITHUB_TOKEN is
 * set; otherwise falls back to the committed seed (marketing-site-payload
 * history captured at build time).
 */
export async function getMergeDays(
  repo = "marketing-site-payload",
): Promise<{ days: MergeDay[]; source: MergeSource }> {
  if (repo === "marketing-site-payload") {
    const live = await fetchMergedPrs(repo, 120);
    if (live) return { days: bucketize(live), source: "github" };
  }
  return { days: bucketize(merges), source: "seed" };
}

export function mergeStats(days: MergeDay[]) {
  const active = days.filter((d) => d.count > 0);
  const total = days.reduce((sum, d) => sum + d.count, 0);
  return {
    total,
    daysWithMerges: active.length,
    firstMergeDay: days[0]?.date ?? null,
    lastMergeDay: days[days.length - 1]?.date ?? null,
    medianPerActiveDay: active.length
      ? active.map((d) => d.count).sort((a, b) => a - b)[
          Math.floor(active.length / 2)
        ]
      : 0,
  };
}
