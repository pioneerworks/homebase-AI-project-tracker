// Pure milestone types and helpers, safe to import from client components.

export type MilestoneIssue = {
  identifier: string;
  title: string;
  url: string;
  stateName: string;
  stateType: string;
  assignee: string | null;
};

export type ProjectMilestoneSummary = {
  id: string;
  name: string;
  description: string | null;
  targetDate: string | null;
  /** 0–100, Linear's own milestone progress */
  progress: number;
  issues: MilestoneIssue[];
};

/**
 * The next milestone still in flight: the earliest-dated one below 100%,
 * falling back to the first undated open milestone.
 */
export function nextMilestone(
  milestones: ProjectMilestoneSummary[] | null | undefined,
): ProjectMilestoneSummary | null {
  const open = (milestones ?? []).filter((m) => m.progress < 100);
  const dated = open
    .filter((m) => m.targetDate)
    .sort((a, b) => a.targetDate!.localeCompare(b.targetDate!));
  return dated[0] ?? open[0] ?? null;
}
