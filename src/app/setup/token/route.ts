import { SESSION_COOKIE, isSameOrigin, setCookie } from "@/features/setup/domain/http";
import { baseUrlFrom } from "@/features/setup/domain/manifest";
import { instanceOrigin, isSecure, redirectTo } from "@/features/setup/server/http";
import { getSetupService } from "@/features/setup/server/runtime";

// Step 1 of setup: the token goes in, a short-lived signed cookie comes out. No database write.
export async function POST(request: Request) {
  const publicOrigin = baseUrlFrom({ publicUrl: process.env.ORRERY_PUBLIC_URL });
  if (!isSameOrigin(request.headers.get("origin"), request.headers.get("host"), publicOrigin)) {
    return redirectTo("/setup?error=setup_origin_invalid");
  }
  const token = (await request.formData()).get("token");
  const result = await getSetupService().login(token);
  if (!result.ok) return redirectTo(`/setup?error=${result.issue.code}`);
  const secure = isSecure(instanceOrigin(request.headers));
  return redirectTo("/setup", [setCookie(SESSION_COOKIE, result.session, { maxAge: result.maxAgeSeconds, path: "/setup", secure })]);
}
