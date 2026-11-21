import { webhookIssue, type WebhookIssue } from "./errors";

const EVENT = /^[a-z_]{1,64}$/;
const DELIVERY_ID = /^[A-Za-z0-9-]{1,64}$/;

export type DeliveryHeaders = { event: string; deliveryId: string };

/** What GitHub sends with every delivery. Both values end up in the database, so their shape is checked first. */
export function parseDeliveryHeaders(headers: Headers): DeliveryHeaders | WebhookIssue {
  const event = headers.get("x-github-event");
  if (event === null || !EVENT.test(event)) return webhookIssue("webhook_headers_invalid", "headers.x-github-event", "The event name is missing or malformed.");
  const deliveryId = headers.get("x-github-delivery");
  if (deliveryId === null || !DELIVERY_ID.test(deliveryId)) return webhookIssue("webhook_headers_invalid", "headers.x-github-delivery", "The delivery id is missing or malformed.");
  return { event, deliveryId };
}
