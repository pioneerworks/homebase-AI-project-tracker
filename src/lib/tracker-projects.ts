/**
 * Which Linear projects the hub tracks. Only identifiers live here: every
 * name, summary, lead, link and date shown on the hub is read from Linear.
 */
export type TrackerProject = {
  /** URL key for /projects/[key] */
  key: string;
  linearSlugId: string;
  /** GitHub repos whose merges feed the impact chart */
  repos: string[];
};

export type DoneProject = {
  key: string;
  linearSlugId: string;
  /** In-app page kept for reference */
  href: string;
};

export const TRACKER_PROJECTS: TrackerProject[] = [
  {
    key: "marketing-site-execution-agents",
    linearSlugId: "c5b9ca95167e",
    repos: ["marketing-site-payload"],
  },
  {
    key: "ab-testing",
    linearSlugId: "d9f5d074ffc1",
    repos: ["marketing-site-payload"],
  },
  {
    key: "launch-more-tool-pages",
    linearSlugId: "d03b951404ed",
    repos: ["marketing-site-payload"],
  },
  {
    key: "unlock-agentic-design-content",
    linearSlugId: "b12b50221653",
    repos: ["marketing-site-payload"],
  },
  {
    key: "payload-admin-rebuild",
    linearSlugId: "098422f41fd9",
    repos: ["marketing-site-payload"],
  },
];

export const DONE_PROJECTS: DoneProject[] = [
  {
    key: "migration",
    linearSlugId: "97fe44f106cb",
    href: "/migration",
  },
];

export function trackerProject(key: string): TrackerProject | undefined {
  return TRACKER_PROJECTS.find((p) => p.key === key);
}

/** Any hub project, active or done, by key. */
export function linearProject(key: string): TrackerProject | DoneProject | undefined {
  return trackerProject(key) ?? DONE_PROJECTS.find((p) => p.key === key);
}
