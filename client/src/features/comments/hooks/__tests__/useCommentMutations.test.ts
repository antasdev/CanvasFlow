import { describe, expect, it, beforeEach } from "vitest";

import { useCommentStore } from "../../store";
import type { Comment } from "../../types";

describe("useCommentMutations Store Invariants & Optimistic Lifecycle", () => {
  const initialComment: Comment = {
    id: "comment-100",
    boardId: "board-1",
    canvasId: "canvas-1",
    shapeId: null,
    authorId: "user-1",
    author: { id: "user-1", fullName: "Engineer Alice" },
    parentCommentId: null,
    position: { x: 50, y: 75 },
    content: "Initial root thread",
    isResolved: false,
    isEdited: false,
    isDeleted: false,
    createdAt: "2026-09-08T10:00:00.000Z",
    updatedAt: "2026-09-08T10:00:00.000Z",
  };

  beforeEach(() => {
    useCommentStore.getState().clearComments();
    useCommentStore.getState().addComment(initialComment);
  });

  it("handles optimistic reply creation and authoritative replacement", () => {
    const tempId = "temp_reply_999";
    const optimisticReply: Comment = {
      id: tempId,
      boardId: "board-1",
      canvasId: "canvas-1",
      shapeId: null,
      authorId: "user-1",
      author: { id: "user-1", fullName: "Engineer Alice" },
      parentCommentId: "comment-100",
      position: null,
      content: "Optimistic reply text",
      isResolved: false,
      isEdited: false,
      isDeleted: false,
      createdAt: "2026-09-08T10:01:00.000Z",
      updatedAt: "2026-09-08T10:01:00.000Z",
      isOptimistic: true,
    };

    useCommentStore.getState().addOptimisticComment(optimisticReply);
    expect(useCommentStore.getState().comments[tempId]).toBeDefined();
    expect(useCommentStore.getState().comments[tempId].isOptimistic).toBe(true);

    const authoritativeReply: Comment = {
      ...optimisticReply,
      id: "reply-server-200",
      isOptimistic: false,
    };

    useCommentStore
      .getState()
      .replaceOptimisticComment(tempId, authoritativeReply);

    expect(useCommentStore.getState().comments[tempId]).toBeUndefined();
    expect(
      useCommentStore.getState().comments["reply-server-200"]
    ).toBeDefined();
    expect(
      useCommentStore.getState().comments["reply-server-200"].parentCommentId
    ).toBe("comment-100");
  });

  it("rolls back optimistic reply creation on network failure", () => {
    const tempId = "temp_fail_888";
    useCommentStore.getState().addOptimisticComment({
      ...initialComment,
      id: tempId,
      parentCommentId: "comment-100",
      content: "Failed reply",
    });

    expect(useCommentStore.getState().comments[tempId]).toBeDefined();

    // Rollback
    useCommentStore.getState().removeOptimisticComment(tempId);
    expect(useCommentStore.getState().comments[tempId]).toBeUndefined();
  });

  it("handles update rollback on OCC 409 conflict error", () => {
    const previous = useCommentStore.getState().comments["comment-100"];
    expect(previous.content).toBe("Initial root thread");

    // Optimistic update
    useCommentStore.getState().updateComment({
      ...previous,
      content: "My conflicting edit",
      isEdited: true,
    });
    expect(useCommentStore.getState().comments["comment-100"].content).toBe(
      "My conflicting edit"
    );

    // Conflict error triggers rollback
    useCommentStore.getState().updateComment(previous);
    expect(useCommentStore.getState().comments["comment-100"].content).toBe(
      "Initial root thread"
    );
  });

  it("handles resolution toggle and rollback", () => {
    useCommentStore.getState().resolveComment("comment-100", true);
    expect(useCommentStore.getState().comments["comment-100"].isResolved).toBe(
      true
    );

    useCommentStore.getState().resolveComment("comment-100", false);
    expect(useCommentStore.getState().comments["comment-100"].isResolved).toBe(
      false
    );
  });

  it("handles soft deletion and rollback", () => {
    const previous = useCommentStore.getState().comments["comment-100"];

    useCommentStore.getState().removeComment("comment-100");
    expect(useCommentStore.getState().comments["comment-100"].isDeleted).toBe(
      true
    );
    expect(useCommentStore.getState().comments["comment-100"].content).toBe("");

    // Rollback
    useCommentStore.getState().updateComment(previous);
    expect(useCommentStore.getState().comments["comment-100"].isDeleted).toBe(
      false
    );
    expect(useCommentStore.getState().comments["comment-100"].content).toBe(
      "Initial root thread"
    );
  });
});
