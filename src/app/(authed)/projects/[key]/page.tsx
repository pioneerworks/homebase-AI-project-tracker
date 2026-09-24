import { getProjectOverview, type ProjectHealth } from "@/lib/linear-projects";
import { getSessionUser } from "@/lib/oidc-session";
import { torontoToday } from "@/lib/standup";
import { trackerProject, TRACKER_PROJECTS } from "@/lib/tracker-projects";
import { redirect } from "next/navigation";
import Link from "next/link";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

export async function generateStaticParams() {
  return TRACKER_PROJECTS.map((p) => ({ key: p.key }));
}

/** Render **bold** spans and `code` spans inside plain text. */
function renderEmphasis(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|`([^`]+)`/g;
  let last = 0;
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1] !== undefined) {
      nodes.push(<strong key={`${keyPrefix}-b${index}`}>{match[1]}</strong>);
    } else {
      nodes.push(<code key={`${keyPrefix}-c${index}`}>{match[2]}</code>);
    }
    last = match.index + match[0].length;
    index++;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

/** Render [label](url) links plus bold/code spans inside plain text. */
function renderInline(text: string, keyPrefix: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const linkPattern = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  let index = 0;
  let match: RegExpExecArray | null;
  while ((match = linkPattern.exec(text))) {
    if (match.index > last) {
      nodes.push(...renderEmphasis(text.slice(last, match.index), `${keyPrefix}-t${index}`));
    }
    nodes.push(
      <a key={`${keyPrefix}-l${index}`} href={match[2]} target="_blank" rel="noreferrer">
        {match[1].replace(/\*\*/g, "")}
      </a>,
    );
    last = match.index + match[0].length;
    index++;
  }
  if (last < text.length) {
    nodes.push(...renderEmphasis(text.slice(last), `${keyPrefix}-t${index}`));
  }
  return nodes;
}

/**
 * Render the full project-update body: headings, bullet lists, and
 * paragraphs with links, bold, and inline code. Images and comments are
 * dropped; everything else Linear puts in the body is shown.
 */
function UpdateBody({ body }: { body: string }) {
  const blocks: ReactNode[] = [];
  let bullets: ReactNode[] = [];
  let blockIndex = 0;

  const flushBullets = () => {
    if (bullets.length) {
      blocks.push(<ul key={`ul-${blockIndex++}`}>{bullets}</ul>);
      bullets = [];
    }
  };

  body.split("\n").forEach((rawLine, lineIndex) => {
    const line = rawLine.trim();
    if (!line || line.startsWith("<!--")) {
      flushBullets();
      return;
    }
    if (line.startsWith("![")) return; // images: Linear attachment URLs are auth-gated
    const key = `b${blockIndex}-l${lineIndex}`;
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      flushBullets();
      blocks.push(<h3 key={key}>{renderInline(heading[2], key)}</h3>);
      return;
    }
    const bullet = line.match(/^(?:[-*]|\d+[.)])\s+(.+)$/);
    if (bullet) {
      bullets.push(<li key={key}>{renderInline(bullet[1], key)}</li>);
      return;
    }
    flushBullets();
    blocks.push(<p key={key}>{renderInline(line, key)}</p>);
  });
  flushBullets();

  return <div className="update-body">{blocks}</div>;
}

/** Date-only Linear values (YYYY-MM-DD) are UTC midnight; format them in UTC. */
function formatDate(value: string, withYear = false): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  return new Date(dateOnly ? `${value}T00:00:00Z` : value).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
    ...(dateOnly ? { timeZone: "UTC" } : { timeZone: "America/Toronto" }),
  });
}

function isOverdue(targetDate: string | null, progress: number): boolean {
  return Boolean(targetDate && progress < 100 && targetDate < torontoToday());
}

const HEALTH_LABEL: Record<ProjectHealth, string> = {
  onTrack: "On track",
  atRisk: "At risk",
  offTrack: "Off track",
};

function HealthPill({ health }: { health: ProjectHealth | null }) {
  if (!health) return <span className="health-pill health-none">Not set</span>;
  return <span className={`health-pill health-${health}`}>{HEALTH_LABEL[health]}</span>;
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
  // No project update posted yet: fall back to the brief its creators wrote.
  const brief = overview?.content ?? overview?.description?.trim() ?? null;

  return (
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
              <span className="metric-label">Owner</span>
              <span className="metric-value metric-value-sm">
                {overview.lead ?? "No lead set"}
              </span>
              <span className="metric-delta">
                {overview.statusName ?? "—"} ·{" "}
                {overview.targetDate
                  ? `target ${formatDate(overview.targetDate, true)}`
                  : "no target date"}
              </span>
            </div>
            <div className="metric">
              <span className="metric-label">Health</span>
              <span className="metric-value metric-value-sm">
                <HealthPill health={overview.health} />
              </span>
              <span className="metric-delta">
                {latest
                  ? `last update ${formatDate(latest.createdAt)}`
                  : "no project updates"}
              </span>
            </div>
          </section>

          <section className="section" aria-label="Milestones">
            <div className="section-head">
              <h2>Milestones</h2>
            </div>
            {overview.milestones.length === 0 ? (
              <p className="empty-message">
                No milestones set in Linear yet. Add them on the project so
                progress and due dates show here.
              </p>
            ) : (
              <ol className="milestone-list">
                {overview.milestones.map((m) => (
                  <li
                    key={m.id}
                    className={`milestone${m.progress >= 100 ? " milestone-done" : ""}${
                      isOverdue(m.targetDate, m.progress) ? " milestone-overdue" : ""
                    }`}
                  >
                    <div className="milestone-head">
                      <strong>{m.name}</strong>
                      <span className="milestone-meta">
                        {m.targetDate ? `due ${formatDate(m.targetDate)}` : "no due date"}
                        {isOverdue(m.targetDate, m.progress) && " · overdue"} · {m.progress}%
                      </span>
                    </div>
                    <div
                      className="milestone-bar"
                      role="progressbar"
                      aria-valuenow={m.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${m.name} progress`}
                    >
                      <span style={{ width: `${m.progress}%` }} />
                    </div>
                    {m.description && <p className="milestone-description">{m.description}</p>}
                    {m.issues.length > 0 && (
                      <ul className="milestone-issues">
                        {m.issues.map((issue) => (
                          <li key={issue.identifier}>
                            <a href={issue.url} target="_blank" rel="noreferrer">
                              <span className="milestone-issue-id">{issue.identifier}</span>{" "}
                              {issue.title}
                            </a>
                            <span className="milestone-issue-meta">
                              {issue.stateName}
                              {issue.assignee ? ` · ${issue.assignee}` : " · unassigned"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>

          {!latest && brief && (
            <section className="section" aria-label="Project brief">
              <div className="section-head">
                <h2>Project brief</h2>
                <a href={project.linearUrl} target="_blank" rel="noreferrer">
                  View in Linear ↗
                </a>
              </div>
              <div className="recap-card">
                <p className="brief-note">
                  No project update posted yet, so this is the brief from Linear.
                </p>
                <UpdateBody body={brief} />
              </div>
            </section>
          )}

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
                <UpdateBody body={latest.body} />
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
  );
}
