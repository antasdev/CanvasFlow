import { Check, MessageSquare } from "lucide-react";
import React, { useState } from "react";

import type { Comment } from "../types";

export type CommentMarkerProps = {
  comment: Comment;
  screenX: number;
  screenY: number;
  index?: number;
  isActive?: boolean;
  onSelect: (commentId: string) => void;
};

/**
 * Canvas-anchored comment marker pin.
 * Renders at converted screen coordinates with author indicator, resolved status,
 * active focus ring, and hover preview tooltip.
 * Strictly isolates its click events to prevent canvas shape selection.
 */
export default function CommentMarker({
  comment,
  screenX,
  screenY,
  index,
  isActive = false,
  onSelect,
}: CommentMarkerProps): React.JSX.Element {
  const [isHovered, setIsHovered] = useState(false);

  const authorName = comment.author?.fullName || "Collaborator";
  const authorInitial = authorName.charAt(0).toUpperCase();
  const snippet = comment.content.length > 60
    ? `${comment.content.slice(0, 60)}...`
    : comment.content;

  const handleClick = (e: React.MouseEvent): void => {
    e.stopPropagation();
    onSelect(comment.id);
  };

  const handleKeyDown = (e: React.KeyboardEvent): void => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      onSelect(comment.id);
    }
  };

  return (
    <div
      style={{
        left: `${screenX}px`,
        top: `${screenY}px`,
        transform: "translate(-50%, -100%)",
      }}
      className={`absolute z-20 pointer-events-auto transition-transform duration-150 select-none ${
        isActive ? "scale-110 z-30" : "hover:scale-105"
      }`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Marker Pin Button */}
      <button
        type="button"
        onClick={handleClick}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
        aria-pressed={isActive}
        aria-label={
          comment.isResolved
            ? `Resolved comment by ${authorName}: ${snippet}`
            : `Comment by ${authorName}: ${snippet}`
        }
        title={`Comment by ${authorName}`}
        className={`group relative flex h-8 min-w-8 items-center justify-center rounded-full px-1.5 text-xs font-bold shadow-lg transition-all focus:outline-none focus:ring-2 focus:ring-blue-400 cursor-pointer ${
          isActive
            ? "bg-blue-600 text-white ring-2 ring-blue-400 ring-offset-2 shadow-blue-500/40"
            : comment.isResolved
            ? "bg-emerald-600 text-white shadow-emerald-600/30"
            : "bg-gray-900 text-white hover:bg-blue-600 shadow-gray-900/30"
        }`}
      >
        {/* Author Avatar or Initial */}
        {comment.author?.avatar ? (
          <img
            src={comment.author.avatar}
            alt={authorName}
            className="h-5 w-5 rounded-full object-cover"
          />
        ) : comment.isResolved ? (
          <Check className="h-4 w-4 stroke-[3]" />
        ) : index !== undefined ? (
          <span>{index}</span>
        ) : (
          <span>{authorInitial}</span>
        )}

        {/* Pin Downward Pointer Arrow */}
        <div
          className={`absolute -bottom-1.5 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 rounded-xs transition-colors ${
            isActive
              ? "bg-blue-600"
              : comment.isResolved
              ? "bg-emerald-600"
              : "bg-gray-900 group-hover:bg-blue-600"
          }`}
        />
      </button>

      {/* Hover Preview Tooltip Card */}
      {isHovered && !isActive && (
        <div
          role="tooltip"
          className="absolute bottom-full left-1/2 mb-2 w-52 -translate-x-1/2 rounded-lg bg-gray-900/95 backdrop-blur-sm p-2.5 text-left text-white shadow-xl pointer-events-none animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center gap-1.5 mb-1 text-[11px] font-semibold text-gray-300">
            <MessageSquare className="h-3 w-3 text-blue-400" />
            <span className="truncate">{authorName}</span>
            {comment.isResolved && (
              <span className="ml-auto rounded bg-emerald-500/20 px-1 py-0.2 text-[9px] font-bold text-emerald-300">
                Resolved
              </span>
            )}
          </div>
          <p className="text-xs text-gray-100 line-clamp-2 leading-relaxed">
            {snippet || "No content"}
          </p>
        </div>
      )}
    </div>
  );
}
