"use client";

import { FlaskConical, LayoutDashboard, LogOut, Menu, Sparkles } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, use, useEffect, useState } from "react";

import { ExperimentsSidebar } from "@/components/experiments/experiments-sidebar";
import type { SidebarProject } from "@/lib/overview";
import { initials, STATE_LABELS } from "@/lib/overview";
import type { ExperimentsNav } from "@/lib/experiments-types";
import { DONE_PROJECTS, TRACKER_PROJECTS } from "@/lib/tracker-projects";

/** Project key → its sidebar entry, each resolving on its own. */
export type SidebarProjects = Record<string, Promise<SidebarProject>>;

type Props = {
  user: { name: string; email: string } | null;
  projects: SidebarProjects;
  experimentsNav: Promise<ExperimentsNav | null>;
};

function ProjectLabel({
  projectKey,
  project: pending,
}: {
  projectKey: string;
  project: Promise<SidebarProject> | undefined;
}) {
  const project = pending ? use(pending) : null;
  const state = project?.state ?? "none";
  const label =
    state === "done"
      ? project?.available
        ? STATE_LABELS.done
        : `${STATE_LABELS.done} (Linear unavailable)`
      : project?.available
        ? `Linear health: ${STATE_LABELS[state]}`
        : "Linear unavailable";
  return (
    <>
      <span className={`state-dot state-dot-${state}`} aria-hidden="true" title={label} />
      <span className="sr-only">{label}: </span>
      {project?.name ?? projectKey}
    </>
  );
}

function ProjectLabelFallback({ projectKey }: { projectKey: string }) {
  return (
    <>
      <span className="state-dot state-dot-none" aria-hidden="true" />
      <span className="skeleton-line" aria-hidden="true" />
      <span className="sr-only">{projectKey} (loading)</span>
    </>
  );
}

/** The user/profile block at the bottom of either sidebar (hub or Experiments). */
export function SidebarUser({ user }: { user: { name: string; email: string } | null }) {
  if (!user) return null;
  return (
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
  );
}

export default function AppShell({
  user,
  projects,
  experimentsNav,
  children,
}: Props & { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isActive = (href: string) =>
    pathname === href || (href !== "/" && pathname.startsWith(href));

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="shell-layout">
      <button
        className="sidebar-toggle"
        aria-label="Toggle navigation"
        aria-expanded={open}
        aria-controls="app-sidebar"
        onClick={() => setOpen((v) => !v)}
      >
        <Menu size={18} aria-hidden="true" />
      </button>
      {open && (
        <div className="sidebar-backdrop" aria-hidden="true" onClick={() => setOpen(false)} />
      )}
      <aside id="app-sidebar" className={`sidebar${open ? " sidebar-open" : ""}`}>
        {pathname.startsWith("/experiments") ? (
          <ExperimentsSidebar
            nav={experimentsNav}
            user={user}
            onNavigate={() => setOpen(false)}
          />
        ) : (
          <>
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
              <Link
                href="/experiments"
                className="sidebar-nav-item"
                aria-current={pathname.startsWith("/experiments") ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                <FlaskConical size={18} aria-hidden="true" />
                A/B testing
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
                  <Suspense fallback={<ProjectLabelFallback projectKey={p.key} />}>
                    <ProjectLabel projectKey={p.key} project={projects[p.key]} />
                  </Suspense>
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
                  <Suspense fallback={<ProjectLabelFallback projectKey={p.key} />}>
                    <ProjectLabel projectKey={p.key} project={projects[p.key]} />
                  </Suspense>
                </Link>
              ))}
            </div>
            </nav>
            </div>

            <SidebarUser user={user} />
          </>
        )}
      </aside>

      <main className="shell-content">{children}</main>
    </div>
  );
}
