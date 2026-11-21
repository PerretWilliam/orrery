import { endSession } from "@/features/auth/server/http";
import { authenticatedMutation } from "@/features/auth/server/route-guard";

// Signing out deletes the session on the server. A POST from this site only.
export async function POST(request: Request) {
  const guarded = await authenticatedMutation(request);
  return "response" in guarded ? guarded.response : endSession(guarded.context.auth, request.headers);
}
