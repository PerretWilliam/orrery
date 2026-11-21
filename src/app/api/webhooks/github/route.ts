import { getWebhookHandler } from "@/features/webhooks/server/runtime";

// GitHub's deliveries. Authenticated by the HMAC signature alone: no cookie, no CSRF check, and nothing is read before the signature.
export async function POST(request: Request) {
  return getWebhookHandler()(request);
}
