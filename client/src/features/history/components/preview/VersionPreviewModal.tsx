import { AlertTriangle, Clock, History, RefreshCw, User, X } from "lucide-react";
import React, { useEffect, useState } from "react";

import { useVersionDetail } from "../../hooks/useVersionDetail";
import { type HistoryUIState, useVersionHistoryStore } from "../../store/history.store";
import type { VersionCanvasSnapshot } from "../../types/history.types";
import { formatTimelineDate } from "../../utils/history-date.utils";
import { PreviewCanvas } from "./PreviewCanvas";

export interface VersionPreviewModalProps {
  boardId: string;
}

export function VersionPreviewModal({
  boardId,
}: VersionPreviewModalProps): React.JSX.Element | null {
  const previewVersionId = useVersionHistoryStore((state: HistoryUIState) => state.previewVersionId);
  const closePreview = useVersionHistoryStore((state: HistoryUIState) => state.closePreview);

  const {
    data: versionDetail,
    isLoading,
    isError,
    error,
    refetch,
  } = useVersionDetail(boardId, previewVersionId);

  const [selectedCanvasId, setSelectedCanvasId] = useState<string | null>(null);

  // Synchronize initial active canvas when detail loads or version changes
  useEffect(() => {
    if (versionDetail?.snapshot.canvases && versionDetail.snapshot.canvases.length > 0) {
      setSelectedCanvasId(versionDetail.snapshot.canvases[0].canvasId);
    } else {
      setSelectedCanvasId(null);
    }
  }, [versionDetail?.id, versionDetail?.snapshot.canvases]);

  // Handle Escape key to close modal
  useEffect(() => {
    if (!previewVersionId) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closePreview();
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [previewVersionId, closePreview]);

  if (!previewVersionId) {
    return null;
  }

  const canvases: VersionCanvasSnapshot[] = versionDetail?.snapshot.canvases ?? [];
  const activeCanvas: VersionCanvasSnapshot | undefined =
    canvases.find((c: VersionCanvasSnapshot) => c.canvasId === selectedCanvasId) ?? canvases[0];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-3 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="version-preview-title"
      onClick={closePreview}
    >
      <div
        className="relative flex flex-col w-full h-full max-w-7xl rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-800 bg-slate-900/90 backdrop-blur-md shrink-0">
          {/* Left: Version Info */}
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <History className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2
                  id="version-preview-title"
                  className="text-sm md:text-base font-semibold text-slate-100"
                >
                  {versionDetail ? (
                    <>
                      <span>{versionDetail.name || `Version ${versionDetail.versionNumber}`}</span>
                      {versionDetail.name && (
                        <span className="ml-2 inline-flex items-center rounded-md bg-blue-500/20 px-2 py-0.5 text-xs font-medium text-blue-300">
                          v{versionDetail.versionNumber}
                        </span>
                      )}
                    </>
                  ) : (
                    <span>Version Preview</span>
                  )}
                </h2>
                <span className="hidden sm:inline-flex items-center rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-medium text-amber-400 border border-amber-500/30">
                  Read-Only Preview
                </span>
              </div>

              {versionDetail && (
                <div className="flex items-center gap-3 mt-0.5 text-xs text-slate-400">
                  <span className="flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5 text-slate-500" />
                    {formatTimelineDate(versionDetail.createdAt)}
                  </span>
                  {versionDetail.author?.fullName && (
                    <span className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5 text-slate-500" />
                      {versionDetail.author.fullName}
                    </span>
                  )}
                  <span className="text-slate-500">
                    {versionDetail.shapeCount} {versionDetail.shapeCount === 1 ? "shape" : "shapes"}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Center: Multi-Canvas Selector Tabs */}
          {canvases.length > 1 && (
            <div className="flex items-center gap-1 bg-slate-800/80 p-1 rounded-lg border border-slate-700/60">
              {canvases.map((c: VersionCanvasSnapshot, idx: number) => {
                const isSelected = (activeCanvas?.canvasId ?? "") === c.canvasId;
                return (
                  <button
                    key={c.canvasId}
                    type="button"
                    onClick={() => setSelectedCanvasId(c.canvasId)}
                    className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                      isSelected
                        ? "bg-blue-600 text-white shadow-xs"
                        : "text-slate-400 hover:text-slate-200 hover:bg-slate-700/50"
                    }`}
                  >
                    {c.name || `Canvas ${idx + 1}`}
                  </button>
                );
              })}
            </div>
          )}

          {/* Right: Close Action */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closePreview}
              aria-label="Close version preview"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-slate-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Modal Body: Loading / Error / Canvas View */}
        <div className="relative flex-1 w-full h-full overflow-hidden bg-slate-950">
          {isLoading && (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-400">
              <RefreshCw className="h-8 w-8 animate-spin text-blue-500" />
              <p className="text-sm font-medium">Loading historical snapshot...</p>
            </div>
          )}

          {isError && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center px-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-500/10 text-red-400 border border-red-500/20">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-slate-100">Failed to load snapshot</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  {error instanceof Error ? error.message : "An unexpected error occurred while fetching this version."}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => refetch()}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-medium hover:bg-blue-500 transition-colors"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry
                </button>
                <button
                  type="button"
                  onClick={closePreview}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700 transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {!isLoading && !isError && versionDetail && activeCanvas && (
            <PreviewCanvas canvas={activeCanvas} />
          )}

          {!isLoading && !isError && versionDetail && !activeCanvas && (
            <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-400">
              <p className="text-sm">No canvas data found in this historical snapshot.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
