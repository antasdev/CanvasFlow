import { History, X, Loader2 } from "lucide-react";
import React, { useEffect, useRef } from "react";

import { useVersionHistory } from "../hooks";
import { useHistoryStore } from "../store";

import { VersionPreviewModal } from "./preview";
import { VersionHistoryEmptyState } from "./VersionHistoryEmptyState";
import { VersionHistoryErrorState } from "./VersionHistoryErrorState";
import { VersionHistoryItem } from "./VersionHistoryItem";
import { VersionHistoryLoadingSkeleton } from "./VersionHistoryLoadingSkeleton";

export interface VersionHistoryPanelProps {
  boardId?: string;
  className?: string;
}

export function VersionHistoryPanel({
  boardId,
  className = "",
}: VersionHistoryPanelProps): React.JSX.Element {
  const isPanelOpen = useHistoryStore((state) => state.isPanelOpen);
  const togglePanel = useHistoryStore((state) => state.togglePanel);

  const panelRef = useRef<HTMLDivElement>(null);

  const {
    versions,
    groupedVersions,
    totalCount,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    isError,
    error,
    fetchNextPage,
    refetch,
  } = useVersionHistory(isPanelOpen ? boardId : undefined);

  // Close on Escape key press
  useEffect(() => {
    if (!isPanelOpen) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        togglePanel(false);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPanelOpen, togglePanel]);

  if (!isPanelOpen) {
    return <></>;
  }

  return (
    <>
      <aside
        ref={panelRef}
        role="region"
        aria-label="Version History Panel"
        className={`fixed right-0 top-0 z-30 flex h-screen w-full sm:w-96 max-w-full flex-col border-l border-gray-200 bg-slate-50 shadow-2xl transition-all duration-200 ${className}`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-blue-600" aria-hidden="true" />
            <h2 className="font-semibold text-gray-900 text-sm">
              Version History
            </h2>
            {totalCount > 0 && (
              <span
                className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800"
                aria-label={`${totalCount} total versions`}
              >
                {totalCount} {totalCount === 1 ? "version" : "versions"}
              </span>
            )}
          </div>

          <button
            type="button"
            aria-label="Close version history panel"
            onClick={() => togglePanel(false)}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {/* Main Content Feed */}
        <div
          id="version-history-feed"
          tabIndex={0}
          aria-label="Version history timeline"
          className="flex-1 overflow-y-auto p-3 space-y-5 focus:outline-none focus:ring-1 focus:ring-blue-400/50"
        >
          {isLoading ? (
            <VersionHistoryLoadingSkeleton />
          ) : isError ? (
            <VersionHistoryErrorState
              error={error}
              onRetry={() => void refetch()}
            />
          ) : versions.length === 0 ? (
            <VersionHistoryEmptyState />
          ) : (
            <>
              {groupedVersions.map((group) => (
                <div key={group.dateGroup} className="space-y-2.5">
                  {/* Date Header */}
                  <div className="sticky top-0 z-10 -mx-3 bg-slate-50/95 px-3 py-1 backdrop-blur-xs">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                      {group.dateGroup}
                    </h3>
                  </div>

                  {/* Versions in Date Group */}
                  <div className="space-y-2.5">
                    {group.versions.map((version) => (
                      <VersionHistoryItem
                        key={version.id}
                        version={version}
                      />
                    ))}
                  </div>
                </div>
              ))}

              {/* Load Older Versions Pagination Control */}
              {hasNextPage && (
                <div className="pt-2 pb-4 text-center">
                  <button
                    type="button"
                    disabled={isFetchingNextPage}
                    onClick={() => void fetchNextPage()}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2.5 text-xs font-semibold text-gray-700 shadow-xs hover:bg-gray-50 disabled:opacity-50 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1"
                  >
                    {isFetchingNextPage ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                        <span>Loading older versions...</span>
                      </>
                    ) : (
                      <span>Load older versions</span>
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {/* Version Preview Modal */}
      {boardId && <VersionPreviewModal boardId={boardId} />}
    </>
  );
}
