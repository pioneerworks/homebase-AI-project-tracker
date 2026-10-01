import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { clearMergedPrCache, fetchMergedPrs } from "@/lib/github-merges";
import { clearProjectOverviewCache, getProjectOverview } from "@/lib/linear-projects";
import { getSignupSeries } from "@/lib/omni";
import { refreshSnapshot } from "@/lib/linear";
import { SNAPSHOT_TAG } from "@/lib/projects";
import { DONE_PROJECTS, TRACKER_PROJECTS } from "@/lib/tracker-projects";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.DASHBOARD_REFRESH_SECRET;
  if (!secret) return process.env.NODE_ENV !== "production";
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  revalidateTag(SNAPSHOT_TAG, { expire: 0 });
  revalidateTag("omni-signups", { expire: 0 });
  // GitHub merges and Linear project overviews live in per-instance memory
  // caches: this clears and warms only the instance serving this request;
  // other instances refresh when their 1h TTL lapses.
  clearMergedPrCache();
  clearProjectOverviewCache();
  const repos = [...new Set(TRACKER_PROJECTS.flatMap((project) => project.repos))];
  try {
    const snapshot = await refreshSnapshot();

    // Best-effort warm of this instance's Overview sources. GitHub and
    // Amplitude fall back silently (null / captured data) rather than
    // rejecting, so warmFailures counts Linear failures only. Failures never
    // fail the refresh.
    const warmed = await Promise.allSettled([
      ...repos.map((repo) => fetchMergedPrs(repo)),
      ...[...TRACKER_PROJECTS, ...DONE_PROJECTS].map((p) =>
        getProjectOverview(p.linearSlugId, p.key),
      ),
      getSignupSeries(),
    ]);
    const warmFailures = warmed.filter(
      (result) => result.status === "rejected",
    ).length;

    return NextResponse.json({
      ok: true,
      generatedAt: snapshot.generatedAt,
      source: snapshot.source,
      done: snapshot.overall.done,
      total: snapshot.overall.total,
      warmFailures,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown Linear API error";
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
