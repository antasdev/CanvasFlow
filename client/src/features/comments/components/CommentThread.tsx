import { MessageSquareReply } from "lucide-react";
import React, { useState } from "react";

import type { Comment } from "../types";

import CommentItem from "./CommentItem";
import CommentReplyComposer from "./CommentReplyComposer";
import CommentResolveButton from "./CommentResolveButton";

type CommentThreadProps = {
  rootComment: Comment;
  replies: Comment[];
  onReply: (parentCommentId: string, content: string) => Promise<boolean | void>;
  onUpdate: (commentId: string, content: string) => Promise<void | unknown>;
  onDelete: (commentId: string) => Promise<void | unknown>;
  onResolve: (commentId: string, isResolved: boolean) => Promise<void | unknown>;
  isSelected?: boolean;
  onSelect?: () => void;
  className?: string;
};

export default function CommentThread({
  rootComment,
  replies,
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

  const handleReplySubmit = async (content: string): Promise<boolean> => {
    setIsSubmittingReply(true);
    try {
      const result = await onReply(rootComment.id, content);
      if (result !== false) {
        setIsReplying(false);
        return true;
      }
      return false;
    } finally {
      setIsSubmittingReply(false);
    }
  };

  return (
    <div
      onClick={onSelect}
      className={`rounded-xl border transition-all ${
        isSelected
          ? "border-blue-500 bg-blue-50/30 shadow-md ring-1 ring-blue-500"
          : rootComment.isResolved
          ? "border-gray-200 bg-gray-50/60 opacity-80"
          : "border-gray-200 bg-white shadow-sm hover:border-gray-300"
      } p-3.5 ${className}`}
    >
      {/* Top Bar with Thread Status and Resolve Button */}
      <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-gray-100 pb-2">
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          {rootComment.shapeId && (
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-600 border border-blue-200">
              Attached to Shape
            </span>
          )}
          {replies.length > 0 && (
            <span className="text-[11px] text-gray-400">
              {replies.length} {replies.length === 1 ? "reply" : "replies"}
            </span>
          )}
        </div>

        <CommentResolveButton
          isResolved={rootComment.isResolved}
          onToggle={() => void onResolve(rootComment.id, !rootComment.isResolved)}
        />
      </div>

      {/* Root Comment */}
      <CommentItem
        comment={rootComment}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />

      {/* Indented Replies */}
      {replies.length > 0 && (
        <div className="mt-3 space-y-2.5 border-l-2 border-gray-100 pl-3">
          {replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              onUpdate={onUpdate}
              onDelete={onDelete}
              isReply
            />
          ))}
        </div>
      )}

      {/* Reply Button & Composer (Only if root is not deleted) */}
      {!rootComment.isDeleted && (
        <div className="mt-3">
          {isReplying ? (
            <CommentReplyComposer
              parentCommentId={rootComment.id}
              shapeId={rootComment.shapeId}
              onSubmit={handleReplySubmit}
              onCancel={() => setIsReplying(false)}
              isSubmitting={isSubmittingReply}
            />
          ) : (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsReplying(true);
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-blue-600 transition-colors cursor-pointer pl-9"
            >
              <MessageSquareReply className="h-3.5 w-3.5" />
              <span>Reply</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
