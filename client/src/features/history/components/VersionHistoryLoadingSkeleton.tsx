import React from "react";

export function VersionHistoryLoadingSkeleton(): React.JSX.Element {
  return (
    <div
      className="space-y-4 p-4"
      role="status"
      aria-label="Loading version history"
    >
      {[1, 2, 3, 4].map((n) => (
        <div
          key={`history-skeleton-${n}`}
          className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-xs animate-pulse space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="h-4 w-20 bg-gray-200 rounded" />
              <div className="h-4 w-12 bg-gray-100 rounded-full" />
            </div>
            <div className="h-3.5 w-14 bg-gray-200 rounded" />
          </div>

          <div className="space-y-1.5 pt-0.5">
            <div className="h-3 w-3/4 bg-gray-200 rounded" />
            <div className="h-2.5 w-1/2 bg-gray-100 rounded" />
          </div>

          <div className="flex items-center gap-2 pt-1">
            <div className="h-5 w-16 bg-gray-100 rounded" />
            <div className="h-5 w-16 bg-gray-100 rounded" />
          </div>
        </div>
      ))}
      <span className="sr-only">Loading version history...</span>
    </div>
  );
}
