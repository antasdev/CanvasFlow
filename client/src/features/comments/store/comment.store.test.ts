import { beforeEach, describe, expect, it } from "vitest";

import { useCanvasStore } from "@/features/canvas/store/canvas.store";
import { useCommentStore } from "./comment.store";
import type { Comment } from "../types";

const mockComment: Comment = {
  id: "comment_1",
  boardId: "board_1",
  shapeId: null,
  authorId: "user_1",
  author: {
    id: "user_1",
    fullName: "Alice Developer",
    email: "alice@example.com",
  },
  parentCommentId: null,
  content: "Initial comment",
  isResolved: false,
  isEdited: false,
  isDeleted: false,
  createdAt: "2026-08-23T10:00:00.000Z",
  updatedAt: "2026-08-23T10:00:00.000Z",
};

const mockReply: Comment = {
  id: "reply_1",
  boardId: "board_1",
  shapeId: null,
  authorId: "user_2",
  author: {
    id: "user_2",
    fullName: "Bob Collaborator",
  },
  parentCommentId: "comment_1",
  content: "Reply to comment 1",
  isResolved: false,
  isEdited: false,
  isDeleted: false,
  createdAt: "2026-08-23T10:05:00.000Z",
  updatedAt: "2026-08-23T10:05:00.000Z",
};

describe("Comment Store (useCommentStore)", () => {
  beforeEach(() => {
    useCommentStore.getState().clearComments();
    useCanvasStore.getState().resetCanvas();
  });

  it("should initialize with empty state", () => {
    const state = useCommentStore.getState();
    expect(state.comments).toEqual({});
    expect(state.activeThreadId).toBeNull();
    expect(state.selectedShapeId).toBeNull();
    expect(state.filter).toBe("all");
    expect(state.isPanelOpen).toBe(false);
  });

  it("should set bulk comments normalized by id", () => {
    useCommentStore.getState().setComments([mockComment, mockReply]);
    const state = useCommentStore.getState();

    expect(Object.keys(state.comments)).toHaveLength(2);
    expect(state.comments["comment_1"]).toEqual(mockComment);
    expect(state.comments["reply_1"]).toEqual(mockReply);
  });

  it("should add and update comments idempotently", () => {
    useCommentStore.getState().addComment(mockComment);
    expect(useCommentStore.getState().comments["comment_1"].content).toBe(
      "Initial comment"
    );

    // Duplicate add updates rather than corrupting
    useCommentStore.getState().addComment({
      ...mockComment,
      content: "Duplicate update",
    });
    expect(useCommentStore.getState().comments["comment_1"].content).toBe(
      "Duplicate update"
    );

    // Explicit updateComment
    useCommentStore.getState().updateComment({
      ...mockComment,
      content: "Updated comment text",
      isEdited: true,
    });
    const comment = useCommentStore.getState().comments["comment_1"];
    expect(comment.content).toBe("Updated comment text");
    expect(comment.isEdited).toBe(true);
  });

  it("should handle soft deletion correctly", () => {
    useCommentStore.getState().setComments([mockComment, mockReply]);
    useCommentStore.getState().removeComment("comment_1");

    const root = useCommentStore.getState().comments["comment_1"];
    expect(root.isDeleted).toBe(true);
    expect(root.content).toBe("");

    // Replies remain preserved
    const reply = useCommentStore.getState().comments["reply_1"];
    expect(reply.isDeleted).toBe(false);
    expect(reply.content).toBe("Reply to comment 1");
  });

  it("should resolve and unresolve comments", () => {
    useCommentStore.getState().addComment(mockComment);
    useCommentStore.getState().resolveComment("comment_1", true);

    expect(useCommentStore.getState().comments["comment_1"].isResolved).toBe(true);

    useCommentStore.getState().resolveComment("comment_1", false);
    expect(useCommentStore.getState().comments["comment_1"].isResolved).toBe(
      false
    );
  });

  it("should manage optimistic comments and replacements", () => {
    const tempId = "temp_123";
    const optimisticComment: Comment = {
      ...mockComment,
      id: tempId,
      content: "Optimistic content",
    };

    useCommentStore.getState().addOptimisticComment(optimisticComment);
    expect(useCommentStore.getState().comments[tempId]).toBeDefined();
    expect(useCommentStore.getState().comments[tempId].isOptimistic).toBe(true);

    // Authoritative replacement
    const authoritativeComment: Comment = {
      ...mockComment,
      id: "real_comment_123",
      content: "Optimistic content",
    };

    useCommentStore
      .getState()
      .replaceOptimisticComment(tempId, authoritativeComment);

    expect(useCommentStore.getState().comments[tempId]).toBeUndefined();
    expect(
      useCommentStore.getState().comments["real_comment_123"]
    ).toBeDefined();
  });

  it("should rollback optimistic comment on failure", () => {
    const tempId = "temp_fail_123";
    useCommentStore.getState().addOptimisticComment({
      ...mockComment,
      id: tempId,
    });
    expect(useCommentStore.getState().comments[tempId]).toBeDefined();

    useCommentStore.getState().removeOptimisticComment(tempId);
    expect(useCommentStore.getState().comments[tempId]).toBeUndefined();
  });

  it("should toggle panel and set filter", () => {
    expect(useCommentStore.getState().isPanelOpen).toBe(false);

    useCommentStore.getState().togglePanel(true);
    expect(useCommentStore.getState().isPanelOpen).toBe(true);

    useCommentStore.getState().setFilter("open");
    expect(useCommentStore.getState().filter).toBe("open");

    useCommentStore.getState().setSelectedShapeId("shape_999");
    expect(useCommentStore.getState().selectedShapeId).toBe("shape_999");
  });

  it("should NEVER touch canvas history (past/future) or undo/redo", () => {
    const initialPastLength = useCanvasStore.getState().past.length;
    const initialFutureLength = useCanvasStore.getState().future.length;

    // Mutate comments
    useCommentStore.getState().addComment(mockComment);
    useCommentStore.getState().addComment(mockReply);
    useCommentStore.getState().updateComment({
      ...mockComment,
      content: "Edited text",
      isEdited: true,
    });
    useCommentStore.getState().resolveComment("comment_1", true);
    useCommentStore.getState().removeComment("comment_1");

    // Verify canvas past/future history remain completely unaffected
    expect(useCanvasStore.getState().past.length).toBe(initialPastLength);
    expect(useCanvasStore.getState().future.length).toBe(initialFutureLength);
    expect(useCanvasStore.getState().canUndo()).toBe(false);
    expect(useCanvasStore.getState().canRedo()).toBe(false);
  });
});
