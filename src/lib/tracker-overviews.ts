import { cache } from "react";

import { getProjectOverview, type ProjectOverview } from "@/lib/linear-projects";
import { TRACKER_PROJECTS } from "@/lib/tracker-projects";

/**
 * Linear overviews for every tracker project, in TRACKER_PROJECTS order, with
 * null where a fetch failed. Memoized per request so the sidebar (layout) and
 * the overview page share one set of Linear calls.
 */
export const getTrackerOverviews = cache(
  async (): Promise<(ProjectOverview | null)[]> =>
    Promise.all(
      TRACKER_PROJECTS.map((p) =>
        getProjectOverview(p.linearSlugId, p.key).catch((error) => {
          console.log(
            `[overview] Linear fetch failed for ${p.key}:`,
            error instanceof Error ? error.message : error,
          );
          return null;
        }),
      ),
    ),
);
