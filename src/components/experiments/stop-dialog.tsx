"use client";

import { useEffect, useRef } from "react";

/**
 * Native <dialog> behind the "Stop & keep control" buttons. Stopping a test is
 * done in Statsig — this dialog only says so and hands the user the permalink;
 * there is no fetch anywhere.
 */

export type StopDialogExperiment = {
  name: string;
  statsigUrl: string | null;
  controlArmName: string;
};

export default function StopDialog({
  experiment,
  open,
  onClose,
}: {
  experiment: StopDialogExperiment;
  open: boolean;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="exp-dialog"
      aria-labelledby="exp-dialog-title"
      onCancel={(event) => {
        // Escape was pressed: stop the native close so `open` stays the
        // single source of truth, and let the parent unmount the state.
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <h2 className="exp-dialog-title" id="exp-dialog-title">
        Stop {experiment.name} and keep {experiment.controlArmName}?
      </h2>
      <p className="exp-dialog-body">
        This is done in Statsig. You&rsquo;ll make the decision on the experiment page there.
      </p>
      <div className="exp-dialog-actions">
        <button type="button" className="exp-btn exp-btn-outline" onClick={onClose}>
          Cancel
        </button>
        {experiment.statsigUrl ? (
          <a
            className="exp-btn exp-btn-danger"
            href={experiment.statsigUrl}
            target="_blank"
            rel="noreferrer"
          >
            Open in Statsig
          </a>
        ) : (
          <button type="button" className="exp-btn exp-btn-danger" disabled>
            Open in Statsig
          </button>
        )}
      </div>
    </dialog>
  );
}
