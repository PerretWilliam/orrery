import { authenticatedMutation } from "@/features/auth/server/route-guard";
import { currentViewer } from "@/features/auth/server/runtime";
import { readForm } from "@/lib/body";
import { redirectTo } from "@/features/setup/server/http";
import { secretsPath } from "../domain/paths";
import type { SecretResult } from "./service";
import { getSecrets } from "./runtime";

type Target = { owner: string; name: string };

/** A browser POST from this site by a signed-in user; the outcome is shown by the settings page after a 303. Unknown project and refusal are the same 404. */
async function mutate(request: Request, target: Target, run: (form: FormData, who: { userId: string; login: string }) => Promise<SecretResult>): Promise<Response> {
  const guarded = await authenticatedMutation(request);
  if ("response" in guarded) return guarded.response;
  const viewer = await currentViewer(request.headers);
  const form = viewer ? await readForm(request) : null; // nothing is read for a stranger
  if (!viewer || !form) return new Response(null, { status: viewer ? 400 : 401 });
  const result = await run(form, viewer);
  if (result.ok) return redirectTo(secretsPath(target, "?saved=1"));
  if (result.reason === "forbidden") return new Response(null, { status: 404 });
  return redirectTo(secretsPath(target, `?error=${result.issues[0].code}`));
}

const field = (form: FormData, key: string) => (typeof form.get(key) === "string" ? (form.get(key) as string) : "");

export const saveSecret = (request: Request, target: Target) =>
  mutate(request, target, (form, who) =>
    getSecrets().save({ owner: target.owner, name: target.name }, who, { name: field(form, "name"), value: field(form, "value"), hosts: field(form, "hosts").split(/[\s,]+/).filter(Boolean) }),
  );

export const deleteSecret = (request: Request, target: Target) =>
  mutate(request, target, (form, who) => getSecrets().remove({ owner: target.owner, name: target.name }, who, field(form, "name")));
