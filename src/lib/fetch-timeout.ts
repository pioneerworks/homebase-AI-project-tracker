import "server-only";

/**
 * fetch with a hard deadline. The signal also covers reading the body, so a
 * response that stalls mid-download is cut off too. Without this an upstream
 * that never answers holds the page until the platform's 300s function limit.
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit & { next?: { revalidate?: number; tags?: string[] } },
  timeoutMs: number,
  label: string,
): Promise<Response> {
  try {
    return await fetch(input, { ...init, signal: AbortSignal.timeout(timeoutMs) });
  } catch (error) {
    throw asTimeout(error, timeoutMs, label);
  }
}

/** Rewrap an abort from AbortSignal.timeout as a readable error. */
export function asTimeout(error: unknown, timeoutMs: number, label: string): unknown {
  const name = error instanceof Error ? error.name : "";
  if (name === "TimeoutError" || name === "AbortError") {
    return new Error(`${label} timed out after ${timeoutMs}ms`);
  }
  return error;
}
