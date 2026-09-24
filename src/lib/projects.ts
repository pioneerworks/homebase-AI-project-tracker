import type { ProjectConfig } from "./types";

export const MIGRATED_SITE_ORIGIN =
  "https://marketing-site-payload.vercel.app";

export const PILLAR_PROJECTS: ProjectConfig[] = [
  {
    id: "56f8421b-82e7-43c9-bc92-2c6bb579f0c2",
    key: "product",
    name: "Product/content families",
    shortName: "Product/content",
    url: "https://linear.app/joinhomebase/project/pillar-migration-productcontent-families-and-page-instances-7e51147c520e",
  },
  {
    id: "4598b5ea-4e7b-4bdd-ad35-935d075d5b49",
    key: "seo",
    name: "Repeatable SEO, static & industry",
    shortName: "SEO/static/industry",
    url: "https://linear.app/joinhomebase/project/pillar-migration-repeatable-seo-static-and-industry-pages-7bae9c141320",
  },
  {
    id: "ec23ecc7-6eb4-475f-8006-28535e6ce7f1",
    key: "blog",
    name: "Blog CMS & hub",
    shortName: "Blog CMS",
    url: "https://linear.app/joinhomebase/project/pillar-migration-blog-cms-and-blog-hub-53fd111931ba",
  },
  {
    id: "48b1e4f1-c7cc-4073-9ebc-b8b1adcd2d99",
    key: "foundations",
    name: "Noindex, foundations & special cases",
    shortName: "Foundations/special cases",
    url: "https://linear.app/joinhomebase/project/pillar-migration-noindex-foundations-and-special-cases-af82d50959a7",
  },
  {
    id: "06c2c723-c6b0-4ef5-a138-d2daacc5f52d",
    key: "webflow-cloud",
    name: "Webflow Cloud pages",
    shortName: "Webflow Cloud",
    url: "https://linear.app/joinhomebase/project/pillar-migration-webflow-cloud-pages-32be9962a7bf",
  },
];

export const ACTIVE_PROJECTS: ProjectConfig[] = [
  {
    id: "414a5123-e910-428f-b761-30b156b2dd7f",
    key: "payload-cms",
    name: "Payload CMS — from just a migrated to marketing-ready",
    shortName: "Payload CMS",
    url: "https://linear.app/joinhomebase/project/payload-cms-from-just-a-migrated-to-marketing-ready-14729364d08d",
  },
  {
    id: "01dbdbcb-19e4-448f-b774-0b50bbd953c3",
    key: "execution-agents",
    name: "Marketing Site Execution agents",
    shortName: "Execution agents",
    url: "https://linear.app/joinhomebase/project/marketing-site-execution-agents-c5b9ca95167e",
  },
  {
    id: "8df2e3c5-20ca-40c1-a246-7a6dd1c3c9ea",
    key: "internal-linking",
    name: "Internal Linking Infrastructure (Payload CMS)",
    shortName: "Internal linking",
    url: "https://linear.app/joinhomebase/project/internal-linking-infrastructure-payload-cms-678361d6ebf9",
  },
  {
    id: "20f71cb2-8396-44d0-b54f-112745894ff0",
    key: "self-serve",
    name: "Self-serve site changes",
    shortName: "Self-serve changes",
    url: "https://linear.app/joinhomebase/project/self-serve-site-changes-eab631bd2f63",
  },
  {
    id: "55d85f87-4449-4b54-a408-1af3b1e55468",
    key: "context-layer",
    name: "Homebase Marketing Context Layer + Agent",
    shortName: "Context layer",
    url: "https://linear.app/joinhomebase/project/homebase-marketing-context-layer-agent-e366b0052681",
  },
  {
    id: "c31cd530-66ea-4b1b-b521-23cbf88881c5",
    key: "feedback-tool",
    name: "Agent-friendly feedback tool for landing pages",
    shortName: "Feedback tool",
    url: "https://linear.app/joinhomebase/project/agent-friendly-feedback-tool-for-landing-pages-4ebbfc1e8d7b",
  },
  {
    // Linear's project(id:) lookup accepts the slugId as well as the UUID
    // (see getProjectOverview in linear-projects.ts).
    id: "098422f41fd9",
    key: "payload-admin-rebuild",
    name: "Payload admin rebuild — from stock Payload to Braveen's design",
    shortName: "Admin rebuild",
    url: "https://linear.app/joinhomebase/project/payload-admin-rebuild-from-stock-payload-to-braveens-design-098422f41fd9",
  },
];

export const DECISIONS_PROJECT: ProjectConfig = {
  id: "7d651fee-d6cc-4b3f-bfbd-ab44c3e1e955",
  key: "decisions",
  name: "Migration decisions & learnings",
  shortName: "Decisions & learnings",
  url: "https://linear.app/joinhomebase/project/migration-decisions-learnings-f672cd82c870/issues?layout=list&ordering=priority&grouping=workflowState&subGrouping=none&showCompletedIssues=all&showSubIssues=true&showTriageIssues=true",
};

export const HOSTING_PROJECT: ProjectConfig = {
  id: "d98d04b1-af0a-4657-a74b-66aad9c010bf",
  key: "hosting",
  name: "Hosting Migration — Webflow to Vercel",
  shortName: "Hosting cutover",
  url: "https://linear.app/joinhomebase/project/hosting-migration-webflow-to-vercel-9a1247e7f6e6/overview",
};

export const MIGRATION_PROJECT: ProjectConfig = {
  id: "7710a614-5671-4ab8-807d-f6ee60d1f914",
  key: "migration",
  name: "Web Migration: Webflow → Nextjs + Vercel",
  shortName: "Web migration",
  url: "https://linear.app/joinhomebase/project/web-migration-webflow-nextjs-vercel-97fe44f106cb/overview",
};

export const SNAPSHOT_TAG = "linear-migration-snapshot";
