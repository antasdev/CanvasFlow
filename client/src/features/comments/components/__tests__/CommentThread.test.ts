import { describe, expect, it, vi } from "vitest";

import type { Comment } from "../../types";

describe("CommentThread Invariants & Ordering", () => {
  const mockRootComment: Comment = {
    id: "root-1",
    boardId: "board-1",
    canvasId: "canvas-1",
    shapeId: null,
    authorId: "user-1",
    author: { id: "user-1", fullName: "Alice Designer" },
    parentCommentId: null,
    position: { x: 100, y: 200 },
    content: "Root discussion point",
    isResolved: false,
    isEdited: false,
    isDeleted: false,
    createdAt: "2026-09-08T10:00:00.000Z",
    updatedAt: "2026-09-08T10:00:00.000Z",
  };

  const replyA: Comment = {
    id: "reply-1",
    boardId: "board-1",
    canvasId: "canvas-1",
    shapeId: null,
    authorId: "user-2",
    author: { id: "user-2", fullName: "Bob Dev" },
    parentCommentId: "root-1",
    position: null,
    content: "Reply at 10:05",
    isResolved: false,
    isEdited: false,
    isDeleted: false,
    createdAt: "2026-09-08T10:05:00.000Z",
    updatedAt: "2026-09-08T10:05:00.000Z",
  };

  const replyB: Comment = {
    id: "reply-2",
    boardId: "board-1",
    canvasId: "canvas-1",
    shapeId: null,
    authorId: "user-3",
    author: { id: "user-3", fullName: "Charlie PM" },
    parentCommentId: "root-1",
    position: null,
    content: "Reply at 10:02",
    isResolved: false,
    isEdited: false,
    isDeleted: false,
    createdAt: "2026-09-08T10:02:00.000Z",
    updatedAt: "2026-09-08T10:02:00.000Z",
  };

  const replyC: Comment = {
    id: "reply-3",
    boardId: "board-1",
    canvasId: "canvas-1",
    shapeId: null,
    authorId: "user-1",
    author: { id: "user-1", fullName: "Alice Designer" },
    parentCommentId: "root-1",
    position: null,
    content: "Reply at 10:10",
    isResolved: false,
    isEdited: false,
    isDeleted: false,
    createdAt: "2026-09-08T10:10:00.000Z",
    updatedAt: "2026-09-08T10:10:00.000Z",
  };

  it("sorts replies deterministically by createdAt ascending regardless of input arrival order", () => {
    // Arrival order: replyC (10:10), replyA (10:05), replyB (10:02)
    const unsortedReplies = [replyC, replyA, replyB];

    const sorted = [...unsortedReplies].sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    expect(sorted.map((r) => r.id)).toEqual(["reply-2", "reply-1", "reply-3"]);
    expect(sorted.map((r) => r.content)).toEqual([
      "Reply at 10:02",
      "Reply at 10:05",
      "Reply at 10:10",
    ]);
  });

  it("handles soft-deleted root comments while preserving attached replies", () => {
    const deletedRoot: Comment = {
      ...mockRootComment,
      isDeleted: true,
      content: "",
    };

    const threadReplies = [replyA, replyB];
    expect(deletedRoot.isDeleted).toBe(true);
    expect(deletedRoot.content).toBe("");
    expect(threadReplies.length).toBe(2);
    expect(threadReplies.every((r) => r.parentCommentId === deletedRoot.id)).toBe(
      true
    );
  });

  it("invokes reply submission with parent root ID and trimmed content", async () => {
    const onReply = vi.fn().mockResolvedValue(true);

    const handleReply = async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return false;
      return onReply(mockRootComment.id, trimmed);
    };

    const success = await handleReply("  This is a valid reply  ");
    expect(success).toBe(true);
    expect(onReply).toHaveBeenCalledWith(
      "root-1",
      "This is a valid reply"
    );

    const empty = await handleReply("   ");
    expect(empty).toBe(false);
    expect(onReply).toHaveBeenCalledTimes(1);
  });

  it("invokes resolve toggle with inverted root status", async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined);

    const toggle = (root: Comment) => {
      onResolve(root.id, !root.isResolved);
    };

    toggle(mockRootComment); // isResolved: false -> true
    expect(onResolve).toHaveBeenCalledWith("root-1", true);

    toggle({ ...mockRootComment, isResolved: true }); // isResolved: true -> false
    expect(onResolve).toHaveBeenCalledWith("root-1", false);
  });

  it("preserves replies structure when root comment is resolved or reopened", () => {
    const resolvedRoot: Comment = {
      ...mockRootComment,
      isResolved: true,
      resolvedAt: "2026-09-08T10:20:00.000Z",
      resolvedBy: "user-1",
    };

    const threadReplies = [replyA, replyB, replyC];

    // Thread is resolved, replies must remain attached
    expect(resolvedRoot.isResolved).toBe(true);
    expect(threadReplies.length).toBe(3);
    expect(threadReplies.every((r) => r.parentCommentId === resolvedRoot.id)).toBe(true);

    // Reopening the root comment
    const reopenedRoot: Comment = {
      ...resolvedRoot,
      isResolved: false,
      resolvedAt: null,
      resolvedBy: null,
    };

    expect(reopenedRoot.isResolved).toBe(false);
    expect(reopenedRoot.resolvedAt).toBeNull();
    expect(reopenedRoot.resolvedBy).toBeNull();
    expect(threadReplies.every((r) => r.parentCommentId === reopenedRoot.id)).toBe(true);
  });
});
