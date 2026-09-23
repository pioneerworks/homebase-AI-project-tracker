const LINEAR_API = "https://api.linear.app/graphql";

const CACHE_TTL = 3600;

/**
 * Production origin of this dashboard. Local dev without a LINEAR_API_KEY
 * relays Linear fetches through the deployed app (which has the key).
 * The gate must permit access on that deployment for the relay to work.
 */
const RELAY_ORIGIN =
  process.env.DASHBOARD_RELAY_ORIGIN ?? "https://homebase-ai-project-tracker.vercel.app";

export type ProjectOverview = {
  id: string;
  name: string;
  slugId: string;
  description: string | null;
  iconUrl: string | null;
  color: string | null;
  statusName: string | null;
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
  recentCompletions: { title: string; completedAt: string | null }[];
  updates: { body: string; health: string | null; createdAt: string; url: string | null }[];
};

type ProjectNode = {
  id: string;
  name: string;
  slugId: string;
  description: string | null;
  icon: string | null;
  color: string | null;
  status: { name: string } | null;
  targetDate: string | null;
  startedAt: string | null;
  issues: {
    nodes: {
      title: string;
      completedAt: string | null;
      canceledAt: string | null;
      state: { name: string; type: string } | null;
    }[];
  };
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
    icon
    color
    status { name }
    targetDate
    startedAt
    issues(first: 250) {
      nodes {
        title
        completedAt
        canceledAt
        state { name type }
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
  return (await response.json()) as ProjectOverview;
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

  return {
    id: project.id,
    name: project.name,
    slugId: project.slugId,
    description: project.description,
    iconUrl: project.icon,
    color: project.color,
    statusName: project.status?.name ?? null,
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
    recentCompletions,
    updates: project.projectUpdates.nodes,
  };
}
