/** Calls a deployed backend function without a client SDK. */
export async function requestBackend<T = unknown>(
  url: string,
  operation: "query" | "mutation",
  path: string,
  args: Record<string, unknown>,
): Promise<T> {
  const response = await fetch(`${url.replace(/\/+$/, "")}/api/${operation}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path, args, format: "json" }),
    cache: "no-store",
  });
  let result: unknown;
  try { result = await response.json(); }
  catch { throw new Error(`Backend returned an invalid response (${response.status})`); }
  if (result === null || typeof result !== "object") throw new Error("Backend returned an invalid response");
  const payload = result as Record<string, unknown>;
  if (payload.status === "error" && typeof payload.errorMessage === "string") throw new Error(payload.errorMessage);
  if (!response.ok) throw new Error(`Backend request failed (${response.status})`);
  if (payload.status !== "success" || !Object.hasOwn(payload, "value")) throw new Error("Backend returned an invalid response");
  return payload.value as T;
}

/** Mutations share a queue so callers retain their invocation order, including after errors. */
export function createBackendClient(url: string) {
  let pending = Promise.resolve();
  return {
    query<T = unknown>(path: string, args: Record<string, unknown>): Promise<T> {
      return requestBackend<T>(url, "query", path, args);
    },
    mutation<T = unknown>(path: string, args: Record<string, unknown>): Promise<T> {
      const result = pending.then(() => requestBackend<T>(url, "mutation", path, args));
      pending = result.then(() => {}, () => {});
      return result;
    },
  };
}
