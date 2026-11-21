export const MAX_BODY_BYTES = 5 * 1024 * 1024;

/** The raw body, or `null` as soon as it is known to exceed `max` (declared length first, then bytes actually read). */
export async function readCapped(request: Request, max: number = MAX_BODY_BYTES): Promise<Uint8Array | null> {
  if (Number(request.headers.get("content-length")) > max) return null;
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) return Buffer.concat(chunks);
    size += value.byteLength;
    if (size > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
}
