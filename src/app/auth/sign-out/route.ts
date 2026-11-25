import { getAudit } from "@/features/audit/server/runtime";
import { endSession } from "@/features/auth/server/http";
import { authenticatedMutation } from "@/features/auth/server/route-guard";
import { currentViewer } from "@/features/auth/server/runtime";

// Signing out deletes the session on the server. A POST from this site only.
export async function POST(request: Request) {
  const guarded = await authenticatedMutation(request);
  if ("response" in guarded) return guarded.response;
  const viewer = await currentViewer(request.headers);
  if (viewer) await getAudit().record({ event: "sign_out", actor: viewer.login });
  return endSession(guarded.context.auth, request.headers);
}
