import { CLAIM_COOKIE, clearCookie } from "@/features/setup/domain/http";
import { redirectTo } from "@/features/setup/server/http";
import type { Auth } from "./better-auth";

/** Where a refused or failed sign-in lands; the page shows the fix of the error code. */
export const SIGN_IN_PATH = "/sign-in";

/** Starts the GitHub redirect. Better Auth's state cookies are passed on; the browser gets a plain 303. */
export async function startSignIn(auth: Auth, headers: Headers): Promise<Response> {
  const response = await auth.api.signInSocial({
    body: { provider: "github", callbackURL: "/", errorCallbackURL: SIGN_IN_PATH },
    headers,
    asResponse: true,
  });
  const { url } = (await response.json()) as { url: string };
  return redirectTo(url, response.headers.getSetCookie());
}

/** Revokes the session on the server (the row is deleted), then clears the cookie. */
export async function endSession(auth: Auth, headers: Headers): Promise<Response> {
  const response = await auth.api.signOut({ headers, asResponse: true });
  return redirectTo(SIGN_IN_PATH, response.headers.getSetCookie());
}

/** GitHub's return trip. Whatever the outcome, the one-time admin claim cookie has done its job: it is cleared. */
export async function finishSignIn(auth: Auth, request: Request, secure: boolean): Promise<Response> {
  const response = await auth.handler(request);
  const headers = new Headers(response.headers);
  headers.append("set-cookie", clearCookie(CLAIM_COOKIE, "/", secure));
  return new Response(response.body, { status: response.status, headers });
}
