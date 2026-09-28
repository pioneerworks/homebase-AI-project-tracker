"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useState } from "react";

import { ATTENTION_STATES, initials, type ProjectState } from "@/lib/overview";

export type ProjectRow = {
  key: string;
  href: string;
  name: string;
  description: string;
  owner: string | null;
  state: ProjectState;
  /** False when Linear data failed to load for this project. */
  available: boolean;
  milestone: {
    name: string;
    progress: number;
    due: string | null;
    completedOn?: string;
  } | null;
  issuesDonePct: number | null;
};

type Filter = "all" | "attention" | "onTrack" | "done";

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "attention", label: "Needs attention" },
  { key: "onTrack", label: "On track" },
  { key: "done", label: "Done" },
];

function matches(filter: Filter, row: ProjectRow): boolean {
  if (filter === "all") return true;
  if (filter === "attention") return ATTENTION_STATES.has(row.state.key);
  return row.state.key === filter;
}

const shortDay = (iso: string, weekday = true) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    ...(weekday ? { weekday: "short" as const } : {}),
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

function barClass(row: ProjectRow): string {
  switch (row.state.key) {
    case "done":
      return "bar-done";
    case "overdue":
    case "offTrack":
      return "bar-danger";
    case "atRisk":
      return "bar-warning";
    default:
      return "bar-success";
  }
}

export default function ProjectTable({ rows }: { rows: ProjectRow[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const router = useRouter();
  const visible = rows.filter((row) => matches(filter, row));
  const active = rows.filter((r) => r.state.key !== "done").length;
  const done = rows.length - active;

  return (
    <section className="projects" aria-labelledby="projects-title">
      <div className="projects-head">
        <div className="projects-title">
          <h2 className="h2" id="projects-title">
            Projects
          </h2>
          <span className="count-badge">
            {active} active · {done} done
          </span>
        </div>
        <div className="chip-filters" role="group" aria-label="Filter projects">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>
      <div className="card table-wrap">
        <table className="project-table">
          <colgroup>
            <col />
            <col style={{ width: 176 }} />
            <col style={{ width: 132 }} />
            <col style={{ width: 256 }} />
            <col style={{ width: 128 }} />
            <col style={{ width: 96 }} />
          </colgroup>
          <thead>
            <tr>
              <th scope="col">Project</th>
              <th scope="col">Owner</th>
              <th scope="col">Health</th>
              <th scope="col">Next milestone</th>
              <th scope="col">Due</th>
              <th scope="col">Issues</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="table-empty">
                  No projects match this filter.
                </td>
              </tr>
            )}
            {visible.map((row) => {
              const m = row.milestone;
              const late = row.state.key === "overdue";
              const isDone = row.state.key === "done";
              return (
                <tr
                  key={row.key}
                  className={isDone ? "is-done" : undefined}
                  onClick={(event) => {
                    // let real links (and modified clicks) behave normally
                    if ((event.target as HTMLElement).closest("a")) return;
                    router.push(row.href);
                  }}
                >
                  <td>
                    <Link className="p-name" href={row.href}>
                      {row.name}
                    </Link>
                    <div className="p-desc">{row.description}</div>
                  </td>
                  <td>
                    {row.owner ? (
                      <span className="owner">
                        <span className="avatar avatar-sm" aria-hidden="true">
                          {initials(row.owner)}
                        </span>
                        {row.owner}
                      </span>
                    ) : (
                      <span className="is-empty">{row.available ? "No lead" : "—"}</span>
                    )}
                  </td>
                  <td>
                    {row.available ? (
                      <span className={`pill pill-${row.state.key}`}>
                        <span className="pill-dot" aria-hidden="true" />
                        {row.state.label}
                      </span>
                    ) : (
                      <span className="is-empty">Linear unavailable</span>
                    )}
                  </td>
                  <td>
                    {m ? (
                      <>
                        <div className="ms-top">
                          <span>{m.name}</span>
                          <b className={late ? "is-late" : undefined}>{m.progress}%</b>
                        </div>
                        <div
                          className="track"
                          role="progressbar"
                          aria-valuenow={m.progress}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-label={`${m.name} progress`}
                        >
                          <span className={barClass(row)} style={{ width: `${m.progress}%` }} />
                        </div>
                      </>
                    ) : (
                      <span className="is-empty">
                        {row.available ? "No milestones set in Linear" : "—"}
                      </span>
                    )}
                  </td>
                  <td>
                    <div
                      className={`due${late ? " is-late" : m?.due || m?.completedOn ? "" : " is-empty"}`}
                    >
                      {m?.completedOn
                        ? `Shipped ${shortDay(m.completedOn, false)}`
                        : m?.due
                          ? shortDay(m.due)
                          : "No due date"}
                    </div>
                    {late && (
                      <div className="due-late">
                        {row.state.lateDays} day{row.state.lateDays === 1 ? "" : "s"} overdue
                      </div>
                    )}
                  </td>
                  <td>
                    {row.issuesDonePct != null ? (
                      <span className="issues">
                        <span
                          className={`ring${isDone ? " ring-done" : ""}`}
                          style={{ "--pct": row.issuesDonePct } as React.CSSProperties}
                          aria-hidden="true"
                        />
                        {row.issuesDonePct}%
                      </span>
                    ) : (
                      <span className="is-empty">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
