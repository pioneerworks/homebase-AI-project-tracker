"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";

export default function AuthedError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error("[authed] page failed to render:", error);
  }, [error]);

  // the failure happened in a server render: refetch it, then clear the boundary
  const retry = () =>
    startTransition(() => {
      router.refresh();
      reset();
    });

  return (
    <div className="page">
      <div className="card route-error" role="alert">
        <h1 className="h2">Something went wrong loading this page</h1>
        <p className="card-empty">One of the data sources failed. The rest of the hub still works.</p>
        <button type="button" className="route-error-retry" onClick={retry}>
          Try again
        </button>
      </div>
    </div>
  );
}
