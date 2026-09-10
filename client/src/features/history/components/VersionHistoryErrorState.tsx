import { AlertCircle, RefreshCw } from "lucide-react";
import React from "react";

export interface VersionHistoryErrorStateProps {
  error?: Error | null;
  onRetry: () => void;
}

export function VersionHistoryErrorState({
  error,
  onRetry,
}: VersionHistoryErrorStateProps): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-64 p-6 text-center text-gray-600">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600 mb-3 border border-red-100">
        <AlertCircle className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-gray-900">
        Unable to load version history
      </h3>
      <p className="mt-1 text-xs text-gray-500 max-w-xs leading-relaxed">
        {error instanceof Error
          ? error.message
          : "An unexpected error occurred while fetching versions."}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 cursor-pointer"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        <span>Try again</span>
      </button>
    </div>
  );
}
