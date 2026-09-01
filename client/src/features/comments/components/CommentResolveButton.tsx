import { Check } from "lucide-react";
import React from "react";

type CommentResolveButtonProps = {
  isResolved: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
};

export default function CommentResolveButton({
  isResolved,
  onToggle,
  disabled = false,
  className = "",
}: CommentResolveButtonProps): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      title={isResolved ? "Reopen thread" : "Mark thread as resolved"}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
        isResolved
          ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200 border border-emerald-300"
          : "bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300"
      } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"} ${className}`}
    >
      <Check
        className={`h-3.5 w-3.5 ${
          isResolved ? "text-emerald-700 stroke-[2.5]" : "text-gray-500"
        }`}
      />
      <span>{isResolved ? "Resolved" : "Resolve"}</span>
    </button>
  );
}
