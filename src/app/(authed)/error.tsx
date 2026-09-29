"use client";

import { useEffect } from "react";

export default function AuthedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[authed] page failed to render:", error);
  }, [error]);

  return (
    <div className="page">
      <div className="card route-error" role="alert">
        <h1 className="h2">Something went wrong loading this page</h1>
        <p className="card-empty">One of the data sources failed. The rest of the hub still works.</p>
        <button type="button" className="route-error-retry" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
