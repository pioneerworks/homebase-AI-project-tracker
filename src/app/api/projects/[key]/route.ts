import { NextResponse } from "next/server";

import { getProjectOverview } from "@/lib/linear-projects";
import { getSessionUser } from "@/lib/oidc-session";
import { trackerProject } from "@/lib/tracker-projects";

export const runtime = "nodejs";

/**
 * Relay route: exposes the live Linear project overview as JSON.
 * Local development without a LINEAR_API_KEY fetches this route from the
 * production deployment instead of hitting Linear directly.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ key: string }> },
) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      {
        status: 401,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }

  const { key } = await params;
  const project = trackerProject(key);
  if (!project) {
    return NextResponse.json(
      { error: `Unknown project: ${key}` },
      { status: 404, headers: { "Cache-Control": "private, no-store" } },
    );
  }

  try {
    const overview = await getProjectOverview(project.linearSlugId, project.key);
    return NextResponse.json(overview, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Linear fetch failed" },
      { status: 502, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
