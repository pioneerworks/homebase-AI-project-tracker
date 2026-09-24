/**
 * Instant-loading placeholder shown while a dynamic page renders server-side.
 * Mounted automatically by the (authed) route group's loading.tsx: without
 * it, a sidebar click waits for the entire server render (auth check + data
 * fetches) before anything appears on screen. Rendered inside the shared
 * AppShell layout, so the sidebar stays visible during navigation.
 */
export default function PageSkeleton() {
  return (
    <div className="page" role="status" aria-busy="true">
      <span className="sr-only">Loading…</span>
      <header className="hero">
        <span className="skeleton-line skeleton-line-sm" />
        <span className="skeleton-line skeleton-line-lg" />
        <span className="skeleton-line skeleton-line-md" />
      </header>
      <section className="metric-band">
        {[0, 1, 2, 3].map((index) => (
          <div className="metric" key={index}>
            <span className="metric-label skeleton-line skeleton-line-sm" />
            <span className="skeleton-line skeleton-line-lg" />
          </div>
        ))}
      </section>
      <section className="section">
        <span className="skeleton-line skeleton-line-md" />
        <div className="skeleton-block" />
        <div className="skeleton-block skeleton-block-short" />
      </section>
    </div>
  );
}
