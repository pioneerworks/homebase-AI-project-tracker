import AppShell from "@/components/app-shell";
import { getProjectOverview } from "@/lib/linear-projects";
import { getSessionUser } from "@/lib/oidc-session";
import { trackerProject, TRACKER_PROJECTS } from "@/lib/tracker-projects";
import { redirect } from "next/navigation";
import Link from "next/link";

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return TRACKER_PROJECTS.map((p) => ({ key: p.key }));
}

function firstParagraph(body: string): string {
  const text = body
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#") && !l.startsWith("!") && !l.startsWith("<!--"))[0];
  return text ?? body.slice(0, 240);
}

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ key: string }>;
}) {
  const { key } = await params;
  const project = trackerProject(key);
  if (!project) redirect("/");

  const user = await getSessionUser();
  if (!user) redirect(`/login?callbackUrl=/projects/${key}`);

  let overview = null;
  let error: string | null = null;
  try {
    overview = await getProjectOverview(project.linearSlugId, project.key);
  } catch (e) {
    error = e instanceof Error ? e.message : "Unknown error fetching Linear data";
  }

  const purpose = overview?.description?.trim() || project.shortPurpose;
  const latest = overview?.updates[0];

  return (
    <AppShell user={user}>
      <div className="page">
        <header className="hero">
          <p className="hero-eyebrow">
            Active project ·{" "}
            <a href={project.linearUrl} target="_blank" rel="noreferrer">
              Open in Linear ↗
            </a>
          </p>
          <h1>{overview?.name ?? project.name}</h1>
          <p className="hero-copy">{purpose}</p>
        </header>

        {error && (
          <div className="warning-bar" role="alert">
            Could not load live Linear data: {error}
          </div>
        )}

        {overview && (
          <>
            <section className="metric-band" aria-label="Progress">
              <div className="metric">
                <span className="metric-label">Completion</span>
                <span className="metric-value">{overview.counts.completionPct}%</span>
                <span className="metric-delta">
                  {overview.counts.completed} of{" "}
                  {overview.counts.completed +
                    overview.counts.started +
                    overview.counts.unstarted +
                    overview.counts.backlog}{" "}
                  issues
                </span>
              </div>
              <div className="metric">
                <span className="metric-label">In progress</span>
                <span className="metric-value">{overview.counts.started}</span>
                <span className="metric-delta">{overview.counts.unstarted} queued · {overview.counts.backlog} backlog</span>
              </div>
              <div className="metric">
                <span className="metric-label">Linear status</span>
                <span className="metric-value metric-value-sm">
                  {overview.statusName ?? "—"}
                </span>
                <span className="metric-delta">
                  {overview.targetDate
                    ? `target ${new Date(overview.targetDate).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                    : "no target date"}
                </span>
              </div>
              <div className="metric">
                <span className="metric-label">Latest update</span>
                <span className="metric-value metric-value-sm">
                  {latest?.health ?? "—"}
                </span>
                <span className="metric-delta">
                  {latest
                    ? new Date(latest.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })
                    : "no project updates"}
                </span>
              </div>
            </section>

            {latest && (
              <section className="section" aria-label="Latest Linear update">
                <div className="section-head">
                  <h2>Latest update</h2>
                  {latest.url && (
                    <a href={latest.url} target="_blank" rel="noreferrer">
                      View in Linear ↗
                    </a>
                  )}
                </div>
                <div className="recap-card">
                  <p className="recap-paragraph">{firstParagraph(latest.body)}</p>
                </div>
              </section>
            )}

            <section className="section" aria-label="Recently completed">
              <div className="section-head">
                <h2>Recently completed</h2>
              </div>
              <ul className="issue-list">
                {overview.recentCompletions.map((rc) => (
                  <li key={rc.title} className="issue-row">
                    <span className="issue-row-title">{rc.title}</span>
                    <span className="issue-row-meta">
                      {rc.completedAt
                        ? new Date(rc.completedAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                          })
                        : ""}
                    </span>
                  </li>
                ))}
                {overview.recentCompletions.length === 0 && (
                  <li className="issue-row">
                    <span className="issue-row-meta">No completions in the loaded window.</span>
                  </li>
                )}
              </ul>
            </section>
          </>
        )}

        <section className="section" aria-label="Repositories">
          <div className="section-head">
            <h2>Repos watched for impact</h2>
          </div>
          <ul className="issue-list">
            {project.repos.map((repo) => (
              <li key={repo} className="issue-row">
                <span className="issue-row-title">
                  <code>pioneerworks/{repo}</code>
                </span>
                <span className="issue-row-meta">PR merges feed the impact chart</span>
              </li>
            ))}
          </ul>
          <p className="section-note">
            See the <Link href="/">impact overview</Link> for merged-PR vs signup
            trends.
          </p>
        </section>
      </div>
    </AppShell>
  );
}
