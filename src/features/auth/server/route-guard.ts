import { isSameOrigin } from "@/features/setup/domain/http";
import { baseUrlFrom } from "@/features/setup/domain/manifest";
import { redirectTo } from "@/features/setup/server/http";
import type { AuthIssueCode } from "../domain/errors";
import { SIGN_IN_PATH } from "./http";
import { getAuthContext, type AuthContext } from "./runtime";

export const failTo = (code: AuthIssueCode) => redirectTo(`${SIGN_IN_PATH}?error=${code}`);

/**
 * Shared start of the auth routes: a mutation must come from this site (CSRF), and the GitHub App must exist.
 * Returns the auth context, or the response to send back.
 */
export async function authenticatedMutation(request: Request): Promise<{ context: AuthContext } | { response: Response }> {
  const publicOrigin = baseUrlFrom({ publicUrl: process.env.ORRERY_PUBLIC_URL });
  if (!isSameOrigin(request.headers.get("origin"), request.headers.get("host"), publicOrigin)) return { response: failTo("auth_origin_invalid") };
  const context = await getAuthContext(request.headers);
  return context ? { context } : { response: failTo("auth_not_configured") };
}
