import "server-only";

/**
 * fetch with a hard deadline. The signal also covers reading the body, so a
 * response that stalls mid-download is cut off too. Without this an upstream
 * that never answers holds the page until the platform's 300s function limit.
 *
 * Use it with `cache: "no-store"`: Next drops the signal when it revalidates a
 * stale `next.revalidate` fetch in the background, which would leave that
 * refresh unbounded. Cache with unstable_cache around the call instead.
 */
export async function fetchWithTimeout(
  input: string,
  init: RequestInit,
  timeoutMs: number,
  label: string,
): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
  try {
    return await fetch(input, { ...init, signal });
  } catch (error) {
    throw asTimeout(error, timeoutMs, label);
  }
}

/** Rewrap the abort raised by AbortSignal.timeout as a readable error. */
export function asTimeout(error: unknown, timeoutMs: number, label: string): unknown {
  if (error instanceof Error && error.name === "TimeoutError") {
    return new Error(`${label} timed out after ${timeoutMs}ms`);
  }
  return error;
}

/** Read a JSON body under the same deadline as its request. */
export async function readJson<T>(response: Response, timeoutMs: number, label: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch (error) {
    throw asTimeout(error, timeoutMs, label);
  }
}
