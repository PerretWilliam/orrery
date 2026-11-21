import { z } from "zod";

/** GitHub App manifest (https://docs.github.com/en/apps/sharing-github-apps/registering-a-github-app-from-a-manifest). */

export const APP_PERMISSIONS = {
  metadata: "read",
  contents: "read",
  issues: "read",
  pull_requests: "read",
  actions: "read",
  members: "read",
} as const;

// `installation` and `installation_repositories` are always delivered to an App; these need a subscription.
export const APP_EVENTS = ["member", "membership", "organization", "team", "repository", "push"] as const;

const HOST = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?(:\d{1,5})?$/i;

/** `ORRERY_PUBLIC_URL` when set, otherwise the origin the browser used. `null` when neither is usable. */
export function baseUrlFrom(input: { publicUrl?: string; host?: string | null; proto?: string | null }): string | null {
  if (input.publicUrl) {
    if (!URL.canParse(input.publicUrl)) return null;
    const url = new URL(input.publicUrl);
    return url.protocol === "http:" || url.protocol === "https:" ? url.origin : null;
  }
  if (!input.host || !HOST.test(input.host)) return null;
  return `${input.proto === "https" ? "https" : "http"}://${input.host}`;
}

/** Read-only App. Webhooks are active only when the instance is reachable by GitHub (`ORRERY_PUBLIC_URL` set). */
export const buildManifest = (baseUrl: string, webhooks: boolean) => ({
  name: "Orrery",
  url: baseUrl,
  hook_attributes: { url: `${baseUrl}/api/webhooks/github`, active: webhooks },
  redirect_url: `${baseUrl}/setup/github/callback`,
  callback_urls: [`${baseUrl}/api/auth/callback/github`],
  public: false,
  default_permissions: APP_PERMISSIONS,
  default_events: APP_EVENTS,
});

const nonEmpty = z.string().min(1);

/** What GitHub returns when the manifest code is exchanged. Extra fields are ignored; missing ones fail. */
const Conversion = z.object({
  id: z.number().int().positive(),
  slug: z.string().regex(/^[A-Za-z0-9-]{1,100}$/),
  client_id: nonEmpty,
  client_secret: nonEmpty,
  webhook_secret: nonEmpty,
  pem: nonEmpty,
});

export type AppCredentials = { id: string; slug: string; clientId: string; clientSecret: string; webhookSecret: string; privateKey: string };

export function parseConversion(json: unknown): AppCredentials | null {
  const parsed = Conversion.safeParse(json);
  if (!parsed.success) return null;
  const { id, slug, client_id, client_secret, webhook_secret, pem } = parsed.data;
  return { id: String(id), slug, clientId: client_id, clientSecret: client_secret, webhookSecret: webhook_secret, privateKey: pem };
}
