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
  {
    key: "launch-more-tool-pages",
    name: "Launch more tool pages",
    linearSlugId: "d03b951404ed",
    linearUrl:
      "https://linear.app/joinhomebase/project/launch-more-tool-pages-d03b951404ed/overview",
    status: "active",
    shortPurpose:
      "Ship one or two new or rebuilt tool pages every two weeks, then automate their post-publish distribution and monitoring.",
    repos: ["marketing-site-payload"],
  },
  {
    key: "unlock-agentic-design-content",
    name: "Unlock agentic design/content capabilities",
    linearSlugId: "b12b50221653",
    linearUrl:
      "https://linear.app/joinhomebase/project/unlock-agentic-designcontent-capabilities-b12b50221653/overview",
    status: "active",
    shortPurpose:
      "Make Figma the front door to the agent pipeline, with a master brand-safe design file as the source of truth for agent work.",
    repos: ["marketing-site-payload"],
  },
  {
    key: "payload-admin-rebuild",
    name: "Payload admin rebuild — from stock Payload to Braveen's design",
    linearSlugId: "098422f41fd9",
    linearUrl:
      "https://linear.app/joinhomebase/project/payload-admin-rebuild-from-stock-payload-to-braveens-design-098422f41fd9/overview",
    status: "active",
    shortPurpose:
      "Rebuild the Payload admin panel from the stock CMS to Braveen's design so editors get a purpose-built workspace.",
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
