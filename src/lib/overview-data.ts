import "server-only";

import { cache } from "react";

import { getMergeDays } from "@/lib/merges";
import { getSignupSeries } from "@/lib/omni";
import { getRunningExperiments, type ExperimentCard } from "@/lib/statsig";

export const MERGE_REPO = "marketing-site-payload";

/**
 * Per-request loaders for the Overview's streamed sections. Each section
 * awaits only what it needs; cache() makes sections that share a source
 * (attention strip + experiments card) share one call.
 */
export const loadMergeDays = cache(() => getMergeDays(MERGE_REPO));

export const loadSignupSeries = cache(() => getSignupSeries());

/** undefined = fetch failed, null = Statsig not configured. */
export const loadExperiments = cache(
  (): Promise<ExperimentCard[] | null | undefined> =>
    getRunningExperiments().catch((error) => {
      console.log(
        "[overview] Statsig fetch failed:",
        error instanceof Error ? error.message : error,
      );
      return undefined;
    }),
);
