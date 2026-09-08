import { Send, X, MessageSquare } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";

import type { CommentPosition } from "../types";

export type FloatingCommentComposerProps = {
  position: CommentPosition;
  screenX: number;
  screenY: number;
  onSubmit: (content: string) => Promise<boolean | void>;
  onCancel: () => void;
  isSubmitting?: boolean;
};

const MAX_CHAR_COUNT = 2000;

/**
 * Floating in-canvas composer positioned at a draft comment anchor coordinate.
 * Allows entering and posting a canvas-anchored comment thread.
 */
export default function FloatingCommentComposer({
  position: _position,
  screenX,
  screenY,
  onSubmit,
  onCancel,
  isSubmitting = false,
}: FloatingCommentComposerProps): React.JSX.Element {
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    // Focus textarea on mount
    textareaRef.current?.focus();
  }, []);

  const handleSubmit = async (e?: React.FormEvent): Promise<void> => {
    if (e) e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || isSubmitting || trimmed.length > MAX_CHAR_COUNT) {
      return;
    }

    const success = await onSubmit(trimmed);
    if (success) {
      setContent("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    // Stop propagation so global canvas shortcuts (like V, Delete, Space) do not trigger while typing
    e.stopPropagation();

    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const remaining = MAX_CHAR_COUNT - content.length;
  const isOverLimit = remaining < 0;
  const canSubmit = content.trim().length > 0 && !isOverLimit && !isSubmitting;

  return (
    <div
      style={{
        left: `${screenX}px`,
        top: `${screenY}px`,
      }}
      className="absolute z-40 pointer-events-auto select-none"
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Draft Pin Point Indicator */}
      <div className="relative -translate-x-1/2 -translate-y-full mb-1 flex items-center justify-center">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white shadow-lg ring-4 ring-blue-500/30 animate-bounce">
          <MessageSquare className="h-3.5 w-3.5" />
        </div>
        <div className="absolute -bottom-1 left-1/2 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-blue-600" />
      </div>

      {/* Floating Composer Card */}
      <div className="relative -translate-x-1/2 mt-2 w-72 sm:w-80 rounded-xl border border-gray-200/90 bg-white/95 backdrop-blur-md p-3 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
        <form onSubmit={(e) => void handleSubmit(e)}>
          {/* Header */}
          <div className="mb-2 flex items-center justify-between border-b border-gray-100 pb-1.5">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-800">
              <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
              <span>New Comment</span>
            </div>
            <button
              type="button"
              onClick={onCancel}
              aria-label="Cancel comment"
              className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Text Area */}
          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a comment..."
            rows={2}
            disabled={isSubmitting}
            maxLength={MAX_CHAR_COUNT + 50}
            className="w-full resize-none border-0 p-0 text-xs sm:text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 disabled:bg-transparent"
          />

          {/* Actions & Shortcut Helper */}
          <div className="mt-2.5 flex items-center justify-between border-t border-gray-100 pt-2 text-xs">
            <span
              className={
                isOverLimit
                  ? "text-[11px] text-red-600 font-medium"
                  : "text-[11px] text-gray-400"
              }
            >
              {content.length > 0 && `${content.length}/${MAX_CHAR_COUNT}`}
            </span>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={onCancel}
                disabled={isSubmitting}
                className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!canSubmit}
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-medium transition-all ${
                  canSubmit
                    ? "bg-blue-600 text-white shadow-sm hover:bg-blue-700 cursor-pointer"
                    : "bg-gray-100 text-gray-400 cursor-not-allowed"
                }`}
              >
                {isSubmitting ? (
                  <>
                    <div className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                    <span>Posting...</span>
                  </>
                ) : (
                  <>
                    <span>Post</span>
                    <Send className="h-3 w-3" />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
