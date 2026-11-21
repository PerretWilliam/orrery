import { startSignIn } from "@/features/auth/server/http";
import { authenticatedMutation } from "@/features/auth/server/route-guard";

// Starts the GitHub sign-in. A POST from this site only: a link on another page cannot start it.
export async function POST(request: Request) {
  const guarded = await authenticatedMutation(request);
  return "response" in guarded ? guarded.response : startSignIn(guarded.context.auth, request.headers);
}
