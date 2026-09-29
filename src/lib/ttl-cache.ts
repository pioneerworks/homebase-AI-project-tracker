import "server-only";

type Entry<T> = { at: number; value: T };

/**
 * In-memory cache for one upstream call, per function instance.
 *  - fresh for `ttlMs`; after that the next caller refreshes it
 *  - concurrent callers share one in-flight refresh (no stampede on cold start)
 *  - a failed refresh serves the last good value when there is one
 *  - after a failure with nothing cached, callers skip the upstream for
 *    `failureTtlMs` instead of paying for the same failing call again
 *
 * Every refresh runs in the foreground under the caller's own fetch deadline,
 * unlike Next's `next.revalidate`, which refreshes stale entries in the
 * background with the abort signal removed.
 */
export function ttlCache<K, T>(
  load: (key: K) => Promise<T>,
  options: { ttlMs: number; failureTtlMs: number; keyOf?: (key: K) => string },
) {
  const entries = new Map<string, Entry<T>>();
  const failures = new Map<string, { at: number; error: unknown }>();
  const inflight = new Map<string, Promise<T>>();
  const keyOf = options.keyOf ?? ((key: K) => String(key));

  async function get(key: K, now: number = Date.now()): Promise<T> {
    const id = keyOf(key);
    const hit = entries.get(id);
    if (hit && now - hit.at < options.ttlMs) return hit.value;

    const failed = failures.get(id);
    if (!hit && failed && now - failed.at < options.failureTtlMs) throw failed.error;

    const pending = inflight.get(id);
    if (pending) return pending;

    const run = load(key)
      .then((value) => {
        entries.set(id, { at: now, value });
        failures.delete(id);
        return value;
      })
      .catch((error: unknown) => {
        failures.set(id, { at: now, error });
        if (hit) return hit.value;
        throw error;
      })
      .finally(() => inflight.delete(id));
    inflight.set(id, run);
    return run;
  }

  function clear(key?: K) {
    if (key === undefined) {
      entries.clear();
      failures.clear();
      return;
    }
    entries.delete(keyOf(key));
    failures.delete(keyOf(key));
  }

  return { get, clear };
}
