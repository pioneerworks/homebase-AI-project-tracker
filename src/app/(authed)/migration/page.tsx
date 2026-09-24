import Dashboard from "@/app/dashboard";
import { getSnapshot } from "@/lib/linear";
import { getSessionUser } from "@/lib/oidc-session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function MigrationPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login?callbackUrl=/migration");

  const snapshot = await getSnapshot();
  return <Dashboard initialSnapshot={snapshot} user={user} />;
}
