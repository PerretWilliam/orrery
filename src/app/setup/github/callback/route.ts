import { CLAIM_COOKIE, SESSION_COOKIE, clearCookie, readCookie, setCookie } from "@/features/setup/domain/http";
import { CLAIM_TTL_MS } from "@/features/setup/domain/admin-claim";
import { instanceOrigin, isSecure, redirectTo } from "@/features/setup/server/http";
import { getSetupService } from "@/features/setup/server/runtime";

// Step 3: GitHub sends the browser back here with a one-time code. Needs the setup cookie and the matching state.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const session = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  const result = await getSetupService().complete(session, params.get("state"), params.get("code"));
  if (!result.ok) return redirectTo(`/setup?error=${result.issue.code}`);
  const secure = isSecure(instanceOrigin(request.headers));
  return redirectTo(`/setup/done?app=${encodeURIComponent(result.slug)}`, [
    // The claim secret leaves the server once, in this cookie: only its hash is stored.
    setCookie(CLAIM_COOKIE, result.claimSecret, { maxAge: CLAIM_TTL_MS / 1000, path: "/", secure }),
    clearCookie(SESSION_COOKIE, "/setup", secure),
  ]);
}
