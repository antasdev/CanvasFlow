import { Send, Loader2 } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";

import { useMentionAutocomplete } from "../hooks/useMentionAutocomplete";
import type { CommentMention } from "../types";
import MentionListbox from "./MentionListbox";

export type CommentComposerProps = {
  placeholder?: string;
  shapeId?: string | null;
  workspaceId?: string;
  boardId?: string;
  onSubmit: (content: string, mentions?: CommentMention[]) => Promise<boolean | void>;
  onCancel?: () => void;
  autoFocus?: boolean;
  isSubmitting?: boolean;
  className?: string;
};

const MAX_CHAR_COUNT = 2000;

export default function CommentComposer({
  placeholder = "Write a comment... (type @ to mention)",
  shapeId,
  workspaceId,
  boardId,
  onSubmit,
  onCancel,
  autoFocus = false,
  isSubmitting = false,
  className = "",
}: CommentComposerProps): React.JSX.Element {
  const [content, setContent] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const autocomplete = useMentionAutocomplete({
    content,
    onChangeContent: setContent,
    workspaceId,
    boardId,
    textareaRef,
  });

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

    const result = await onSubmit(trimmed, autocomplete.mentions);
    if (result !== false) {
      setContent("");
      autocomplete.setMentions([]);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>): void => {
    if (autocomplete.handleKeyDown(e)) {
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      onCancel?.();
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      void handleSubmit();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
      return;
    }
  };

  const remaining = MAX_CHAR_COUNT - content.length;
  const isOverLimit = remaining < 0;
  const canSubmit = content.trim().length > 0 && !isOverLimit && !isSubmitting;

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className={`relative rounded-xl border border-gray-200 bg-white p-3 shadow-xs transition-all focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-500/20 ${className}`}
    >
      {/* Mention Autocomplete Listbox */}
      <MentionListbox
        isOpen={autocomplete.isOpen}
        searchQuery={autocomplete.searchQuery}
        selectedIndex={autocomplete.selectedIndex}
        members={autocomplete.matchingMembers}
        isLoading={autocomplete.isLoading}
        onSelect={autocomplete.selectMember}
      />

      {shapeId && (
        <div className="mb-2 flex items-center gap-1.5 text-xs text-blue-600 font-medium">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-blue-500" aria-hidden="true" />
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
        aria-label="Comment content"
        aria-autocomplete="list"
        aria-expanded={autocomplete.isOpen}
        aria-controls="mention-listbox"
        className="w-full resize-none border-0 p-0 text-xs sm:text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0 disabled:bg-transparent"
      />

      <div className="mt-2 flex items-center justify-between border-t border-gray-100 pt-2 text-xs">
        <div className="flex items-center gap-2 text-gray-400">
          <span
            className={
              isOverLimit
                ? "text-red-600 font-semibold"
                : remaining < 100
                ? "text-amber-600 font-medium"
                : "text-gray-400"
            }
            aria-live="polite"
          >
            {content.length}/{MAX_CHAR_COUNT}
          </span>
          <span className="hidden sm:inline text-gray-300">|</span>
          <span className="hidden sm:inline text-[11px] text-gray-400">
            Press <kbd className="rounded bg-gray-100 px-1 py-0.5 font-sans text-gray-500">Enter</kbd> to send
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          {onCancel && (
            <button
              type="button"
              aria-label="Cancel comment"
              onClick={onCancel}
              disabled={isSubmitting}
              className="rounded-lg px-2.5 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-1 focus:ring-gray-300 cursor-pointer"
            >
              Cancel
            </button>
          )}

          <button
            type="submit"
            aria-label="Send comment"
            disabled={!canSubmit}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              canSubmit
                ? "bg-blue-600 text-white shadow-xs hover:bg-blue-700 cursor-pointer"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-white" aria-hidden="true" />
                <span>Sending...</span>
              </>
            ) : (
              <>
                <span>Comment</span>
                <Send className="h-3 w-3" aria-hidden="true" />
              </>
            )}
          </button>
        </div>
      </div>
    </form>
  );
}
