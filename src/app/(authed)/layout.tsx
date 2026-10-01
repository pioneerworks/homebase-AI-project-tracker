import AppShell from "@/components/app-shell";
import { getSessionUser } from "@/lib/oidc-session";
import { healthState, projectIdentity } from "@/lib/overview";
import type { SidebarProjects } from "@/components/app-shell";
import { getDoneOverviews, getTrackerOverviews } from "@/lib/tracker-overviews";
import { DONE_PROJECTS, TRACKER_PROJECTS } from "@/lib/tracker-projects";
import type { ReactNode } from "react";

/**
 * Shared shell for signed-in pages. AppShell lives here (not inside each
 * page) so the sidebar stays mounted across client navigations and the
 * route's loading.tsx skeleton renders inside <main class="shell-content">
 * instead of unmounting the sidebar. Unauthenticated requests fall through
 * bare: each page still runs its own session check and redirects to /login
 * with its own callback URL.
 *
 * Dots show the health the lead set in Linear (an overdue milestone shows
 * in the Overview table, not here). Names and dots come from Linear and stream in:
 * the promise is handed to the client unresolved so Linear latency never
 * blocks the shell.
 */
export default async function AuthedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) return children;
  const projects: Promise<SidebarProjects> = Promise.all([
    getTrackerOverviews(),
    getDoneOverviews(),
  ])
    .then(([active, done]) => {
      return Object.fromEntries([
        ...TRACKER_PROJECTS.map((p, i) => [
          p.key,
          { name: projectIdentity(p.key, active[i]).name, state: healthState(active[i]) },
        ]),
        ...DONE_PROJECTS.map((p, i) => [
          p.key,
          { name: projectIdentity(p.key, done[i]).name, state: "done" },
        ]),
      ]) as SidebarProjects;
    })
    .catch((error) => {
      // labels fall back to keys and dots to grey rather than taking down the shell
      console.log("[sidebar] Linear projects failed:", error instanceof Error ? error.message : error);
      return {} as SidebarProjects;
    });
  return (
    <AppShell user={user} projects={projects}>
      {children}
    </AppShell>
  );
}
