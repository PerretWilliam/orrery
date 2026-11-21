/** Cookie and origin helpers of the wizard. Plain strings in, plain strings out. */

export const SESSION_COOKIE = "orrery_setup";
export const CLAIM_COOKIE = "orrery_admin_claim";

export type CookieOptions = { maxAge: number; path: string; secure: boolean };

/** `Set-Cookie` value: HttpOnly and SameSite=Lax always, Secure when the instance is served over HTTPS. */
export const setCookie = (name: string, value: string, { maxAge, path, secure }: CookieOptions): string =>
  `${name}=${value}; Path=${path}; Max-Age=${maxAge}; HttpOnly; SameSite=Lax${secure ? "; Secure" : ""}`;

export const clearCookie = (name: string, path: string, secure: boolean): string => setCookie(name, "", { maxAge: 0, path, secure });

/** Value of one cookie in a `Cookie` header, or `undefined`. */
export function readCookie(header: string | null, name: string): string | undefined {
  for (const part of (header ?? "").split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return undefined;
}

/**
 * CSRF check for a mutation: the browser always sends `Origin` on a form POST, and it must be this site.
 * A missing or foreign origin is refused. `expected` is the public origin when configured, else the request's host.
 */
export function isSameOrigin(origin: string | null, host: string | null, publicOrigin?: string | null): boolean {
  if (!origin || !URL.canParse(origin)) return false;
  const given = new URL(origin);
  if (publicOrigin) return given.origin === publicOrigin;
  return given.host === host;
}
