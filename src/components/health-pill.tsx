import type { ProjectHealth } from "@/lib/linear-projects";

const HEALTH_LABEL: Record<ProjectHealth, string> = {
  onTrack: "On track",
  atRisk: "At risk",
  offTrack: "Off track",
};

export default function HealthPill({ health }: { health: ProjectHealth | null }) {
  if (!health) return <span className="health-pill health-none">No health set</span>;
  return <span className={`health-pill health-${health}`}>{HEALTH_LABEL[health]}</span>;
}
