/** Bound untrusted input before buffering or parsing it. */
export async function readProtectedRequest(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) throw new Error("Invalid request");
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let text = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 16000) { await reader.cancel(); throw new Error("Request too large"); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  const body: unknown = JSON.parse(text);
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid request");
  return body as Record<string, unknown>;
}
