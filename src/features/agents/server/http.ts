import { authenticatedMutation } from "@/features/auth/server/route-guard";
import { currentViewer } from "@/features/auth/server/runtime";
import { setCookie } from "@/features/setup/domain/http";
import { readForm } from "@/lib/body";
import { instanceOrigin, isSecure, redirectTo } from "@/features/setup/server/http";
import { NEW_TOKEN_COOKIE, TOKENS_PATH } from "../domain/tokens";
import { getTokens } from "./runtime";

const field = (form: FormData, key: string) => (typeof form.get(key) === "string" ? (form.get(key) as string) : "");

/** A browser POST from this site by a signed-in user; the outcome is shown by the tokens page after a 303. */
async function mutate(request: Request, run: (form: FormData, who: { userId: string; login: string }) => Promise<Response>): Promise<Response> {
  const guarded = await authenticatedMutation(request);
  if ("response" in guarded) return guarded.response;
  const viewer = await currentViewer(request.headers);
  const form = viewer ? await readForm(request) : null; // nothing is read for a stranger
  if (!viewer || !form) return new Response(null, { status: viewer ? 400 : 401 });
  return run(form, viewer);
}

/**
 * The new token reaches the page in a cookie, never in a URL: HttpOnly, limited to the tokens page, gone after a minute.
 * ponytail: a reload within that minute shows it again; a one-shot server-side hand-off if that ever matters.
 */
export const createToken = (request: Request) =>
  mutate(request, async (form, who) => {
    const result = await getTokens().create(who, { name: field(form, "name"), days: field(form, "days") });
    if (!result.ok) return redirectTo(`${TOKENS_PATH}?error=${result.issues[0].code}`);
    const secure = isSecure(instanceOrigin(request.headers));
    return redirectTo(TOKENS_PATH, [setCookie(NEW_TOKEN_COOKIE, result.token, { maxAge: 60, path: TOKENS_PATH, secure })]);
  });

export const revokeToken = (request: Request) =>
  mutate(request, async (form, who) => {
    await getTokens().revoke(who, field(form, "id"));
    return redirectTo(`${TOKENS_PATH}?saved=1`);
  });
