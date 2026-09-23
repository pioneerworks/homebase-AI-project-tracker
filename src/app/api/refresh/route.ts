import { revalidateTag } from "next/cache";
import { NextRequest, NextResponse } from "next/server";

import { fetchMergedPrs } from "@/lib/github-merges";
import { getSignupSeries } from "@/lib/omni";
import { refreshSnapshot } from "@/lib/linear";
import { SNAPSHOT_TAG } from "@/lib/projects";
import { TRACKER_PROJECTS } from "@/lib/tracker-projects";

export const runtime = "nodejs";

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
  for (const project of TRACKER_PROJECTS) {
    revalidateTag(`linear-project-${project.linearSlugId}`, { expire: 0 });
  }
  const repos = [...new Set(TRACKER_PROJECTS.flatMap((project) => project.repos))];
  for (const repo of repos) {
    revalidateTag(`merges-${repo}`, { expire: 0 });
  }
  revalidateTag("omni-signups", { expire: 0 });
  try {
    const snapshot = await refreshSnapshot();

    // Best-effort warm of the impact-chart sources so page views don't pay
    // the fetch cost and credential health is proven hourly. Failures are
    // reported but never fail the refresh.
    const warmed = await Promise.allSettled([
      ...repos.map((repo) => fetchMergedPrs(repo)),
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
