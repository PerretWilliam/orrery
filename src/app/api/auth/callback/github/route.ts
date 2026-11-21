import { finishSignIn } from "@/features/auth/server/http";
import { failTo } from "@/features/auth/server/route-guard";
import { getAuthContext } from "@/features/auth/server/runtime";
import { instanceOrigin, isSecure } from "@/features/setup/server/http";

// GitHub's return trip. This is the only Better Auth endpoint exposed: no sign-up, no session or account API.
export async function GET(request: Request) {
  const context = await getAuthContext(request.headers);
  if (!context) return failTo("auth_not_configured");
  return finishSignIn(context.auth, request, isSecure(instanceOrigin(request.headers)));
}
