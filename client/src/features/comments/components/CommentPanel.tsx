import { X, MessageSquare, Layers, CheckCircle2 } from "lucide-react";
import React, { useMemo, useEffect, useRef } from "react";

import { useCommentMutations } from "../hooks";
import { useCommentStore } from "../store";
import type { Comment } from "../types";

import CommentComposer from "./CommentComposer";
import CommentThread from "./CommentThread";

export type CommentPanelProps = {
  boardId?: string;
  isLoading?: boolean;
  onNavigateToAnchor?: (position: { x: number; y: number }) => void;
  onNavigateToShape?: (shapeId: string) => void;
  className?: string;
};

export default function CommentPanel({
  boardId,
  isLoading = false,
  onNavigateToAnchor,
  onNavigateToShape,
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

  const threadListRef = useRef<HTMLDivElement | null>(null);

  const {
    createComment,
    updateComment,
    resolveComment,
    deleteComment,
    isSubmitting,
  } = useCommentMutations(boardId);

  // Group comments into root threads and replies
  const { rootComments, repliesByParentId } = useMemo(() => {
    const roots: Comment[] = [];
    const replies: Record<string, Comment[]> = {};

    const allList = Object.values(comments).sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    for (const c of allList) {
      if (!c.parentCommentId) {
        roots.push(c);
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
    };
  }, [comments]);

  // Derive counts scoped to active shape filter (if any)
  const { allCount, openCount, resolvedCount } = useMemo(() => {
    let all = 0;
    let open = 0;
    let resolved = 0;

    for (const root of rootComments) {
      if (selectedShapeId && root.shapeId !== selectedShapeId) {
        continue;
      }
      all++;
      if (root.isResolved) {
        resolved++;
      } else {
        open++;
      }
    }

    return { allCount: all, openCount: open, resolvedCount: resolved };
  }, [rootComments, selectedShapeId]);

  // Apply status and shape filters
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

  // Scroll active thread into view when activeThreadId changes
  useEffect(() => {
    if (activeThreadId) {
      const threadEl = document.getElementById(`comment-thread-${activeThreadId}`);
      if (threadEl) {
        threadEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }, [activeThreadId]);

  if (!isPanelOpen) {
    return <></>;
  }

  const handleCreateTopLevelComment = async (
    content: string,
    mentions?: import("../types").CommentMention[]
  ): Promise<boolean> => {
    const result = await createComment({
      content,
      mentions,
      shapeId: selectedShapeId ?? null,
      parentCommentId: null,
    });
    return Boolean(result);
  };

  const handleReplyToThread = async (
    parentCommentId: string,
    content: string,
    mentions?: import("../types").CommentMention[]
  ): Promise<boolean> => {
    const parent = comments[parentCommentId];
    const result = await createComment({
      content,
      mentions,
      shapeId: parent?.shapeId ?? null,
      parentCommentId,
    });
    return Boolean(result);
  };

  const handleSelectThread = (threadId: string): void => {
    setActiveThreadId(threadId);
    const root = comments[threadId];
    if (root) {
      if (root.position && onNavigateToAnchor) {
        onNavigateToAnchor(root.position);
      } else if (root.shapeId && onNavigateToShape) {
        onNavigateToShape(root.shapeId);
      }
    }
  };

  return (
    <aside
      role="region"
      aria-label="Comments Panel"
      className={`fixed right-0 top-0 z-30 flex h-screen w-full sm:w-96 max-w-full flex-col border-l border-gray-200 bg-slate-50 shadow-2xl transition-all duration-200 ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shrink-0">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-blue-600" aria-hidden="true" />
          <h2 className="font-semibold text-gray-900 text-sm">Comments</h2>
          {openCount > 0 && (
            <span
              className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-800"
              aria-label={`${openCount} open comments`}
            >
              {openCount} open
            </span>
          )}
        </div>

        <button
          type="button"
          aria-label="Close comments panel"
          onClick={() => togglePanel(false)}
          className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>

      {/* Filter Tabs */}
      <div
        role="tablist"
        aria-label="Comment status filter"
        className="flex border-b border-gray-200 bg-white px-3 pt-2 shrink-0"
      >
        <button
          type="button"
          role="tab"
          id="tab-all"
          aria-selected={filter === "all"}
          aria-controls="comment-threads-feed"
          aria-label={`All comments (${allCount})`}
          onClick={() => setFilter("all")}
          className={`flex-1 border-b-2 pb-2 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded-t ${
            filter === "all"
              ? "border-blue-600 text-blue-600 font-semibold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <span>All</span>
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              filter === "all"
                ? "bg-blue-100 text-blue-800 font-bold"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {allCount}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-open"
          aria-selected={filter === "open"}
          aria-controls="comment-threads-feed"
          aria-label={`Open comments (${openCount})`}
          onClick={() => setFilter("open")}
          className={`flex-1 border-b-2 pb-2 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded-t ${
            filter === "open"
              ? "border-blue-600 text-blue-600 font-semibold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <span>Open</span>
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              filter === "open"
                ? "bg-blue-100 text-blue-800 font-bold"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {openCount}
          </span>
        </button>
        <button
          type="button"
          role="tab"
          id="tab-resolved"
          aria-selected={filter === "resolved"}
          aria-controls="comment-threads-feed"
          aria-label={`Resolved comments (${resolvedCount})`}
          onClick={() => setFilter("resolved")}
          className={`flex-1 border-b-2 pb-2 text-xs font-medium transition-colors cursor-pointer flex items-center justify-center gap-1.5 focus:outline-none focus:ring-1 focus:ring-blue-500 rounded-t ${
            filter === "resolved"
              ? "border-blue-600 text-blue-600 font-semibold"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          <span>Resolved</span>
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] ${
              filter === "resolved"
                ? "bg-blue-100 text-blue-800 font-bold"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {resolvedCount}
          </span>
        </button>
      </div>

      {/* Shape Context Filter Banner */}
      {selectedShapeId && (
        <div
          role="status"
          className="flex items-center justify-between bg-blue-50 px-3.5 py-2 text-xs border-b border-blue-100 text-blue-800 shrink-0"
        >
          <div className="flex items-center gap-1.5 font-medium">
            <Layers className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
            <span>Filtering by selected shape</span>
          </div>
          <button
            type="button"
            aria-label="Clear shape filter and show all comments"
            onClick={() => setSelectedShapeId(null)}
            className="text-[11px] font-semibold text-blue-700 underline hover:text-blue-900 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-500 rounded"
          >
            Show all
          </button>
        </div>
      )}

      {/* Main Composer Area */}
      <div className="p-3 bg-white border-b border-gray-200 shrink-0">
        <CommentComposer
          boardId={boardId}
          placeholder={
            selectedShapeId
              ? "Add a comment to this shape... (type @ to mention)"
              : "Add a comment to the board... (type @ to mention)"
          }
          shapeId={selectedShapeId}
          onSubmit={handleCreateTopLevelComment}
          isSubmitting={isSubmitting}
        />
      </div>

      {/* Threads List */}
      <div
        id="comment-threads-feed"
        ref={threadListRef}
        tabIndex={0}
        aria-label="Comment threads list"
        className="flex-1 overflow-y-auto p-3 space-y-3 focus:outline-none focus:ring-1 focus:ring-blue-400/50"
      >
        {isLoading ? (
          /* Loading Skeletons */
          <div className="space-y-3" role="status" aria-label="Loading comments">
            {[1, 2, 3].map((n) => (
              <div
                key={`comment-skeleton-${n}`}
                className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-xs animate-pulse space-y-2.5"
              >
                <div className="flex items-center gap-2">
                  <div className="h-7 w-7 rounded-full bg-gray-200" />
                  <div className="space-y-1 flex-1">
                    <div className="h-3.5 w-24 bg-gray-200 rounded" />
                    <div className="h-2.5 w-16 bg-gray-100 rounded" />
                  </div>
                </div>
                <div className="space-y-1.5 pt-1">
                  <div className="h-3 w-full bg-gray-200 rounded" />
                  <div className="h-3 w-4/5 bg-gray-100 rounded" />
                </div>
              </div>
            ))}
            <span className="sr-only">Loading comments...</span>
          </div>
        ) : filteredThreads.length === 0 ? (
          /* Empty States */
          <div className="flex flex-col items-center justify-center h-48 text-center text-gray-400 p-4">
            {filter === "resolved" ? (
              <>
                <CheckCircle2 className="h-8 w-8 text-emerald-400 mb-2" aria-hidden="true" />
                <p className="text-sm font-medium text-gray-700">
                  {selectedShapeId ? "No resolved comments on this shape" : "No resolved comments"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  Resolved conversations will appear here.
                </p>
              </>
            ) : filter === "open" ? (
              <>
                <MessageSquare className="h-8 w-8 text-blue-300 mb-2" aria-hidden="true" />
                <p className="text-sm font-medium text-gray-700">
                  {selectedShapeId ? "No open comments on this shape" : "No open comments"}
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  {allCount > 0
                    ? "All comments are resolved."
                    : "Start a conversation by using the Comment tool or pressing C."}
                </p>
              </>
            ) : selectedShapeId ? (
              <>
                <Layers className="h-8 w-8 text-blue-300 mb-2" aria-hidden="true" />
                <p className="text-sm font-medium text-gray-700">No comments on this shape</p>
                <p className="text-xs text-gray-400 mt-1">
                  Use the composer above to attach the first comment.
                </p>
              </>
            ) : (
              <>
                <MessageSquare className="h-8 w-8 text-gray-300 mb-2" aria-hidden="true" />
                <p className="text-sm font-medium text-gray-700">No comments yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  Start a conversation by using the Comment tool or pressing C.
                </p>
              </>
            )}
          </div>
        ) : (
          filteredThreads.map((root) => (
            <CommentThread
              key={root.id}
              boardId={boardId}
              rootComment={root}
              replies={repliesByParentId[root.id] ?? []}
              onReply={handleReplyToThread}
              onUpdate={async (id, content, mentions) =>
                void updateComment(id, { content, mentions })
              }
              onDelete={async (id) => void deleteComment(id)}
              onResolve={async (id, isResolved) => void resolveComment(id, isResolved)}
              isSelected={activeThreadId === root.id}
              onSelect={() => handleSelectThread(root.id)}
            />
          ))
        )}
      </div>
    </aside>
  );
}
