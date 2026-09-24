const LINEAR_API = "https://api.linear.app/graphql";

const CACHE_TTL = 3600;

/**
 * Production origin of this dashboard. Local dev without a LINEAR_API_KEY
 * relays Linear fetches through the deployed app (which has the key).
 * The gate must permit access on that deployment for the relay to work.
 */
const RELAY_ORIGIN =
  process.env.DASHBOARD_RELAY_ORIGIN ?? "https://homebase-ai-project-tracker.vercel.app";

export type ProjectHealth = "onTrack" | "atRisk" | "offTrack";

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

export type ProjectOverview = {
  id: string;
  name: string;
  slugId: string;
  /** Linear's one-line project summary */
  description: string | null;
  /** Full project brief (the project overview document, markdown) */
  content: string | null;
  iconUrl: string | null;
  color: string | null;
  statusName: string | null;
  lead: string | null;
  health: ProjectHealth | null;
  targetDate: string | null;
  startedAt: string | null;
  counts: {
    total: number;
    completed: number;
    started: number;
    unstarted: number;
    canceled: number;
    backlog: number;
    completionPct: number;
  };
  milestones: ProjectMilestoneSummary[];
  recentCompletions: { title: string; completedAt: string | null }[];
  updates: { body: string; health: string | null; createdAt: string; url: string | null }[];
};

type IssueNode = {
  identifier: string;
  title: string;
  url: string;
  completedAt: string | null;
  canceledAt: string | null;
  state: { name: string; type: string } | null;
  assignee: { name: string } | null;
  projectMilestone: { id: string } | null;
};

type ProjectNode = {
  id: string;
  name: string;
  slugId: string;
  description: string | null;
  content: string | null;
  icon: string | null;
  color: string | null;
  status: { name: string } | null;
  lead: { name: string } | null;
  health: string | null;
  targetDate: string | null;
  startedAt: string | null;
  projectMilestones: {
    nodes: {
      id: string;
      name: string;
      description: string | null;
      targetDate: string | null;
      progress: number | null;
      sortOrder: number;
    }[];
  };
  issues: { nodes: IssueNode[] };
  projectUpdates: {
    nodes: { body: string; health: string | null; createdAt: string; url: string | null }[];
  };
};

const query = `
query ProjectOverview($id: String!) {
  project(id: $id) {
    id
    name
    slugId
    description
    content
    icon
    color
    status { name }
    lead { name }
    health
    targetDate
    startedAt
    projectMilestones(first: 25) {
      nodes {
        id
        name
        description
        targetDate
        progress
        sortOrder
      }
    }
    issues(first: 250) {
      nodes {
        identifier
        title
        url
        completedAt
        canceledAt
        state { name type }
        assignee { name }
        projectMilestone { id }
      }
    }
    projectUpdates(first: 5) {
      nodes {
        body
        health
        createdAt
        url
      }
    }
  }
}
`;

async function fetchRelayOverview(key: string): Promise<ProjectOverview> {
  const response = await fetch(`${RELAY_ORIGIN}/api/projects/${key}`, {
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(
      `Relay fetch failed (${response.status}) from ${RELAY_ORIGIN}/api/projects/${key}`,
    );
  }
  // An older deployment may not return the newer fields yet.
  const overview = (await response.json()) as Partial<ProjectOverview> & ProjectOverview;
  return {
    ...overview,
    content: overview.content ?? null,
    lead: overview.lead ?? null,
    health: overview.health ?? null,
    milestones: overview.milestones ?? [],
  };
}

function toHealth(value: string | null | undefined): ProjectHealth | null {
  return value === "onTrack" || value === "atRisk" || value === "offTrack" ? value : null;
}

const STATE_ORDER: Record<string, number> = {
  started: 0,
  unstarted: 1,
  backlog: 2,
  triage: 2,
  completed: 3,
  canceled: 4,
};

/** Pure mapping from the Linear project node (exported for tests). */
export function toProjectOverview(project: ProjectNode): ProjectOverview {
  const issues = project.issues.nodes;
  let completed = 0;
  let started = 0;
  let unstarted = 0;
  let canceled = 0;
  let backlog = 0;
  for (const issue of issues) {
    switch (issue.state?.type) {
      case "completed":
        completed++;
        break;
      case "started":
        started++;
        break;
      case "canceled":
        canceled++;
        break;
      case "backlog":
        backlog++;
        break;
      default:
        unstarted++;
    }
  }
  const open = started + unstarted + backlog;
  const completionPct = completed + open > 0 ? Math.round((completed / (completed + open)) * 100) : 0;

  const recentCompletions = issues
    .filter((i) => i.completedAt)
    .sort((a, b) => (a.completedAt! < b.completedAt! ? 1 : -1))
    .slice(0, 8)
    .map((i) => ({ title: i.title, completedAt: i.completedAt }));

  const milestones = [...project.projectMilestones.nodes]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description?.trim() || null,
      targetDate: m.targetDate,
      progress: Math.round(m.progress ?? 0),
      issues: issues
        .filter((i) => i.projectMilestone?.id === m.id)
        .sort(
          (a, b) =>
            (STATE_ORDER[a.state?.type ?? ""] ?? 2) - (STATE_ORDER[b.state?.type ?? ""] ?? 2),
        )
        .map((i) => ({
          identifier: i.identifier,
          title: i.title,
          url: i.url,
          stateName: i.state?.name ?? "Unknown",
          stateType: i.state?.type ?? "unstarted",
          assignee: i.assignee?.name ?? null,
        })),
    }));

  return {
    id: project.id,
    name: project.name,
    slugId: project.slugId,
    description: project.description,
    content: project.content?.trim() || null,
    iconUrl: project.icon,
    color: project.color,
    statusName: project.status?.name ?? null,
    lead: project.lead?.name ?? null,
    health: toHealth(project.health),
    targetDate: project.targetDate,
    startedAt: project.startedAt,
    counts: {
      total: issues.length,
      completed,
      started,
      unstarted,
      canceled,
      backlog,
      completionPct,
    },
    milestones,
    recentCompletions,
    updates: project.projectUpdates.nodes,
  };
}

/**
 * The next milestone still in flight: the earliest-dated one below 100%,
 * falling back to the first undated open milestone.
 */
export function nextMilestone(
  milestones: ProjectMilestoneSummary[],
): ProjectMilestoneSummary | null {
  const open = milestones.filter((m) => m.progress < 100);
  const dated = open
    .filter((m) => m.targetDate)
    .sort((a, b) => a.targetDate!.localeCompare(b.targetDate!));
  return dated[0] ?? open[0] ?? null;
}

export async function getProjectOverview(slugId: string, key?: string): Promise<ProjectOverview> {
  const apiKey = process.env.LINEAR_API_KEY;
  if (!apiKey || apiKey.includes("SENSITIVE")) {
    if (!key) throw new Error("LINEAR_API_KEY is not set");
    return fetchRelayOverview(key);
  }

  const response = await fetch(
    LINEAR_API,
    {
      method: "POST",
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables: { id: slugId } }),
      next: { revalidate: CACHE_TTL, tags: [`linear-project-${slugId}`] },
    },
  );

  if (!response.ok) {
    throw new Error(`Linear API error: ${response.status}`);
  }

  const body = (await response.json()) as {
    data?: { project?: ProjectNode | null };
    errors?: { message: string }[];
  };
  if (body.errors?.length) {
    throw new Error(`Linear GraphQL error: ${body.errors[0].message}`);
  }
  const project = body.data?.project;
  if (!project) throw new Error(`Linear project not found: ${slugId}`);

  return toProjectOverview(project);
}
