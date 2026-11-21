import type { PermissionScope } from "@/features/access/domain/capabilities";
import type { RepoRef } from "@/features/repos/domain/git-provider";
import { parseDeliveryHeaders } from "../domain/delivery";
import { WEBHOOK_STATUS, webhookIssue, type WebhookIssue } from "../domain/errors";
import { defaultBranchPush, invalidationScopes, isHandledEvent, PUSH_EVENT, REPOSITORY_SET_EVENTS } from "../domain/invalidation";
import { verifySignature } from "../domain/signature";
import { readCapped } from "./body";

export type WebhookDeps = {
  /** The App's webhook secret in clear, or `null` before the first-run setup. */
  secret: () => Promise<string | null>;
  /** Records the delivery id; `false` when it was already processed. */
  claim: (deliveryId: string, event: string, now: Date) => Promise<boolean>;
  invalidate: (scope: PermissionScope) => void;
  /** Asks discovery to look again at one repository, or at all of them. Must not throw and must not make the answer wait. */
  discover: (target: RepoRef | "all") => void;
  now: () => Date;
};

const refuse = (issue: WebhookIssue) => Response.json({ error: issue }, { status: WEBHOOK_STATUS[issue.code] });
const accept = (body: Record<string, unknown>) => Response.json({ ok: true, ...body });

/**
 * POST /api/webhooks/github. Order matters: nothing is parsed, stored or acted on before the signature has been
 * checked against the raw body, and a delivery id is only recorded once its payload has been understood.
 * If the process dies between recording and invalidating, the 5-minute cache expiry is the fallback.
 */
export function createWebhookHandler(deps: WebhookDeps) {
  return async (request: Request): Promise<Response> => {
    const secret = await deps.secret();
    if (!secret) return refuse(webhookIssue("webhook_not_configured", "$", "This instance has no GitHub App yet."));

    const body = await readCapped(request);
    if (body === null) return refuse(webhookIssue("webhook_payload_too_large", "body", "The payload is larger than the limit."));

    if (!verifySignature(secret, body, request.headers.get("x-hub-signature-256"))) {
      return refuse(webhookIssue("webhook_signature_invalid", "headers.x-hub-signature-256", "The signature does not match the payload."));
    }

    const headers = parseDeliveryHeaders(request.headers);
    if ("code" in headers) return refuse(headers);
    const isPush = headers.event === PUSH_EVENT;
    if (!isPush && !isHandledEvent(headers.event)) return accept({ event: headers.event, ignored: true });

    let payload: unknown;
    try {
      payload = JSON.parse(Buffer.from(body).toString("utf8"));
    } catch {
      return refuse(webhookIssue("webhook_payload_invalid", "body", "The payload is not valid JSON."));
    }

    if (!(await deps.claim(headers.deliveryId, headers.event, deps.now()))) return accept({ event: headers.event, duplicate: true });

    if (isPush) {
      const repo = defaultBranchPush(payload);
      if (repo) deps.discover(repo);
      return accept({ event: headers.event, discovering: repo !== null });
    }

    if ((REPOSITORY_SET_EVENTS as readonly string[]).includes(headers.event)) deps.discover("all");
    const scopes = invalidationScopes(headers.event, payload);
    for (const scope of scopes) deps.invalidate(scope);
    return accept({ event: headers.event, invalidated: scopes.length });
  };
}
