import { History } from "lucide-react";
import React from "react";

export function VersionHistoryEmptyState(): React.JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center h-64 p-6 text-center text-gray-500">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-50 text-blue-600 mb-3 border border-blue-100">
        <History className="h-6 w-6" aria-hidden="true" />
      </div>
      <h3 className="text-sm font-semibold text-gray-900">No versions yet</h3>
      <p className="mt-1 text-xs text-gray-500 max-w-xs leading-relaxed">
        Historical versions are saved as you collaborate on this board. Checkpoints will appear here chronologically.
      </p>
    </div>
  );
}
