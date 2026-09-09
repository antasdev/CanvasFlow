import { Edit2, Trash2, MoreVertical } from "lucide-react";
import React, { useState, useRef, useEffect } from "react";

import { getCursorColor } from "@/features/canvas/utils/cursor.utils";
import { useAuthStore } from "@/store";

import { useMentionAutocomplete } from "../hooks/useMentionAutocomplete";
import type { Comment, CommentMention } from "../types";
import MentionListbox from "./MentionListbox";

export type CommentItemProps = {
  comment: Comment;
  workspaceId?: string;
  boardId?: string;
  onUpdate?: (
    commentId: string,
    content: string,
    mentions?: CommentMention[]
  ) => Promise<void | unknown>;
  onDelete?: (commentId: string) => Promise<void | unknown>;
  isReply?: boolean;
  className?: string;
};

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (isNaN(diffInSeconds) || diffInSeconds < 30) return "just now";
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return "";
  }
}

/**
 * Safely renders comment content with structured mention badges and screen-reader labels.
 */
export function renderCommentContent(
  content: string,
  mentions?: CommentMention[]
): React.ReactNode {
  if (!content) return null;
  if (!mentions || mentions.length === 0) {
    return content;
  }

  // Sort mentions by startIndex
  const sorted = [...mentions].sort((a, b) => a.startIndex - b.startIndex);
  const elements: React.ReactNode[] = [];
  let lastIndex = 0;

  for (let i = 0; i < sorted.length; i++) {
    const m = sorted[i];

    // Out of bounds safety check
    if (
      m.startIndex < lastIndex ||
      m.endIndex > content.length ||
      m.startIndex >= m.endIndex
    ) {
      continue;
    }

    // Push text before this mention
    if (m.startIndex > lastIndex) {
      elements.push(content.slice(lastIndex, m.startIndex));
    }

    // Push styled mention badge
    elements.push(
      <span
        key={`mention-${m.userId}-${m.startIndex}-${i}`}
        className="inline-flex items-center px-1.5 py-0.5 rounded-md text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/60 mx-0.5 align-baseline"
        aria-label={`Mentioned user ${m.displayName}`}
      >
        @{m.displayName}
      </span>
    );

    lastIndex = m.endIndex;
  }

  // Push remaining text
  if (lastIndex < content.length) {
    elements.push(content.slice(lastIndex));
  }

  return elements;
}

export default function CommentItem({
  comment,
  workspaceId,
  boardId,
  onUpdate,
  onDelete,
  isReply = false,
  className = "",
}: CommentItemProps): React.JSX.Element {
  const currentUser = useAuthStore((state) => state.user);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(comment.content);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const editTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  const autocomplete = useMentionAutocomplete({
    content: editContent,
    onChangeContent: setEditContent,
    workspaceId,
    boardId: boardId || comment.boardId,
    textareaRef: editTextareaRef,
    initialMentions: comment.mentions || [],
  });

  const isAuthor = currentUser?.id === comment.authorId;
  const avatarColor = getCursorColor(comment.authorId);
  const authorName = comment.author?.fullName ?? (isAuthor ? "You" : "Collaborator");
  const authorInitials = authorName
    .split(" ")
    .map((n: string) => n[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  // Focus management: when entering edit mode, focus textarea; when closing, restore focus to menu button
  useEffect(() => {
    if (isEditing) {
      editTextareaRef.current?.focus();
    }
  }, [isEditing]);

  const handleCancelEdit = (): void => {
    setIsEditing(false);
    setEditContent(comment.content);
    // Restore focus
    setTimeout(() => {
      menuButtonRef.current?.focus();
    }, 0);
  };

  const handleSaveEdit = async (): Promise<void> => {
    const trimmed = editContent.trim();
    if (!trimmed || !onUpdate || isSubmitting) return;

    setIsSubmitting(true);
    try {
      await onUpdate(comment.id, trimmed, autocomplete.mentions);
      setIsEditing(false);
      setTimeout(() => {
        menuButtonRef.current?.focus();
      }, 0);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!onDelete || isSubmitting) return;
    setIsMenuOpen(false);
    setIsSubmitting(true);
    try {
      await onDelete(comment.id);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className={`group relative flex gap-2.5 text-sm ${
        isReply ? "pl-3 text-xs" : ""
      } ${className}`}
    >
      {/* Avatar */}
      <div
        style={{ backgroundColor: avatarColor }}
        aria-hidden="true"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-xs"
      >
        {authorInitials || "U"}
      </div>

      {/* Content Body */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="font-semibold text-gray-900 text-xs">
              {authorName}
            </span>
            <time
              dateTime={comment.createdAt}
              className="text-[10px] text-gray-400"
              title={new Date(comment.createdAt).toLocaleString()}
            >
              {formatRelativeTime(comment.createdAt)}
            </time>
            {comment.isEdited && !comment.isDeleted && (
              <span className="text-[10px] text-gray-400 italic" aria-label="Comment has been edited">
                (edited)
              </span>
            )}
            {comment.isOptimistic && (
              <span className="text-[10px] text-blue-500 italic" aria-label="Comment is sending">
                (sending...)
              </span>
            )}
          </div>

          {/* Action Menu for Author */}
          {isAuthor && !comment.isDeleted && !isEditing && (
            <div className="relative">
              <button
                ref={menuButtonRef}
                type="button"
                aria-label="More comment options"
                aria-expanded={isMenuOpen}
                onClick={() => setIsMenuOpen(!isMenuOpen)}
                className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
              </button>

              {isMenuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-20"
                    onClick={() => setIsMenuOpen(false)}
                  />
                  <div
                    role="menu"
                    aria-label="Comment actions"
                    className="absolute right-0 top-full z-30 mt-1 w-28 rounded-md bg-white py-1 shadow-lg ring-1 ring-black/5"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      aria-label="Edit comment"
                      onClick={() => {
                        setEditContent(comment.content);
                        autocomplete.setMentions(comment.mentions || []);
                        setIsEditing(true);
                        setIsMenuOpen(false);
                      }}
                      className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none cursor-pointer"
                    >
                      <Edit2 className="h-3 w-3" aria-hidden="true" />
                      <span>Edit</span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      aria-label="Delete comment"
                      onClick={() => void handleDelete()}
                      className="flex w-full items-center gap-1.5 px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 focus:bg-red-50 focus:outline-none cursor-pointer"
                    >
                      <Trash2 className="h-3 w-3" aria-hidden="true" />
                      <span>Delete</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        {/* Comment Content / Edit Textarea / Deleted Placeholder */}
        {comment.isDeleted ? (
          <div
            role="note"
            aria-label="Deleted comment"
            className="mt-1 text-xs italic text-gray-400 bg-gray-50 rounded p-1.5 border border-gray-100"
          >
            This comment was deleted.
          </div>
        ) : isEditing ? (
          <div className="relative mt-1.5">
            {/* Autocomplete Listbox in editing mode */}
            <MentionListbox
              isOpen={autocomplete.isOpen}
              searchQuery={autocomplete.searchQuery}
              selectedIndex={autocomplete.selectedIndex}
              members={autocomplete.matchingMembers}
              isLoading={autocomplete.isLoading}
              onSelect={autocomplete.selectMember}
            />

            <textarea
              ref={editTextareaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => {
                if (autocomplete.handleKeyDown(e)) {
                  return;
                }

                if (e.key === "Escape") {
                  e.preventDefault();
                  handleCancelEdit();
                  return;
                }
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  void handleSaveEdit();
                  return;
                }
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void handleSaveEdit();
                  return;
                }
              }}
              rows={2}
              maxLength={2000}
              aria-label="Edit comment content"
              aria-autocomplete="list"
              aria-expanded={autocomplete.isOpen}
              aria-controls="mention-listbox"
              className="w-full rounded border border-blue-400 p-2 text-xs text-gray-900 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
            />
            <div className="mt-1.5 flex justify-end gap-1.5">
              <button
                type="button"
                aria-label="Cancel editing comment"
                onClick={handleCancelEdit}
                disabled={isSubmitting}
                className="rounded px-2.5 py-1 text-xs text-gray-500 hover:bg-gray-100 focus:outline-none focus:ring-1 focus:ring-gray-300 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                aria-label="Save comment edit"
                onClick={() => void handleSaveEdit()}
                disabled={isSubmitting || !editContent.trim()}
                className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
              >
                {isSubmitting ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-1 whitespace-pre-wrap break-words text-gray-800 text-xs leading-relaxed">
            {renderCommentContent(comment.content, comment.mentions)}
          </p>
        )}
      </div>
    </div>
  );
}
