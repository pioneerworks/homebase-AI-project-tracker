import { getExperimentDetail } from "@/lib/experiments";
import { handleDetail } from "@/lib/experiments-route";
import { getSessionUser } from "@/lib/oidc-session";

export const runtime = "nodejs";

/**
 * Relay route: one experiment's daily detail as JSON, for the Experiments tab's
 * detail panel. Unknown, queued and draft ids all read as a 404.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  return handleDetail(id, { user: await getSessionUser(), getDetail: getExperimentDetail });
}
