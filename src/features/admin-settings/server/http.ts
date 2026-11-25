import { authenticatedMutation } from "@/features/auth/server/route-guard";
import { currentViewer } from "@/features/auth/server/runtime";
import { redirectTo } from "@/features/setup/server/http";
import { parseAction } from "../domain/admin";
import { getAdminSettings } from "./runtime";

export const ADMIN_PATH = "/admin";

/** A browser POST from this site by a signed-in user; the outcome is shown by the admin page after a 303. A non-admin gets a plain 404. */
export async function adminAction(request: Request): Promise<Response> {
  const guarded = await authenticatedMutation(request);
  if ("response" in guarded) return guarded.response;
  const viewer = await currentViewer(request.headers);
  const form = await request.formData().catch(() => null);
  if (!viewer || !form) return new Response(null, { status: viewer ? 400 : 401 });
  const action = parseAction((name) => (typeof form.get(name) === "string" ? (form.get(name) as string) : ""));
  const result = action ? await getAdminSettings().apply(viewer, action) : ({ ok: false, reason: "invalid", code: "admin_invalid_entry" } as const);
  if (result.ok) return redirectTo(`${ADMIN_PATH}?saved=1`);
  if (result.reason === "forbidden") return new Response(null, { status: 404 });
  return redirectTo(`${ADMIN_PATH}?error=${result.code}`);
}
