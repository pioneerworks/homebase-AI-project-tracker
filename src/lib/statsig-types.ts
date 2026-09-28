/**
 * Minimal TypeScript shapes for the Statsig Console API DTOs this dashboard
 * reads (subset of the official 20240601 OpenAPI spec, api.statsig.com).
 */

export interface ExternalExperimentDto {
  id: string;
  name: string;
  description?: string;
  hypothesis?: string;
  permalink?: string;
  status?: "active" | "setup" | "decision_made" | "abandoned" | "archived" | "experiment_stopped" | "assignment_stopped";
  startTime?: number | null;
  duration?: number | null;
  slowRate?: number | null;
  tags?: string[];
  controlGroupID?: string | null;
  primaryMetrics?: Array<{ name: string; type: string }>;
  secondaryMetrics?: Array<{ name: string; type: string }>;
  groups: Array<{
    name: string;
    id: string | null;
    size?: number;
    isControl?: boolean;
    disabled?: boolean;
  }>;
}

export interface ExperimentPulseResultsDto {
  /** Date of the results snapshot, YYYY-MM-DD. */
  ds?: string;
  primaryMetrics: Array<{
    metricID: string;
    metricName: string;
    directionality?: "increase" | "decrease";
    /** Machine-readable reason stats are unavailable (no_data, ...). */
    error?: string | null;
    absoluteChange?: number;
    percentChange?: number;
    testMean?: number;
    controlMean?: number;
    testUnits?: number;
    controlUnits?: number;
    pValue?: number;
    adjustedAlpha?: number;
    percentConfidenceInterval?: { lower: number; upper: number };
    confidenceInterval?: { lower: number; upper: number };
  }>;
  secondaryMetrics?: ExperimentPulseResultsDto["primaryMetrics"];
}
