/**
 * Route-level skeleton for /experiments: the page header and the experiments
 * table card with five 44px rows, matching the shapes of the real page.
 */
export default function Loading() {
  return (
    <div className="exp-main" aria-hidden="true">
      <div className="exp-header">
        <div className="exp-titleblock">
          <span className="skeleton-line exp-skel-eyebrow" />
          <span className="skeleton-line exp-skel-title" />
          <span className="skeleton-line exp-skel-dek" />
        </div>
        <div className="exp-actions">
          <span className="skeleton-line exp-skel-btn" />
          <span className="skeleton-line exp-skel-btn" />
        </div>
      </div>

      <div className="exp-table-card">
        <div className="exp-skel-headrow">
          <span className="skeleton-line exp-skel-th" />
          <span className="skeleton-line exp-skel-th" />
          <span className="skeleton-line exp-skel-th" />
          <span className="skeleton-line exp-skel-th" />
          <span className="skeleton-line exp-skel-th" />
        </div>
        {[0, 1, 2, 3, 4].map((row) => (
          <div key={row} className="exp-skel-row">
            <span className="skeleton-line exp-skel-name" />
            <span className="skeleton-line exp-skel-cell" />
            <span className="skeleton-line exp-skel-cell" />
            <span className="skeleton-line exp-skel-cell-sm" />
          </div>
        ))}
      </div>
    </div>
  );
}
