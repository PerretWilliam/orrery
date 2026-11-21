/**
 * Error catalog of the GitHub webhook endpoint. Same shape and rules as the other catalogs: stable codes (never renamed
 * or reused), a message that never contains the secret, a signature or the payload, a JSON path and a suggested fix.
 */
export const WEBHOOK_ERRORS = {
  webhook_not_configured: { fix: "Finish the first-run setup at /setup so the GitHub App and its webhook secret exist." },
  webhook_signature_invalid: { fix: "Send the delivery from GitHub with the App's webhook secret, or redeliver it from the App's advanced settings." },
  webhook_headers_invalid: { fix: "Send the X-GitHub-Event and X-GitHub-Delivery headers exactly as GitHub does." },
  webhook_payload_too_large: { fix: "Webhook payloads are limited to 5 MB; GitHub never sends more than that for the events this hub subscribes to." },
  webhook_payload_invalid: { fix: "Send the JSON body exactly as GitHub produced it." },
} as const;

export type WebhookIssueCode = keyof typeof WEBHOOK_ERRORS;

export type WebhookIssue = { code: WebhookIssueCode; path: string; message: string; fix: string };

export const webhookIssue = (code: WebhookIssueCode, path: string, message: string): WebhookIssue => ({
  code,
  path,
  message,
  fix: Reflect.get(WEBHOOK_ERRORS, code).fix,
});

export const WEBHOOK_STATUS: Record<WebhookIssueCode, number> = {
  webhook_not_configured: 503,
  webhook_signature_invalid: 401,
  webhook_headers_invalid: 400,
  webhook_payload_too_large: 413,
  webhook_payload_invalid: 400,
};
