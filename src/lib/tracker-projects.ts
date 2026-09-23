export type TrackerProject = {
  key: string;
  name: string;
  linearSlugId: string;
  linearUrl: string;
  status: "active" | "done";
  shortPurpose: string;
  repos: string[];
};

export const TRACKER_PROJECTS: TrackerProject[] = [
  {
    key: "marketing-site-execution-agents",
    name: "Marketing site execution agents",
    linearSlugId: "c5b9ca95167e",
    linearUrl:
      "https://linear.app/joinhomebase/project/marketing-site-execution-agents-c5b9ca95167e/overview",
    status: "active",
    shortPurpose:
      "Agent-run execution on the marketing site across the Atrium and Culina agent fleets — shipping page work, fixes, and experiments at scale.",
    repos: ["marketing-site-payload"],
  },
  {
    key: "ab-testing",
    name: "A/B testing | Experimentation",
    linearSlugId: "d9f5d074ffc1",
    linearUrl:
      "https://linear.app/joinhomebase/project/ab-testing-d9f5d074ffc1/overview",
    status: "active",
    shortPurpose:
      "Experimentation program: A/B tests on landing pages and signup flows to move conversion.",
    repos: ["marketing-site-payload"],
  },
  {
    key: "self-serve-site-changes",
    name: "Self-serve site changes",
    linearSlugId: "eab631bd2f63",
    linearUrl:
      "https://linear.app/joinhomebase/project/self-serve-site-changes-eab631bd2f63/overview",
    status: "active",
    shortPurpose:
      "Let marketing teams make site changes themselves without engineering round-trips.",
    repos: ["marketing-site-payload"],
  },
  {
    key: "payload-cms",
    name: "Payload CMS",
    linearSlugId: "14729364d08d",
    linearUrl:
      "https://linear.app/joinhomebase/project/payload-cms-from-just-a-migrated-to-marketing-ready-14729364d08d/overview",
    status: "active",
    shortPurpose:
      "Take Payload from 'just migrated' to marketing-ready: authoring experience, content ops, and site features on the new CMS.",
    repos: ["marketing-site-payload"],
  },
];

export const DONE_PROJECTS = [
  {
    key: "migration",
    name: "Marketing site migration",
    href: "/migration",
    blurb:
      "joinhomebase.com migration progress, URL parity, and hosting cutover — completed. Kept for reference.",
  },
] as const;

export function trackerProject(key: string): TrackerProject | undefined {
  return TRACKER_PROJECTS.find((p) => p.key === key);
}
