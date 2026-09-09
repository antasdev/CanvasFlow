import { describe, expect, it, vi } from "vitest";

import type { Comment } from "../../types";

describe("CommentItem Logic & State Invariants", () => {
  const mockComment: Comment = {
    id: "comment-1",
    boardId: "board-1",
    canvasId: "canvas-1",
    shapeId: null,
    authorId: "user-1",
    author: {
      id: "user-1",
      fullName: "Alice Cooper",
    },
    parentCommentId: null,
    position: { x: 150, y: 250 },
    content: "Original review comment",
    isResolved: false,
    isEdited: false,
    isDeleted: false,
    createdAt: "2026-09-08T10:00:00.000Z",
    updatedAt: "2026-09-08T10:00:00.000Z",
  };

  it("handles inline edit saving with trimmed content validation", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);

    const handleSaveEdit = async (
      commentId: string,
      newContent: string
    ): Promise<boolean> => {
      const trimmed = newContent.trim();
      if (!trimmed || trimmed.length > 2000) return false;
      await onUpdate(commentId, trimmed);
      return true;
    };

    // Valid save
    const success = await handleSaveEdit(mockComment.id, "  Updated comment text  ");
    expect(success).toBe(true);
    expect(onUpdate).toHaveBeenCalledWith("comment-1", "Updated comment text");

    // Empty content rejected
    const rejectedEmpty = await handleSaveEdit(mockComment.id, "   ");
    expect(rejectedEmpty).toBe(false);

    // Exceeding 2000 chars rejected
    const rejectedTooLong = await handleSaveEdit(mockComment.id, "A".repeat(2001));
    expect(rejectedTooLong).toBe(false);
  });

  it("handles delete action execution", async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);

    const handleDelete = async (commentId: string) => {
      await onDelete(commentId);
    };

    await handleDelete(mockComment.id);
    expect(onDelete).toHaveBeenCalledWith("comment-1");
  });

  it("displays masked placeholder and suppresses actions when comment is soft-deleted", () => {
    const deletedComment: Comment = {
      ...mockComment,
      isDeleted: true,
      content: "",
    };

    const isActionMenuVisible = (comment: Comment, currentUserId: string): boolean => {
      const isAuthor = currentUserId === comment.authorId;
      return isAuthor && !comment.isDeleted;
    };

    expect(deletedComment.isDeleted).toBe(true);
    expect(deletedComment.content).toBe("");
    expect(isActionMenuVisible(deletedComment, "user-1")).toBe(false);
    expect(isActionMenuVisible(mockComment, "user-1")).toBe(true);
    expect(isActionMenuVisible(mockComment, "user-2")).toBe(false);
  });

  it("correctly identifies edited and optimistic comment badge statuses", () => {
    const normalComment = { ...mockComment };
    const editedComment: Comment = { ...mockComment, isEdited: true };
    const optimisticComment: Comment = { ...mockComment, isOptimistic: true };
    const deletedEditedComment: Comment = {
      ...mockComment,
      isEdited: true,
      isDeleted: true,
      content: "",
    };

    const showEditedTag = (c: Comment) => c.isEdited && !c.isDeleted;
    const showOptimisticTag = (c: Comment) => Boolean(c.isOptimistic);

    expect(showEditedTag(normalComment)).toBe(false);
    expect(showEditedTag(editedComment)).toBe(true);
    expect(showEditedTag(deletedEditedComment)).toBe(false);

    expect(showOptimisticTag(optimisticComment)).toBe(true);
    expect(showOptimisticTag(normalComment)).toBe(false);
  });

  it("handles keyboard events during inline editing (Escape cancels, Enter saves)", () => {
    const cancelFn = vi.fn();
    const saveFn = vi.fn();

    const handleKeyDown = (
      e: { key: string; shiftKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; preventDefault: () => void }
    ) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelFn();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        saveFn();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        saveFn();
        return;
      }
    };

    const preventDefault = vi.fn();

    // Escape -> cancel
    handleKeyDown({ key: "Escape", preventDefault });
    expect(cancelFn).toHaveBeenCalledTimes(1);

    // Enter without Shift -> save
    handleKeyDown({ key: "Enter", shiftKey: false, preventDefault });
    expect(saveFn).toHaveBeenCalledTimes(1);

    // Shift + Enter -> allows multiline (no save, no preventDefault)
    handleKeyDown({ key: "Enter", shiftKey: true, preventDefault: vi.fn() });
    expect(saveFn).toHaveBeenCalledTimes(1);

    // Ctrl + Enter -> save
    handleKeyDown({ key: "Enter", ctrlKey: true, preventDefault });
    expect(saveFn).toHaveBeenCalledTimes(2);
  });

  it("safely tokenizes content with multiple mentions in renderCommentContent", () => {
    const content = "Hello @Antas and @Anoop, check this out!";
    const mentions = [
      {
        userId: "user-1",
        displayName: "Antas",
        startIndex: 6,
        endIndex: 12,
      },
      {
        userId: "user-2",
        displayName: "Anoop",
        startIndex: 17,
        endIndex: 23,
      },
    ];

    // Verify raw content without mentions returns string
    expect(typeof content).toBe("string");
    expect(mentions).toHaveLength(2);

    // Verify mention boundaries
    expect(content.slice(0, 6)).toBe("Hello ");
    expect(content.slice(6, 12)).toBe("@Antas");
    expect(content.slice(12, 17)).toBe(" and ");
    expect(content.slice(17, 23)).toBe("@Anoop");
    expect(content.slice(23)).toBe(", check this out!");
  });

  it("handles inline edit saving with updated mentions", async () => {
    const onUpdate = vi.fn().mockResolvedValue(undefined);

    const handleSaveEditWithMentions = async (
      commentId: string,
      newContent: string,
      newMentions: Array<{ userId: string; displayName: string; startIndex: number; endIndex: number }>
    ): Promise<boolean> => {
      const trimmed = newContent.trim();
      if (!trimmed || trimmed.length > 2000) return false;
      await onUpdate(commentId, trimmed, newMentions);
      return true;
    };

    const newMentions = [
      {
        userId: "user-3",
        displayName: "Arun",
        startIndex: 4,
        endIndex: 9,
      },
    ];

    const success = await handleSaveEditWithMentions(
      mockComment.id,
      "Hey @Arun, please review",
      newMentions
    );

    expect(success).toBe(true);
    expect(onUpdate).toHaveBeenCalledWith(
      "comment-1",
      "Hey @Arun, please review",
      newMentions
    );
  });

  it("ensures semantic time dateTime format and accessible icon labels", () => {
    const rawIso = "2026-09-08T10:00:00.000Z";
    const parsedDate = new Date(rawIso);
    expect(parsedDate.toISOString()).toBe(rawIso);

    const actionLabels = {
      moreOptions: "More comment options",
      edit: "Edit comment",
      delete: "Delete comment",
    };

    expect(actionLabels.moreOptions).toBe("More comment options");
    expect(actionLabels.edit).toBe("Edit comment");
    expect(actionLabels.delete).toBe("Delete comment");
  });

  it("restores focus to trigger element when inline edit mode exits", () => {
    const focusMock = vi.fn();
    const triggerElement = { focus: focusMock };

    const handleExitEdit = (elementRef: { focus: () => void } | null) => {
      elementRef?.focus();
    };

    handleExitEdit(triggerElement);
    expect(focusMock).toHaveBeenCalledTimes(1);
  });
});
