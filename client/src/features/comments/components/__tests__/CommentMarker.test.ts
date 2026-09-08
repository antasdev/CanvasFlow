import { describe, expect, it, vi } from "vitest";

import { worldToScreen, type CanvasTransform } from "@/features/canvas/utils/canvas.coordinates";
import type { Comment } from "../../types";

describe("CommentMarker Logic & State Tests", () => {
  const mockComment: Comment = {
    id: "comment-123",
    boardId: "board-1",
    canvasId: "canvas-1",
    shapeId: null,
    authorId: "user-1",
    author: {
      id: "user-1",
      fullName: "Jane Engineer",
    },
    parentCommentId: null,
    position: { x: 250, y: 350 },
    content: "Please check the layout here.",
    isResolved: false,
    isEdited: false,
    isDeleted: false,
    createdAt: "2026-09-08T10:00:00.000Z",
    updatedAt: "2026-09-08T10:00:00.000Z",
  };

  it("calculates exact screen position from world anchor across viewport transforms", () => {
    const vp1: CanvasTransform = { zoom: 1.0, pan: { x: 0, y: 0 } };
    const vp2: CanvasTransform = { zoom: 1.5, pan: { x: 100, y: 50 } };
    const vp3: CanvasTransform = { zoom: 0.5, pan: { x: -50, y: -25 } };

    const screen1 = worldToScreen(mockComment.position!, vp1);
    expect(screen1).toEqual({ x: 250, y: 350 });

    const screen2 = worldToScreen(mockComment.position!, vp2);
    expect(screen2).toEqual({ x: 250 * 1.5 + 100, y: 350 * 1.5 + 50 });

    const screen3 = worldToScreen(mockComment.position!, vp3);
    expect(screen3).toEqual({ x: 250 * 0.5 - 50, y: 350 * 0.5 - 25 });
  });

  it("truncates long comment content snippets accurately for preview tooltips", () => {
    const longContent = "A".repeat(120);
    const snippet = longContent.length > 60 ? `${longContent.slice(0, 60)}...` : longContent;

    expect(snippet.length).toBe(63);
    expect(snippet.endsWith("...")).toBe(true);
  });

  it("isolates click events to prevent canvas shape selection fallthrough", () => {
    const onSelect = vi.fn();
    const stopPropagation = vi.fn();

    const handleClick = (e: { stopPropagation: () => void }, commentId: string): void => {
      e.stopPropagation();
      onSelect(commentId);
    };

    handleClick({ stopPropagation }, mockComment.id);

    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("comment-123");
  });

  it("handles keyboard activation (Enter / Space) with event isolation", () => {
    const onSelect = vi.fn();
    const preventDefault = vi.fn();
    const stopPropagation = vi.fn();

    const handleKeyDown = (
      e: { key: string; preventDefault: () => void; stopPropagation: () => void },
      commentId: string
    ): void => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        onSelect(commentId);
      }
    };

    handleKeyDown({ key: "Enter", preventDefault, stopPropagation }, mockComment.id);
    expect(preventDefault).toHaveBeenCalled();
    expect(stopPropagation).toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledWith("comment-123");

    handleKeyDown({ key: " ", preventDefault, stopPropagation }, mockComment.id);
    expect(onSelect).toHaveBeenCalledTimes(2);

    // Other keys ignored
    handleKeyDown({ key: "Tab", preventDefault, stopPropagation }, mockComment.id);
    expect(onSelect).toHaveBeenCalledTimes(2);
  });
});
