// Pure PR types and page-touch classification, safe for client components.

export type MergedPr = {
  number: number;
  title: string;
  mergedAt: string;
  author: string | null;
  labels: string[];
};

export type MergeDay = {
  date: string; // YYYY-MM-DD
  count: number;
  prs: MergedPr[];
};

export type PageTouch = {
  /** True when the PR changes what visitors see on one or more marketing pages. */
  touchesPage: boolean;
  /** Extracted route path (e.g. "/payroll") when one is named in the title. */
  route: string | null;
  /** Whether the call came from an explicit GitHub label or the heuristic. */
  source: "label" | "heuristic";
};

const TICKET_KEY_RE = /\b([A-Z]{3,7}-\d+)\b/;
const CHORE_RE = /^(chore|deps|ci|docs)(\(|:)/i;

export function ticketKey(title: string): string | null {
  return title.match(TICKET_KEY_RE)?.[1] ?? null;
}

export function isChore(pr: MergedPr): boolean {
  return CHORE_RE.test(pr.title) || pr.author === "vercel[bot]";
}

/*
 * Page-touch classification.
 *
 * "Touches a page" means the PR changes what a visitor sees on one or more
 * marketing pages (design, copy, layout, content, or a page build/migration).
 * Infrastructure — CI, deps, docs, tooling, admin, CMS plumbing, data
 * pipelines, instrumentation — does not.
 *
 * The heuristic is deliberately conservative and is only a fallback: an
 * explicit GitHub label always wins, so the team can keep the signal precise
 * going forward by labelling PRs `page` / `page:publish` (or `infra`).
 */
const BOT_AUTHORS = new Set([
  "app/dependabot",
  "app/vercel",
  "dependabot[bot]",
  "vercel[bot]",
]);

// Label conventions already in use in marketing-site-payload: `page`,
// `page:publish`, `paid-lp`, `paid-lp:publish`, `experiment`. A label matches
// when it equals a prefix or starts with `prefix:`.
const PAGE_LABEL_PREFIXES = ["page", "page-touch", "paid-lp", "experiment", "design", "copy"];
const INFRA_LABEL_PREFIXES = ["infra", "no-page", "chore", "tooling", "docs", "ci", "deps"];

function labelMatches(labels: string[], prefixes: string[]): boolean {
  return labels.some((label) =>
    prefixes.some((prefix) => label === prefix || label.startsWith(`${prefix}:`)),
  );
}

const NON_PAGE_PREFIX_RE = /^(chore|ci|docs|deps|build|test|release)(\(|:)/i;
const PRODUCT_PREFIX_RE = /^(feat|fix|refactor|style|perf|revert|content)\(([^)]+)\)/i;

// A route path: a leading slash preceded by a non-word character (or the
// start), followed by path segments — /payroll, /industry/retail-payroll.
// This avoids matching slashes inside words like "sharp/fast-uri" or
// "WebSite/Organization".
const ROUTE_RE = /(?:^|[^\w/])\/([a-z0-9][a-z0-9-]*(?:\/[a-z0-9][a-z0-9-]*)*)/i;

const PAGE_KEYWORD_RE =
  /\b(homepage|home page|landing page|landing-page|page family|page families|static page|as a page|off Webflow|rebuild|redesign|pages?|hero)\b|(?:^|\s)(?:port|migrate)\s+\//i;

const INFRA_KEYWORD_RE =
  /\b(workspace|tsconfig|seed|admin|pipeline|runner|redirect|sharp|libvips|blob|cdn|import map|prettier|eslint|storybook|lhci|lighthouse|pagespeed|revalidate|cors|csrf|cookies|lexical|json-ld|structured data|parity-tools|parity harness|parity diff|parity job|harness|diff|collection|schema|skill|tooling|design-system|dependabot|sitemap|robots|ci)\b/i;

// Conventional-commit scopes that are infrastructure rather than page work.
const INFRA_SCOPES = new Set([
  "ci",
  "deps",
  "docs",
  "lint",
  "tooling",
  "skills",
  "admin",
  "seo-tools",
  "parity-tools",
  "e2e",
  "analytics",
  "forms",
  "lead-forms",
  "assets",
  "seo",
  "data",
  "design-system",
  "shared",
  "a11y",
  "proxy",
  "redirects",
]);

export function extractRoute(title: string): string | null {
  const match = title.match(ROUTE_RE);
  return match ? `/${match[1].toLowerCase()}` : null;
}

export function classifyPageTouch(pr: MergedPr): PageTouch {
  // 1. Explicit GitHub labels are authoritative.
  const labels = pr.labels.map((label) => label.toLowerCase());
  if (labelMatches(labels, PAGE_LABEL_PREFIXES)) {
    return { touchesPage: true, route: extractRoute(pr.title), source: "label" };
  }
  if (labelMatches(labels, INFRA_LABEL_PREFIXES)) {
    return { touchesPage: false, route: null, source: "label" };
  }

  // 2. Bots never touch a page.
  if (pr.author && BOT_AUTHORS.has(pr.author)) {
    return { touchesPage: false, route: null, source: "heuristic" };
  }

  // 3. Housekeeping prefixes.
  if (NON_PAGE_PREFIX_RE.test(pr.title)) {
    return { touchesPage: false, route: null, source: "heuristic" };
  }

  // 4. A product prefix with an infrastructure scope (fix(deps), feat(seo),
  //    feat(design-system), …) is still infrastructure.
  const scopeMatch = pr.title.match(PRODUCT_PREFIX_RE);
  const scope = scopeMatch?.[2]?.toLowerCase() ?? null;
  if (scope && INFRA_SCOPES.has(scope)) {
    return { touchesPage: false, route: null, source: "heuristic" };
  }

  // 5. An explicit route in the title is the strongest page signal.
  const route = extractRoute(pr.title);
  if (route) {
    return { touchesPage: true, route, source: "heuristic" };
  }

  // 6. Clear infrastructure keywords.
  if (INFRA_KEYWORD_RE.test(pr.title)) {
    return { touchesPage: false, route: null, source: "heuristic" };
  }

  // 7. Clear page keywords.
  if (PAGE_KEYWORD_RE.test(pr.title)) {
    return { touchesPage: true, route: null, source: "heuristic" };
  }

  // 8. A product prefix with a non-infra scope (feat(home), fix(pricing), …).
  if (scope) {
    return { touchesPage: true, route: null, source: "heuristic" };
  }

  // 9. Default: not a page change.
  return { touchesPage: false, route: null, source: "heuristic" };
}

export function pageTouchCount(prs: MergedPr[]): number {
  return prs.reduce(
    (sum, pr) => sum + (classifyPageTouch(pr).touchesPage ? 1 : 0),
    0,
  );
}
