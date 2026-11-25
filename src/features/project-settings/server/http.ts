import { authenticatedMutation } from "@/features/auth/server/route-guard";
import { currentViewer } from "@/features/auth/server/runtime";
import { readForm } from "@/lib/body";
import { redirectTo } from "@/features/setup/server/http";
import { settingsPath } from "../domain/hosts";
import { getProjectSettings } from "./runtime";
import type { SettingsResult } from "./service";

type Target = { owner: string; name: string };

/** A browser POST from this site by a signed-in user; the outcome is shown by the settings page after a 303. Unknown project and refusal are the same 404. */
async function mutate(request: Request, target: Target, run: (form: FormData, who: { userId: string; login: string }) => Promise<SettingsResult>): Promise<Response> {
  const guarded = await authenticatedMutation(request);
  if ("response" in guarded) return guarded.response;
  const viewer = await currentViewer(request.headers);
  const form = viewer ? await readForm(request) : null; // nothing is read for a stranger
  if (!viewer || !form) return new Response(null, { status: viewer ? 400 : 401 });
  const result = await run(form, viewer);
  if (result.ok) return redirectTo(settingsPath(target, "?saved=1"));
  if (result.reason === "forbidden") return new Response(null, { status: 404 });
  return redirectTo(settingsPath(target, `?error=${result.code}`));
}

const field = (form: FormData, key: string) => (typeof form.get(key) === "string" ? (form.get(key) as string) : "");

export const addHost = (request: Request, target: Target) => mutate(request, target, (form, who) => getProjectSettings().addHost(target, who, field(form, "host")));
export const removeHost = (request: Request, target: Target) => mutate(request, target, (form, who) => getProjectSettings().removeHost(target, who, field(form, "host")));
export const reindex = (request: Request, target: Target) => mutate(request, target, (_form, who) => getProjectSettings().reindex(target, who));
