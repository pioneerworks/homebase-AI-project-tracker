import AppShell from "@/components/app-shell";
import { getSessionUser } from "@/lib/oidc-session";
import type { ReactNode } from "react";

/**
 * Shared shell for signed-in pages. AppShell lives here (not inside each
 * page) so the sidebar stays mounted across client navigations and the
 * route's loading.tsx skeleton renders inside <main class="shell-content">
 * instead of unmounting the sidebar. Unauthenticated requests fall through
 * bare: each page still runs its own session check and redirects to /login
 * with its own callback URL.
 */
export default async function AuthedLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getSessionUser();
  if (!user) return children;
  return <AppShell user={user}>{children}</AppShell>;
}
