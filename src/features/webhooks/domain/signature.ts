import { createHmac, timingSafeEqual } from "node:crypto";

const HEADER = /^sha256=([0-9a-f]{64})$/;

/**
 * GitHub signs the raw body with HMAC-SHA256 and sends `sha256=<hex>` in `X-Hub-Signature-256`. The comparison takes
 * the same time wherever the two values differ. A missing, malformed or legacy (`sha1=`) header is a failure.
 */
export function verifySignature(secret: string, body: Uint8Array, header: string | null): boolean {
  const received = header === null ? null : HEADER.exec(header)?.[1];
  if (!received || !secret) return false;
  const expected = createHmac("sha256", secret).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(received, "hex"));
}
