/**
 * GitHub merged-PR fetch for impact tracking.
 * Requires GITHUB_TOKEN (repo scope is enough). When the token is missing or
 * masked, callers fall back to the committed seed data (src/data/pr-merges.json).
 */
import type { MergedPr } from "@/lib/merges";

const GITHUB_API = "https://api.github.com";

type GitHubPull = {
  number: number;
  title: string;
  merged_at: string | null;
  updated_at?: string;
  user: { login: string } | null;
  labels: { name: string }[] | null;
};

export function hasGithubToken(): boolean {
  const token = process.env.GITHUB_TOKEN?.trim();
  return Boolean(token) && !token!.includes("SENSITIVE");
}

export async function fetchMergedPrs(
  repo: string,
  windowDays = 120,
): Promise<MergedPr[] | null> {
  if (!hasGithubToken()) return null;
  const token = process.env.GITHUB_TOKEN!.trim();
  const since = Date.now() - windowDays * 86400000;
  const out: MergedPr[] = [];

  for (let page = 1; page <= 10; page++) {
    const response = await fetch(
      `${GITHUB_API}/repos/pioneerworks/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=100&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
        },
        next: { revalidate: 3600, tags: [`merges-${repo}`] },
      },
    );
    if (!response.ok) return null;
    const batch = (await response.json()) as GitHubPull[];
    let mergedSeen = 0;
    for (const pr of batch) {
      if (!pr.merged_at) continue;
      mergedSeen++;
      if (Date.parse(pr.merged_at) < since) continue;
      out.push({
        number: pr.number,
        title: pr.title,
        mergedAt: pr.merged_at,
        author: pr.user?.login ?? null,
        labels: (pr.labels ?? []).map((l) => l.name),
      });
    }
    if (batch.length < 100) break;
    // sorted by updated_at, not merged_at: keep paging a bit even if a page
    // looks old, but bail out once we're clearly past the window
    if (mergedSeen === 0 && batch.length && Date.parse(batch[batch.length - 1].updated_at ?? "") < since) break;
  }

  return out.length ? out.sort((a, b) => a.mergedAt.localeCompare(b.mergedAt)) : null;
}
