import AppShell from "@/components/app-shell";
import { getSessionUser } from "@/lib/oidc-session";
import { projectState, type ProjectStateKey } from "@/lib/overview";
import { torontoToday } from "@/lib/standup";
import { getTrackerOverviews } from "@/lib/tracker-overviews";
import { TRACKER_PROJECTS } from "@/lib/tracker-projects";
import type { ReactNode } from "react";

/**
 * Shared shell for signed-in pages. AppShell lives here (not inside each
 * page) so the sidebar stays mounted across client navigations and the
 * route's loading.tsx skeleton renders inside <main class="shell-content">
 * instead of unmounting the sidebar. Unauthenticated requests fall through
 * bare: each page still runs its own session check and redirects to /login
 * with its own callback URL.
 *
 * The sidebar's project-state dots stream in: the promise is handed to the
 * client unresolved so Linear latency never blocks the shell.
 */
export default async function AuthedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) return children;
  const projectStates = getTrackerOverviews().then((overviews) => {
    const today = torontoToday();
    return Object.fromEntries(
      TRACKER_PROJECTS.map((p, i) => [p.key, projectState(overviews[i], today).key]),
    ) as Record<string, ProjectStateKey>;
  }).catch((error) => {
    // dots fall back to grey rather than taking down the shell
    console.log("[sidebar] project states failed:", error instanceof Error ? error.message : error);
    return {} as Record<string, ProjectStateKey>;
  });
  return (
    <AppShell user={user} projectStates={projectStates}>
      {children}
    </AppShell>
  );
}
