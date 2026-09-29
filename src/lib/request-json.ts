export class RequestError extends Error {
  constructor(message: string, public readonly retryable: boolean, public readonly status?: number) {
    super(message);
    this.name = "RequestError";
  }
}

/** Preserve HTTP context even when a proxy returns text/HTML instead of JSON. */
export async function requestJson<T>(
  url: string,
  init: RequestInit,
  operation: string,
  timeoutMs = 65_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { /* Hosting failures need not be JSON. */ }
    const requestId = response.headers.get("x-vercel-id");
    const serverReference = data && typeof data === "object" && "reference" in data && typeof data.reference === "string" ? data.reference : undefined;
    const reference = requestId || serverReference ? ` Reference: ${requestId ?? serverReference}.` : "";
    const context = `${operation} (HTTP ${response.status})`;
    if (!response.ok) {
      const detail = data && typeof data === "object" && "error" in data && typeof data.error === "string"
        ? data.error
        : response.status === 504 || response.status === 408
          ? "The server timed out."
          : "The server could not complete the request.";
      throw new RequestError(`${context}: ${detail}${reference}`, [408, 429, 500, 502, 503, 504].includes(response.status), response.status);
    }
    if (data === undefined || data === null || typeof data !== "object") {
      throw new RequestError(`${context}: The server returned an invalid JSON response.${reference}`, true, response.status);
    }
    return data as T;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError(
      `${operation}: ${controller.signal.aborted ? "The request timed out." : "The connection was interrupted."} The server may still have completed the request.`,
      true,
    );
  } finally {
    clearTimeout(timer);
  }
}
