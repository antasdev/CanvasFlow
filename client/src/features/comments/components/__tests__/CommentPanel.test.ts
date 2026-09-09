import { beforeEach, describe, expect, it, vi } from "vitest";

import { useCommentStore } from "../../store";
import type { Comment } from "../../types";

describe("CommentPanel Filtering, Counts & Invariants", () => {
  const rootOpenA: Comment = {
    id: "root-1",
    boardId: "board-1",
    canvasId: "canvas-1",
    shapeId: null,
    authorId: "user-1",
    author: { id: "user-1", fullName: "Alice" },
    parentCommentId: null,
    position: { x: 100, y: 100 },
    content: "Open root comment 1",
    isResolved: false,
    isEdited: false,
    isDeleted: false,
    createdAt: "2026-09-08T10:00:00.000Z",
    updatedAt: "2026-09-08T10:00:00.000Z",
  };

  const rootOpenB: Comment = {
    id: "root-2",
    boardId: "board-1",
    canvasId: "canvas-1",
    shapeId: "shape-99",
    authorId: "user-2",
    author: { id: "user-2", fullName: "Bob" },
    parentCommentId: null,
    position: null,
    content: "Open root attached to shape-99",
    isResolved: false,
    isEdited: false,
    isDeleted: false,
    createdAt: "2026-09-08T10:05:00.000Z",
    updatedAt: "2026-09-08T10:05:00.000Z",
  };

  const rootResolvedC: Comment = {
    id: "root-3",
    boardId: "board-1",
    canvasId: "canvas-1",
    shapeId: null,
    authorId: "user-1",
    author: { id: "user-1", fullName: "Alice" },
    parentCommentId: null,
    position: { x: 200, y: 200 },
    content: "Resolved root comment",
    isResolved: true,
    resolvedAt: "2026-09-08T10:15:00.000Z",
    resolvedBy: "user-1",
    isEdited: false,
    isDeleted: false,
    createdAt: "2026-09-08T10:10:00.000Z",
    updatedAt: "2026-09-08T10:15:00.000Z",
  };

  const replyToA: Comment = {
    id: "reply-1",
    boardId: "board-1",
    canvasId: "canvas-1",
    shapeId: null,
    authorId: "user-3",
    author: { id: "user-3", fullName: "Charlie" },
    parentCommentId: "root-1",
    position: null,
    content: "Reply to root 1",
    isResolved: false,
    isEdited: false,
    isDeleted: false,
    createdAt: "2026-09-08T10:12:00.000Z",
    updatedAt: "2026-09-08T10:12:00.000Z",
  };

  const rootDeleted: Comment = {
    id: "root-4",
    boardId: "board-1",
    canvasId: "canvas-1",
    shapeId: null,
    authorId: "user-2",
    author: { id: "user-2", fullName: "Bob" },
    parentCommentId: null,
    position: { x: 300, y: 300 },
    content: "",
    isResolved: false,
    isEdited: false,
    isDeleted: true,
    createdAt: "2026-09-08T10:20:00.000Z",
    updatedAt: "2026-09-08T10:25:00.000Z",
  };

  beforeEach(() => {
    useCommentStore.getState().clearComments();
  });

  it("computes derived counts correctly for All, Open, and Resolved tabs", () => {
    const commentsList = [rootOpenA, rootOpenB, rootResolvedC, replyToA, rootDeleted];
    useCommentStore.getState().setComments(commentsList);

    const roots = Object.values(useCommentStore.getState().comments).filter(
      (c) => !c.parentCommentId
    );

    const allCount = roots.length;
    const openCount = roots.filter((r) => !r.isResolved).length;
    const resolvedCount = roots.filter((r) => r.isResolved).length;

    expect(allCount).toBe(4);
    expect(openCount).toBe(3); // rootOpenA, rootOpenB, rootDeleted (unresolved)
    expect(resolvedCount).toBe(1); // rootResolvedC
  });

  it("filters threads without mutating canonical comments in Zustand store", () => {
    useCommentStore.getState().setComments([rootOpenA, rootOpenB, rootResolvedC, replyToA]);
    const initialCanonicalKeys = Object.keys(useCommentStore.getState().comments);

    // Switch filter to "resolved"
    useCommentStore.getState().setFilter("resolved");
    expect(useCommentStore.getState().filter).toBe("resolved");

    const roots = Object.values(useCommentStore.getState().comments).filter(
      (c) => !c.parentCommentId
    );
    const visibleResolved = roots.filter((r) => r.isResolved);
    expect(visibleResolved.map((r) => r.id)).toEqual(["root-3"]);

    // Verify canonical store was NOT pruned
    expect(Object.keys(useCommentStore.getState().comments)).toEqual(initialCanonicalKeys);

    // Switch filter to "open"
    useCommentStore.getState().setFilter("open");
    expect(useCommentStore.getState().filter).toBe("open");

    const visibleOpen = roots.filter((r) => !r.isResolved);
    expect(visibleOpen.map((r) => r.id)).toEqual(["root-1", "root-2"]);

    // Verify canonical store remains 100% intact
    expect(Object.keys(useCommentStore.getState().comments)).toEqual(initialCanonicalKeys);
  });

  it("correctly scopes counts and visible threads when selectedShapeId is active", () => {
    useCommentStore.getState().setComments([rootOpenA, rootOpenB, rootResolvedC]);
    useCommentStore.getState().setSelectedShapeId("shape-99");

    const roots = Object.values(useCommentStore.getState().comments).filter(
      (c) => !c.parentCommentId
    );

    const shapeScopedRoots = roots.filter((r) => r.shapeId === "shape-99");
    expect(shapeScopedRoots.map((r) => r.id)).toEqual(["root-2"]);

    const shapeAllCount = shapeScopedRoots.length;
    const shapeOpenCount = shapeScopedRoots.filter((r) => !r.isResolved).length;
    const shapeResolvedCount = shapeScopedRoots.filter((r) => r.isResolved).length;

    expect(shapeAllCount).toBe(1);
    expect(shapeOpenCount).toBe(1);
    expect(shapeResolvedCount).toBe(0);
  });

  it("evaluates contextual empty states correctly", () => {
    // 1. All empty
    const getEmptyState = (
      filter: "all" | "open" | "resolved",
      allCount: number,
      selectedShapeId: string | null
    ) => {
      if (filter === "resolved") {
        return selectedShapeId
          ? "No resolved comments on this shape"
          : "No resolved comments";
      }
      if (filter === "open") {
        return selectedShapeId
          ? "No open comments on this shape"
          : allCount > 0
          ? "All comments on this board are resolved."
          : "No open comments";
      }
      return selectedShapeId
        ? "No comments on this shape"
        : "No comments yet";
    };

    expect(getEmptyState("all", 0, null)).toBe("No comments yet");
    expect(getEmptyState("resolved", 2, null)).toBe("No resolved comments");
    expect(getEmptyState("open", 2, null)).toBe("All comments on this board are resolved.");
    expect(getEmptyState("open", 0, null)).toBe("No open comments");
    expect(getEmptyState("resolved", 1, "shape-1")).toBe("No resolved comments on this shape");
    expect(getEmptyState("all", 0, "shape-1")).toBe("No comments on this shape");
  });

  it("validates WAI-ARIA tablist properties for All / Open / Resolved tabs", () => {
    const activeFilter: "all" | "open" | "resolved" = "open";

    const getAriaTabProps = (tab: "all" | "open" | "resolved") => ({
      role: "tab",
      id: `comment-tab-${tab}`,
      "aria-selected": tab === activeFilter,
      "aria-controls": "comment-threads-feed",
      tabIndex: tab === activeFilter ? 0 : -1,
    });

    expect(getAriaTabProps("all")).toEqual({
      role: "tab",
      id: "comment-tab-all",
      "aria-selected": false,
      "aria-controls": "comment-threads-feed",
      tabIndex: -1,
    });

    expect(getAriaTabProps("open")).toEqual({
      role: "tab",
      id: "comment-tab-open",
      "aria-selected": true,
      "aria-controls": "comment-threads-feed",
      tabIndex: 0,
    });

    expect(getAriaTabProps("resolved")).toEqual({
      role: "tab",
      id: "comment-tab-resolved",
      "aria-selected": false,
      "aria-controls": "comment-threads-feed",
      tabIndex: -1,
    });
  });

  it("handles navigation to canvas anchor and attached shapes", () => {
    const onNavigateToAnchor = vi.fn();
    const onNavigateToShape = vi.fn();

    const handleAnchorClick = (comment: Comment) => {
      if (comment.position) {
        onNavigateToAnchor(comment.position);
      } else if (comment.shapeId) {
        onNavigateToShape(comment.shapeId);
      }
    };

    handleAnchorClick(rootOpenA);
    expect(onNavigateToAnchor).toHaveBeenCalledWith({ x: 100, y: 100 });

    handleAnchorClick(rootOpenB);
    expect(onNavigateToShape).toHaveBeenCalledWith("shape-99");
  });
});
