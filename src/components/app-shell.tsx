"use client";

import { LayoutDashboard, LogOut, Menu, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, use, useState } from "react";

import type { ProjectStateKey } from "@/lib/overview";
import { initials, STATE_LABELS } from "@/lib/overview";
import { DONE_PROJECTS, TRACKER_PROJECTS } from "@/lib/tracker-projects";

type Props = {
  user: { name: string; email: string } | null;
  /** Project key → display state, for the sidebar dots. */
  projectStates: Promise<Record<string, ProjectStateKey>>;
};

function StateDot({
  projectKey,
  states,
}: {
  projectKey: string;
  states: Promise<Record<string, ProjectStateKey>>;
}) {
  const key = use(states)[projectKey] ?? "none";
  return (
    <>
      <span className={`state-dot state-dot-${key}`} aria-hidden="true" title={STATE_LABELS[key]} />
      <span className="sr-only">{STATE_LABELS[key]}: </span>
    </>
  );
}

export default function AppShell({
  user,
  projectStates,
  children,
}: Props & { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  return (
    <div className="shell-layout">
      <button
        className="sidebar-toggle"
        aria-label="Toggle navigation"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Menu size={18} aria-hidden="true" />
      </button>
      <aside className={`sidebar${open ? " sidebar-open" : ""}`}>
        <div className="sidebar-top">
          <Link href="/" className="sidebar-brand" onClick={() => setOpen(false)}>
            <span className="sidebar-brand-mark">
              <Sparkles size={20} aria-hidden="true" />
            </span>
            AI Hub
          </Link>

          <nav className="sidebar-top" aria-label="Primary">
            <div className="sidebar-nav">
              <Link
                href="/"
                className="sidebar-nav-item"
                aria-current={pathname === "/" ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <LayoutDashboard size={18} aria-hidden="true" />
                Overview
              </Link>
            </div>

            <div className="sidebar-shortcuts" role="group" aria-labelledby="sidebar-active-label">
              <p className="sidebar-heading" id="sidebar-active-label">
                Active projects
              </p>
              {TRACKER_PROJECTS.map((p) => (
                <Link
                  key={p.key}
                  href={`/projects/${p.key}`}
                  className="sidebar-shortcut"
                  aria-current={isActive(`/projects/${p.key}`) ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <Suspense
                    fallback={<span className="state-dot state-dot-none" aria-hidden="true" />}
                  >
                    <StateDot projectKey={p.key} states={projectStates} />
                  </Suspense>
                  {p.shortName}
                </Link>
              ))}
            </div>

            <div className="sidebar-shortcuts" role="group" aria-labelledby="sidebar-done-label">
              <p className="sidebar-heading" id="sidebar-done-label">
                Done
              </p>
              {DONE_PROJECTS.map((p) => (
                <Link
                  key={p.key}
                  href={p.href}
                  className="sidebar-shortcut"
                  aria-current={isActive(p.href) ? "page" : undefined}
                  onClick={() => setOpen(false)}
                >
                  <span className="state-dot state-dot-done" aria-hidden="true" />
                  <span className="sr-only">Done: </span>
                  {p.shortName}
                </Link>
              ))}
            </div>
          </nav>
        </div>

        {user ? (
          <div className="sidebar-user">
            <span className="sidebar-avatar" aria-hidden="true">
              {initials(user.name)}
            </span>
            <span className="sidebar-user-text">
              <span className="sidebar-user-name">{user.name}</span>
              <span className="sidebar-user-team">AI team</span>
            </span>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="sidebar-signout"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={16} aria-hidden="true" />
              </button>
            </form>
          </div>
        ) : null}
      </aside>

      <main className="shell-content">{children}</main>
    </div>
  );
}
