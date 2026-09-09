import { MessageSquareReply } from "lucide-react";
import React, { useState } from "react";

import type { Comment, CommentMention } from "../types";

import CommentItem from "./CommentItem";
import CommentReplyComposer from "./CommentReplyComposer";
import CommentResolveButton from "./CommentResolveButton";

export type CommentThreadProps = {
  rootComment: Comment;
  replies: Comment[];
  workspaceId?: string;
  boardId?: string;
  onReply: (
    parentCommentId: string,
    content: string,
    mentions?: CommentMention[]
  ) => Promise<boolean | void>;
  onUpdate: (
    commentId: string,
    content: string,
    mentions?: CommentMention[]
  ) => Promise<void | unknown>;
  onDelete: (commentId: string) => Promise<void | unknown>;
  onResolve: (commentId: string, isResolved: boolean) => Promise<void | unknown>;
  isSelected?: boolean;
  onSelect?: () => void;
  className?: string;
};

export default function CommentThread({
  rootComment,
  replies,
  workspaceId,
  boardId,
  onReply,
  onUpdate,
  onDelete,
  onResolve,
  isSelected = false,
  onSelect,
  className = "",
}: CommentThreadProps): React.JSX.Element {
  const [isReplying, setIsReplying] = useState(false);
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  // Deterministic reply ordering: createdAt ascending
  const sortedReplies = React.useMemo(() => {
    return [...replies].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [replies]);

  const handleReplySubmit = async (
    content: string,
    mentions?: CommentMention[]
  ): Promise<boolean> => {
    setIsSubmittingReply(true);
    try {
      const result = await onReply(rootComment.id, content, mentions);
      if (result !== false) {
        setIsReplying(false);
        return true;
      }
      return false;
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const authorName = rootComment.author?.fullName || "Collaborator";

  return (
    <article
      id={`comment-thread-${rootComment.id}`}
      role="article"
      aria-label={`Comment thread by ${authorName}${rootComment.isResolved ? " (Resolved)" : ""}`}
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" && e.target === e.currentTarget) {
          onSelect?.();
        }
      }}
      className={`rounded-xl border transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer ${
        isSelected
          ? "border-blue-500 bg-blue-50/40 shadow-md ring-1 ring-blue-500"
          : rootComment.isResolved
          ? "border-gray-200 bg-gray-50/80 opacity-90 hover:border-gray-300"
          : "border-gray-200 bg-white shadow-xs hover:border-gray-300 hover:shadow-sm"
      } p-3.5 ${className}`}
    >
      {/* Top Bar with Thread Status and Resolve Button */}
      <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-gray-100 pb-2">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          {rootComment.shapeId ? (
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 border border-blue-200">
              Attached to Shape
            </span>
          ) : rootComment.position ? (
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 border border-emerald-200">
              Canvas Anchor
            </span>
          ) : null}
          {replies.length > 0 && (
            <span
              className="text-[11px] text-gray-400 font-medium"
              aria-label={`${replies.length} ${replies.length === 1 ? "reply" : "replies"}`}
            >
              {replies.length} {replies.length === 1 ? "reply" : "replies"}
            </span>
          )}
        </div>

        <div onClick={(e) => e.stopPropagation()}>
          <CommentResolveButton
            isResolved={rootComment.isResolved}
            onToggle={() => void onResolve(rootComment.id, !rootComment.isResolved)}
          />
        </div>
      </div>

      {/* Root Comment */}
      <CommentItem
        comment={rootComment}
        workspaceId={workspaceId}
        boardId={boardId}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />

      {/* Indented Replies */}
      {sortedReplies.length > 0 && (
        <div
          role="feed"
          aria-label="Thread replies"
          className="mt-3 space-y-2.5 border-l-2 border-gray-100 pl-3"
        >
          {sortedReplies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              workspaceId={workspaceId}
              boardId={boardId}
              onUpdate={onUpdate}
              onDelete={onDelete}
              isReply
            />
          ))}
        </div>
      )}

      {/* Reply Button & Composer (Only if root is not deleted) */}
      {!rootComment.isDeleted && (
        <div className="mt-3" onClick={(e) => e.stopPropagation()}>
          {isReplying ? (
            <CommentReplyComposer
              parentCommentId={rootComment.id}
              shapeId={rootComment.shapeId}
              workspaceId={workspaceId}
              boardId={boardId}
              onSubmit={handleReplySubmit}
              onCancel={() => setIsReplying(false)}
              isSubmitting={isSubmittingReply}
            />
          ) : (
            <button
              type="button"
              aria-label={`Reply to ${authorName}'s thread`}
              onClick={(e) => {
                e.stopPropagation();
                setIsReplying(true);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-blue-600 transition-colors cursor-pointer pl-9 py-1 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <MessageSquareReply className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reply</span>
            </button>
          )}
        </div>
      )}
    </article>
  );
}
