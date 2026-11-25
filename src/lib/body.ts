export const MAX_BODY_BYTES = 5 * 1024 * 1024;
/** Room for a form of the hub: the largest field is a secret of 8192 characters, percent-encoded. */
export const MAX_FORM_BYTES = 256 * 1024;

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

/** A posted form, or `null` when it is over `MAX_FORM_BYTES` or unreadable: `request.formData()` alone buffers anything. */
export async function readForm(request: Request): Promise<FormData | null> {
  const body = await readCapped(request, MAX_FORM_BYTES);
  if (!body) return null;
  const type = request.headers.get("content-type") ?? "";
  return new Response(body as BodyInit, { headers: { "content-type": type } }).formData().catch(() => null);
}
