import { Check, Loader2 } from "lucide-react";
import React from "react";

export type CommentResolveButtonProps = {
  isResolved: boolean;
  onToggle: () => void;
  disabled?: boolean;
  isLoading?: boolean;
  className?: string;
};

export default function CommentResolveButton({
  isResolved,
  onToggle,
  disabled = false,
  isLoading = false,
  className = "",
}: CommentResolveButtonProps): React.JSX.Element {
  const accessibleLabel = isResolved
    ? "Reopen comment thread"
    : "Resolve comment thread";

  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled || isLoading}
      aria-label={accessibleLabel}
      title={accessibleLabel}
      className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 ${
        isResolved
          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300/80 shadow-2xs"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300/80"
      } ${disabled || isLoading ? "opacity-60 cursor-not-allowed" : "cursor-pointer"} ${className}`}
    >
      {isLoading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin text-gray-600" aria-hidden="true" />
      ) : isResolved ? (
        <Check className="h-3.5 w-3.5 text-emerald-700 stroke-[2.5]" aria-hidden="true" />
      ) : (
        <Check className="h-3.5 w-3.5 text-gray-500" aria-hidden="true" />
      )}
      <span>{isResolved ? "Resolved" : "Resolve"}</span>
    </button>
  );
}
