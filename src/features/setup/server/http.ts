import { baseUrlFrom } from "../domain/manifest";

/** 303 so a POST turns into a GET. Relative `Location`, so it works behind any proxy. */
export function redirectTo(location: string, setCookies: string[] = []): Response {
  const headers = new Headers({ location, "cache-control": "no-store" });
  for (const cookie of setCookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 303, headers });
}

/** Origin of this instance as the browser sees it (`ORRERY_PUBLIC_URL` first). */
export const instanceOrigin = (headers: Headers, publicUrl = process.env.ORRERY_PUBLIC_URL): string | null =>
  baseUrlFrom({ publicUrl, host: headers.get("host"), proto: headers.get("x-forwarded-proto") });

/** Cookies are `Secure` only over HTTPS; a plain-HTTP LAN install must still work. */
export const isSecure = (origin: string | null): boolean => origin?.startsWith("https:") ?? false;
