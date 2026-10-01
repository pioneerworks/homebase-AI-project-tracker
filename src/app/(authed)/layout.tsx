import AppShell from "@/components/app-shell";
import { getSessionUser } from "@/lib/oidc-session";
import type { SidebarProjects } from "@/components/app-shell";
import { getProjectOverview } from "@/lib/linear-projects";
import { sidebarProject, type SidebarProject } from "@/lib/overview";
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
 * Sidebar names and dots come from Linear and stream in per link: each
 * promise is handed to the client unresolved so Linear latency never blocks
 * the shell. Dots show the health the lead set in Linear (an overdue
 * milestone shows in the Overview table, not here).
 */
function sidebarEntry(
  p: { key: string; linearSlugId: string },
  done: boolean,
): Promise<SidebarProject> {
  // getProjectOverview shares the hourly cache and in-flight fetch with the page
  return getProjectOverview(p.linearSlugId, p.key)
    .catch((error) => {
      console.log(
        `[sidebar] Linear fetch failed for ${p.key}:`,
        error instanceof Error ? error.message : error,
      );
      return null;
    })
    .then((overview) => sidebarProject(p.key, overview, done));
}

export default async function AuthedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) return children;
  // one promise per link, so a slow project never holds back the others
  const projects: SidebarProjects = Object.fromEntries([
    ...TRACKER_PROJECTS.map((p) => [p.key, sidebarEntry(p, false)]),
    ...DONE_PROJECTS.map((p) => [p.key, sidebarEntry(p, true)]),
  ]);
  return (
    <AppShell user={user} projects={projects}>
      {children}
    </AppShell>
  );
}
