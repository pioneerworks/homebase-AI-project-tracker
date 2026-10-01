import type { ProjectOverview } from "@/lib/linear-projects";
import { nextMilestone } from "@/lib/milestones";
import type { ExperimentCard } from "@/lib/statsig";

export type ProjectStateKey = "done" | "overdue" | "offTrack" | "atRisk" | "onTrack" | "none";

export type ProjectState = {
  key: ProjectStateKey;
  label: string;
  /** Whole days past the next milestone's target date (overdue only). */
  lateDays: number;
};

export const STATE_LABELS: Record<ProjectStateKey, string> = {
  done: "Done",
  overdue: "Overdue",
  offTrack: "Off track",
  atRisk: "At risk",
  onTrack: "On track",
  none: "No health set",
};

/** States that belong in "Needs attention". */
export const ATTENTION_STATES: ReadonlySet<ProjectStateKey> = new Set([
  "overdue",
  "offTrack",
  "atRisk",
]);

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/**
 * Display state for a project, first match wins: an overdue next milestone
 * overrides whatever health the lead reported in Linear.
 */
export function projectState(
  overview: Pick<ProjectOverview, "health" | "milestones"> | null,
  today: string,
): ProjectState {
  if (!overview) return { key: "none", label: STATE_LABELS.none, lateDays: 0 };
  const next = nextMilestone(overview.milestones);
  const lateDays = next?.targetDate ? daysBetween(next.targetDate, today) : 0;
  const key: ProjectStateKey = lateDays > 0 ? "overdue" : (overview.health ?? "none");
  return { key, label: STATE_LABELS[key], lateDays: key === "overdue" ? lateDays : 0 };
}

/**
 * The health the lead set on the Linear project, for the sidebar dots.
 * Unlike projectState, an overdue milestone does not override it.
 */
export function healthState(overview: Pick<ProjectOverview, "health"> | null): ProjectStateKey {
  return overview?.health ?? "none";
}

/**
 * Name and one-line summary for a project row, straight from Linear. With no
 * Linear data there is no hardcoded copy: the row shows its key and no summary.
 */
export function projectIdentity(
  key: string,
  overview: Pick<ProjectOverview, "name" | "description"> | null,
): { name: string; description: string } {
  return {
    name: overview?.name?.trim() || key,
    description: overview?.description?.trim() ?? "",
  };
}

export const DONE_STATE: ProjectState = { key: "done", label: STATE_LABELS.done, lateDays: 0 };

export type AttentionItem = {
  kind: "experiment" | "overdue" | "health";
  title: string;
  meta: string;
  href: string;
  external: boolean;
};

export type AttentionProject = {
  key: string;
  /** Linear project name */
  name: string;
  overview: ProjectOverview | null;
  state: ProjectState;
};

const signed = (value: number) => `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}%`;

export function formatPValue(p: number | null): string {
  if (p == null) return "p unavailable";
  return p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`;
}

/**
 * Items for the "Needs attention" strip: significant losing experiments, then
 * projects whose state needs a hand, in table order.
 */
export function attentionItems(
  experiments: ExperimentCard[] | null,
  projects: AttentionProject[],
  formatDay: (iso: string) => string,
): AttentionItem[] {
  const losing: AttentionItem[] = (experiments ?? [])
    .filter((e) => e.verdict === "losing" && e.percentChange != null)
    .map((e) => ({
      kind: "experiment",
      // verdict first, so a clamped title never hides it
      title: `Losing: ${e.title}`,
      meta: `${signed(e.percentChange!)} ${e.primaryMetric ?? "primary metric"} · significant (${formatPValue(e.pValue)})`,
      href: e.permalink ?? "https://console.statsig.com",
      external: true,
    }));
  const flagged: AttentionItem[] = projects
    .filter((p) => ATTENTION_STATES.has(p.state.key))
    .map((p) => {
      const next = p.overview ? nextMilestone(p.overview.milestones) : null;
      const href = `/projects/${p.key}`;
      if (p.state.key === "overdue" && next) {
        return {
          kind: "overdue",
          title: `${p.name} · ${next.name}`,
          meta: `Due ${formatDay(next.targetDate!)} · ${next.progress}% done`,
          href,
          external: false,
        };
      }
      return {
        kind: "health",
        title: `${p.name} is ${p.state.label.toLowerCase()}`,
        meta: next ? `Next: ${next.name} · ${next.progress}% done` : "Health set in Linear",
        href,
        external: false,
      };
    });
  return [...losing, ...flagged];
}

/** "3 overdue · 1 at risk · 1 losing test" */
export function attentionSummary(items: AttentionItem[], projects: AttentionProject[]): string {
  const count = (key: ProjectStateKey) => projects.filter((p) => p.state.key === key).length;
  const losing = items.filter((i) => i.kind === "experiment").length;
  return [
    count("overdue") && `${count("overdue")} overdue`,
    count("offTrack") && `${count("offTrack")} off track`,
    count("atRisk") && `${count("atRisk")} at risk`,
    losing && `${losing} losing test${losing > 1 ? "s" : ""}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function initials(name: string | null | undefined): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
