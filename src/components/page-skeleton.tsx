/**
 * Instant-loading placeholder shown while a dynamic page renders server-side.
 * Mounted automatically by each route's loading.tsx: without it, a sidebar
 * click waits for the entire server render (auth check + data fetches) before
 * anything appears on screen.
 */
export default function PageSkeleton() {
  return (
    <div className="page" aria-busy="true" aria-live="polite">
      <header className="hero">
        <span className="skeleton-line skeleton-line-sm" />
        <span className="skeleton-line skeleton-line-lg" />
        <span className="skeleton-line skeleton-line-md" />
      </header>
      <section className="metric-band" aria-label="Loading content">
        {[0, 1, 2, 3].map((index) => (
          <div className="metric" key={index}>
            <span className="metric-label skeleton-line skeleton-line-sm" />
            <span className="skeleton-line skeleton-line-lg" />
          </div>
        ))}
      </section>
      <section className="section" aria-label="Loading content">
        <span className="skeleton-line skeleton-line-md" />
        <div className="skeleton-block" />
        <div className="skeleton-block skeleton-block-short" />
      </section>
    </div>
  );
}
