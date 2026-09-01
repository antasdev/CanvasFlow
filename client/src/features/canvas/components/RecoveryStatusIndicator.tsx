import { Loader2, CheckCircle2, AlertCircle, RefreshCw, WifiOff } from "lucide-react";
import React from "react";

import type { RecoveryStatus } from "../hooks/useBoardRecovery";

interface RecoveryStatusIndicatorProps {
  status: RecoveryStatus;
  error: string | null;
  onRetry?: () => void;
}

export const RecoveryStatusIndicator: React.FC<RecoveryStatusIndicatorProps> = ({
  status,
  error,
  onRetry,
}) => {
  if (status === "idle") {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 px-3.5 py-1.5 rounded-full shadow-lg backdrop-blur-md transition-all duration-300 animate-in fade-in slide-in-from-top-2 text-xs font-medium border"
      style={{
        backgroundColor:
          status === "reconnecting"
            ? "rgba(245, 158, 11, 0.9)"
            : status === "recovering" || status === "reconciling"
            ? "rgba(59, 130, 246, 0.9)"
            : status === "recovered"
            ? "rgba(16, 185, 129, 0.9)"
            : "rgba(239, 68, 68, 0.9)",
        borderColor:
          status === "reconnecting"
            ? "rgb(217, 119, 6)"
            : status === "recovering" || status === "reconciling"
            ? "rgb(37, 99, 235)"
            : status === "recovered"
            ? "rgb(5, 150, 105)"
            : "rgb(220, 38, 38)",
        color: "#ffffff",
      }}
    >
      {status === "reconnecting" && (
        <>
          <WifiOff className="w-3.5 h-3.5 animate-pulse" />
          <span>Reconnecting to server...</span>
        </>
      )}

      {status === "recovering" && (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Synchronizing board state...</span>
        </>
      )}

      {status === "reconciling" && (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Resolving changes...</span>
        </>
      )}

      {status === "conflict" && (
        <>
          <AlertCircle className="w-3.5 h-3.5" />
          <span>Some changes could not be applied because the item was modified by another collaborator.</span>
        </>
      )}

      {status === "recovered" && (
        <>
          <CheckCircle2 className="w-3.5 h-3.5" />
          <span>Board synchronized</span>
        </>
      )}

      {status === "error" && (
        <>
          <AlertCircle className="w-3.5 h-3.5" />
          <span title={error ?? undefined}>
            {error ? `Sync failed: ${error.slice(0, 30)}...` : "Sync failed"}
          </span>
          {onRetry && (
            <button
              onClick={onRetry}
              className="ml-1 px-1.5 py-0.5 bg-white/20 hover:bg-white/30 rounded text-[11px] font-semibold flex items-center gap-1 transition-colors"
            >
              <RefreshCw className="w-2.5 h-2.5" />
              Retry
            </button>
          )}
        </>
      )}
    </div>
  );
};
