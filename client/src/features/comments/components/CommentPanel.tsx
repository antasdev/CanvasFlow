import { X, MessageSquare, Layers, CheckCircle2 } from "lucide-react";
import React, { useMemo } from "react";

import { useCommentMutations } from "../hooks";
import { useCommentStore } from "../store";
import type { Comment } from "../types";

import CommentComposer from "./CommentComposer";
import CommentThread from "./CommentThread";

type CommentPanelProps = {
  boardId?: string;
  className?: string;
};

export default function CommentPanel({
  boardId,
  className = "",
}: CommentPanelProps): React.JSX.Element {
  const isPanelOpen = useCommentStore((state) => state.isPanelOpen);
  const togglePanel = useCommentStore((state) => state.togglePanel);
  const comments = useCommentStore((state) => state.comments);
  const activeThreadId = useCommentStore((state) => state.activeThreadId);
  const setActiveThreadId = useCommentStore((state) => state.setActiveThreadId);
  const selectedShapeId = useCommentStore((state) => state.selectedShapeId);
  const setSelectedShapeId = useCommentStore((state) => state.setSelectedShapeId);
  const filter = useCommentStore((state) => state.filter);
  const setFilter = useCommentStore((state) => state.setFilter);

  const {
    createComment,
    updateComment,
    resolveComment,
    deleteComment,
    isSubmitting,
  } = useCommentMutations(boardId);

  // Group comments into root threads and replies
  const { rootComments, repliesByParentId, totalOpenCount } = useMemo(() => {
    const roots: Comment[] = [];
    const replies: Record<string, Comment[]> = {};
    let openCount = 0;

    const allList = Object.values(comments).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    for (const c of allList) {
      if (!c.parentCommentId) {
        roots.push(c);
        if (!c.isResolved && !c.isDeleted) {
          openCount++;
        }
      } else {
        if (!replies[c.parentCommentId]) {
          replies[c.parentCommentId] = [];
        }
        replies[c.parentCommentId].push(c);
      }
    }

    return {
      rootComments: roots,
      repliesByParentId: replies,
      totalOpenCount: openCount,
    };
  }, [comments]);

  // Apply filters
  const filteredThreads = useMemo(() => {
    return rootComments.filter((root) => {
      // Shape filter if active
      if (selectedShapeId && root.shapeId !== selectedShapeId) {
        return false;
      }

      // Status filter
      if (filter === "open") return !root.isResolved;
      if (filter === "resolved") return root.isResolved;
      return true;
    });
  }, [rootComments, selectedShapeId, filter]);

  if (!isPanelOpen) {
    return <></>;
  }

  const handleCreateTopLevelComment = async (content: string): Promise<boolean> => {
    const result = await createComment({
      content,
      shapeId: selectedShapeId ?? null,
      parentCommentId: null,
    });
    return Boolean(result);
  };

  const handleReplyToThread = async (
    parentCommentId: string,
    content: string
  ): Promise<boolean> => {
    const parent = comments[parentCommentId];
    const result = await createComment({
      content,
      shapeId: parent?.shapeId ?? null,
      parentCommentId,
    });
    return Boolean(result);
  };

  return (
    <aside
      className={`fixed right-0 top-0 z-30 flex h-screen w-80 sm:w-96 flex-col border-l border-gray-200 bg-slate-50 shadow-2xl transition-all duration-200 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-blue-600" />
          <h2 className="font-semibold text-gray-900 text-sm">Comments</h2>
          {totalOpenCount > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800">
              {totalOpenCount} open
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => togglePanel(false)}
          className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Filter Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-3 pt-2">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`flex-1 border-b-2 pb-2 text-xs font-medium transition-colors ${
            filter === "all"
              ? "border-blue-600 text-blue-600 font-semibold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setFilter("open")}
          className={`flex-1 border-b-2 pb-2 text-xs font-medium transition-colors ${
            filter === "open"
              ? "border-blue-600 text-blue-600 font-semibold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Open
        </button>
        <button
          type="button"
          onClick={() => setFilter("resolved")}
          className={`flex-1 border-b-2 pb-2 text-xs font-medium transition-colors ${
            filter === "resolved"
              ? "border-blue-600 text-blue-600 font-semibold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Resolved
        </button>
      </div>

      {/* Shape Context Filter Banner */}
      {selectedShapeId && (
        <div className="flex items-center justify-between bg-blue-50 px-3.5 py-2 text-xs border-b border-blue-100 text-blue-800">
          <div className="flex items-center gap-1.5 font-medium">
            <Layers className="h-3.5 w-3.5 text-blue-600" />
            <span>Filtering by selected shape</span>
          </div>
          <button
            type="button"
            onClick={() => setSelectedShapeId(null)}
            className="text-[11px] font-semibold text-blue-700 underline hover:text-blue-900 cursor-pointer"
          >
            Show all
          </button>
        </div>
      )}

      {/* Main Composer Area */}
      <div className="p-3 bg-white border-b border-gray-200">
        <CommentComposer
          placeholder={
            selectedShapeId
              ? "Add a comment to this shape..."
              : "Add a comment to the board..."
          }
          shapeId={selectedShapeId}
          onSubmit={handleCreateTopLevelComment}
          isSubmitting={isSubmitting}
        />
      </div>

      {/* Threads List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {filteredThreads.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center text-gray-400 p-4">
            {filter === "resolved" ? (
              <>
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-2" />
                <p className="text-sm font-medium text-gray-600">No resolved comments</p>
                <p className="text-xs text-gray-400 mt-1">
                  Resolved threads will appear here.
                </p>
              </>
            ) : selectedShapeId ? (
              <>
                <Layers className="h-8 w-8 text-blue-300 mb-2" />
                <p className="text-sm font-medium text-gray-600">No comments on this shape</p>
                <p className="text-xs text-gray-400 mt-1">
                  Use the composer above to attach the first comment.
                </p>
              </>
            ) : (
              <>
                <MessageSquare className="h-8 w-8 text-gray-300 mb-2" />
                <p className="text-sm font-medium text-gray-600">No comments yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  Start a discussion by adding a comment above.
                </p>
              </>
            )}
          </div>
        ) : (
          filteredThreads.map((root) => (
            <CommentThread
              key={root.id}
              rootComment={root}
              replies={repliesByParentId[root.id] ?? []}
              onReply={handleReplyToThread}
              onUpdate={async (id, content) => void updateComment(id, { content })}
              onDelete={async (id) => void deleteComment(id)}
              onResolve={async (id, isResolved) => void resolveComment(id, isResolved)}
              isSelected={activeThreadId === root.id}
              onSelect={() => setActiveThreadId(root.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
