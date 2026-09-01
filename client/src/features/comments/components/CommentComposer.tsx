import { Send } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";

type CommentComposerProps = {
  placeholder?: string;
  shapeId?: string | null;
  onSubmit: (content: string) => Promise<boolean | void>;
  onCancel?: () => void;
  autoFocus?: boolean;
  isSubmitting?: boolean;
  className?: string;
};

const MAX_CHAR_COUNT = 2000;

export default function CommentComposer({
  placeholder = "Write a comment...",
  shapeId,
  onSubmit,
  onCancel,
  autoFocus = false,
  isSubmitting = false,
  className = "",
}: CommentComposerProps): React.JSX.Element {
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (autoFocus && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [autoFocus]);

  const handleSubmit = async (e?: React.FormEvent): Promise<void> => {
    if (e) e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed || isSubmitting || trimmed.length > MAX_CHAR_COUNT) {
      return;
    }

    const result = await onSubmit(trimmed);
    if (result !== false) {
      setContent("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
    }
  };

  const remaining = MAX_CHAR_COUNT - content.length;
  const isOverLimit = remaining < 0;
  const canSubmit = content.trim().length > 0 && !isOverLimit && !isSubmitting;

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className={`rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-all focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500 ${className}`}
    >
      {shapeId && (
        <div className="mb-2 flex items-center gap-1.5 text-xs text-blue-600 font-medium">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" />
          <span>Attaching to shape</span>
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={2}
        disabled={isSubmitting}
        maxLength={MAX_CHAR_COUNT + 50}
        className="w-full resize-none border-0 p-0 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 disabled:bg-transparent"
      />

      <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-xs">
        <div className="flex items-center gap-2 text-gray-400">
          <span
            className={
              isOverLimit
                ? "text-red-600 font-medium"
                : remaining < 100
                ? "text-amber-600"
                : "text-gray-400"
            }
          >
            {content.length}/{MAX_CHAR_COUNT}
          </span>
          <span className="hidden sm:inline text-gray-300">|</span>
          <span className="hidden sm:inline flex items-center gap-1 text-gray-400">
            <kbd className="rounded bg-gray-100 px-1 py-0.5 text-[10px] font-sans text-gray-500">
              ⌘/Ctrl + ↵
            </kbd>{" "}
            to post
          </span>
        </div>

        <div className="flex items-center gap-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="rounded px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              canSubmit
                ? "bg-blue-600 text-white shadow hover:bg-blue-700 cursor-pointer"
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
                <span>Comment</span>
                <Send className="h-3 w-3" />
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
