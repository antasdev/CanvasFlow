import React from "react";
import { MessageSquare } from "lucide-react";

type CommentBadgeProps = {
  x: number;
  y: number;
  count: number;
  hasUnresolved: boolean;
  onClick: (e: React.MouseEvent) => void;
};

export default function CommentBadge({
  x,
  y,
  count,
  hasUnresolved,
  onClick,
}: CommentBadgeProps): React.JSX.Element {
  if (count <= 0) return <></>;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        left: `${x}px`,
        top: `${y}px`,
        transform: "translate(-50%, -50%)",
      }}
      title={`${count} comment${count === 1 ? "" : "s"} attached to this shape`}
      className={`absolute z-10 flex h-6 min-w-6 items-center justify-center gap-1 rounded-full px-1.5 text-[11px] font-bold shadow-md transition-transform hover:scale-110 cursor-pointer pointer-events-auto border ${
        hasUnresolved
          ? "bg-blue-600 text-white border-blue-400 hover:bg-blue-700"
          : "bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"
      }`}
    >
      <MessageSquare className="h-3 w-3" />
      <span>{count}</span>
    </button>
  );
}
