import ExperimentsView from "@/components/experiments/experiments-view";
import { loadExperimentsPage } from "@/lib/experiments";
import { getSessionUser } from "@/lib/oidc-session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
// Statsig page load fans out to many console calls; this is the backstop.
export const maxDuration = 30;

export default async function ExperimentsPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?callbackUrl=/experiments");

  // undefined = the Statsig fetch failed, null = no key configured; the view
  // renders a retry/unconfigured state for both instead of throwing.
  const page = await loadExperimentsPage();
  return <ExperimentsView page={page} />;
}
