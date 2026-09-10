import { AlertTriangle, Loader2, RotateCcw, X } from "lucide-react";
import React, { useEffect } from "react";

export interface RestoreConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  versionNumber?: number;
  versionName?: string;
  isRestoring: boolean;
}

export function RestoreConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  versionNumber,
  versionName,
  isRestoring,
}: RestoreConfirmationModalProps): React.JSX.Element | null {
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape" && !isRestoring) {
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [isOpen, isRestoring, onClose]);

  if (!isOpen) {
    return null;
  }

  const titleText = versionName
    ? `Restore "${versionName}" (v${versionNumber})?`
    : `Restore Version ${versionNumber ?? ""}?`;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="restore-modal-title"
      onClick={() => {
        if (!isRestoring) onClose();
      }}
    >
      <div
        className="relative w-full max-w-md rounded-xl bg-white p-6 shadow-2xl border border-gray-200 animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          disabled={isRestoring}
          aria-label="Close confirmation dialog"
          className="absolute right-4 top-4 rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header with Warning Icon */}
        <div className="flex items-start gap-3.5">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-600 border border-amber-200">
            <RotateCcw className="h-5 w-5" />
          </div>
          <div>
            <h3
              id="restore-modal-title"
              className="text-base font-semibold text-gray-900"
            >
              {titleText}
            </h3>
            <p className="mt-1 text-xs text-gray-500">
              This will update your live board to match this historical checkpoint.
            </p>
          </div>
        </div>

        {/* Informational Box */}
        <div className="mt-4 rounded-lg bg-slate-50 border border-slate-200/80 p-3 text-xs text-slate-600 space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-blue-500 font-bold">•</span>
            <p>
              Your current board state will be replaced with the state captured in this version.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-emerald-500 font-bold">•</span>
            <p>
              This historical version will remain unchanged in history.
            </p>
          </div>
          <div className="flex items-start gap-2">
            <span className="text-purple-500 font-bold">•</span>
            <p>
              A new version checkpoint will be created to record this restore.
            </p>
          </div>
        </div>

        {/* OCC Notice Alert */}
        <div className="mt-3.5 flex items-center gap-2 rounded-md bg-amber-50/70 px-2.5 py-1.5 text-[11px] text-amber-800 border border-amber-200/60">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
          <span>
            If the board was modified by collaborators in the meantime, the restore will be safely aborted.
          </span>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isRestoring}
            className="rounded-lg border border-gray-300 bg-white px-3.5 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isRestoring}
            data-testid="confirm-restore-btn"
            className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isRestoring ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Restoring...</span>
              </>
            ) : (
              <>
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Restore Version</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
