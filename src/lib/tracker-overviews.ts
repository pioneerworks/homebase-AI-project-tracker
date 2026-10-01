import "server-only";

import { cache } from "react";

import { getProjectOverview, type ProjectOverview } from "@/lib/linear-projects";
import { DONE_PROJECTS, TRACKER_PROJECTS, type DoneProject, type TrackerProject } from "@/lib/tracker-projects";

function loadOverviews(
  projects: (TrackerProject | DoneProject)[],
): Promise<(ProjectOverview | null)[]> {
  return Promise.all(
    projects.map((p) =>
      getProjectOverview(p.linearSlugId, p.key).catch((error) => {
        console.log(
          `[overview] Linear fetch failed for ${p.key}:`,
          error instanceof Error ? error.message : error,
        );
        return null;
      }),
    ),
  );
}

/**
 * Linear overviews for every tracker project, in TRACKER_PROJECTS order, with
 * null where a fetch failed. Memoized per request so the overview page's
 * sections share one set of calls; the sidebar reads the same per-project
 * cache (and in-flight fetches) through getProjectOverview.
 */
export const getTrackerOverviews = cache(() => loadOverviews(TRACKER_PROJECTS));

/** Same, for DONE_PROJECTS. */
export const getDoneOverviews = cache(() => loadOverviews(DONE_PROJECTS));
