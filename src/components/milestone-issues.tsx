"use client";

import { useState } from "react";

import type { MilestoneIssue } from "@/lib/linear-projects";

const VISIBLE = 5;

export default function MilestoneIssues({ issues }: { issues: MilestoneIssue[] }) {
  const [expanded, setExpanded] = useState(false);
  if (issues.length === 0) return null;
  const shown = expanded ? issues : issues.slice(0, VISIBLE);
  const hidden = issues.length - VISIBLE;

  return (
    <>
      <ul className="milestone-issues">
        {shown.map((issue) => (
          <li key={issue.identifier}>
            <a href={issue.url} target="_blank" rel="noreferrer">
              <span className="milestone-issue-id">{issue.identifier}</span> {issue.title}
            </a>
            <span className="milestone-issue-meta">
              {issue.stateName}
              {issue.assignee ? ` · ${issue.assignee}` : " · unassigned"}
            </span>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          className="milestone-more"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : `View ${hidden} more`}
        </button>
      )}
    </>
  );
}
