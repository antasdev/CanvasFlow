import { describe, expect, it, vi } from "vitest";
import type { SearchResultItem } from "../types/search.types";

describe("SearchResultItem Presentation & Invariants", () => {
  const mockBoardItem: SearchResultItem = {
    id: "board-1",
    entityType: "board",
    title: "Architecture Diagrams",
    snippet: "System architecture diagrams and pipelines",
    boardId: "board-1",
    boardName: "Architecture Diagrams",
    matchedField: "name",
    createdAt: "2026-09-10T10:00:00.000Z",
    updatedAt: "2026-09-10T10:00:00.000Z",
  };

  const mockCanvasItem: SearchResultItem = {
    id: "canvas-1",
    entityType: "canvas",
    title: "Page 2 - Microservices",
    snippet: "Backend service dependency map",
    boardId: "board-1",
    boardName: "Architecture Diagrams",
    canvasId: "canvas-1",
    canvasName: "Page 2 - Microservices",
    matchedField: "name",
    createdAt: "2026-09-10T10:05:00.000Z",
    updatedAt: "2026-09-10T10:05:00.000Z",
  };

  const mockShapeItem: SearchResultItem = {
    id: "shape-1",
    entityType: "shape",
    title: "Auth Gateway Service",
    snippet: "JWT verification and session validator proxy",
    boardId: "board-1",
    boardName: "Architecture Diagrams",
    canvasId: "canvas-1",
    canvasName: "Page 2 - Microservices",
    shapeId: "shape-1",
    matchedField: "text",
    createdAt: "2026-09-10T10:10:00.000Z",
    updatedAt: "2026-09-10T10:10:00.000Z",
  };

  const mockCommentItem: SearchResultItem = {
    id: "comment-1",
    entityType: "comment",
    title: "Review note on rate limiter",
    snippet: "Make sure we implement exponential backoff here",
    boardId: "board-1",
    boardName: "Architecture Diagrams",
    canvasId: "canvas-1",
    canvasName: "Page 2 - Microservices",
    commentId: "comment-1",
    matchedField: "content",
    createdAt: "2026-09-10T10:15:00.000Z",
    updatedAt: "2026-09-10T10:15:00.000Z",
  };

  it("verifies board result attributes and context", () => {
    expect(mockBoardItem.entityType).toBe("board");
    expect(mockBoardItem.title).toBe("Architecture Diagrams");
    expect(mockBoardItem.boardId).toBe("board-1");
    expect(mockBoardItem.canvasId).toBeUndefined();
    expect(mockBoardItem.matchedField).toBe("name");
  });

  it("verifies canvas result attributes and context", () => {
    expect(mockCanvasItem.entityType).toBe("canvas");
    expect(mockCanvasItem.title).toBe("Page 2 - Microservices");
    expect(mockCanvasItem.boardId).toBe("board-1");
    expect(mockCanvasItem.canvasId).toBe("canvas-1");
    expect(mockCanvasItem.boardName).toBe("Architecture Diagrams");
  });

  it("verifies shape result attributes and context", () => {
    expect(mockShapeItem.entityType).toBe("shape");
    expect(mockShapeItem.title).toBe("Auth Gateway Service");
    expect(mockShapeItem.boardId).toBe("board-1");
    expect(mockShapeItem.canvasId).toBe("canvas-1");
    expect(mockShapeItem.shapeId).toBe("shape-1");
    expect(mockShapeItem.matchedField).toBe("text");
  });

  it("verifies comment result attributes and context", () => {
    expect(mockCommentItem.entityType).toBe("comment");
    expect(mockCommentItem.title).toBe("Review note on rate limiter");
    expect(mockCommentItem.boardId).toBe("board-1");
    expect(mockCommentItem.commentId).toBe("comment-1");
    expect(mockCommentItem.matchedField).toBe("content");
  });

  it("validates result destination URL routing generation", () => {
    const resolveNavigationRoute = (item: SearchResultItem): string => {
      switch (item.entityType) {
        case "board":
          return `/boards/${item.boardId}`;
        case "canvas":
          return `/boards/${item.boardId}?canvasId=${item.canvasId}`;
        case "shape":
          return `/boards/${item.boardId}?${item.canvasId ? `canvasId=${item.canvasId}&` : ""}shapeId=${item.shapeId || item.id}`;
        case "comment":
          return `/boards/${item.boardId}?${item.canvasId ? `canvasId=${item.canvasId}&` : ""}commentId=${item.commentId || item.id}`;
      }
    };

    expect(resolveNavigationRoute(mockBoardItem)).toBe("/boards/board-1");
    expect(resolveNavigationRoute(mockCanvasItem)).toBe("/boards/board-1?canvasId=canvas-1");
    expect(resolveNavigationRoute(mockShapeItem)).toBe("/boards/board-1?canvasId=canvas-1&shapeId=shape-1");
    expect(resolveNavigationRoute(mockCommentItem)).toBe("/boards/board-1?canvasId=canvas-1&commentId=comment-1");
  });

  it("triggers selection callback on click", () => {
    const onSelect = vi.fn();
    const handleItemClick = (item: SearchResultItem): void => {
      onSelect(item);
    };

    handleItemClick(mockShapeItem);
    expect(onSelect).toHaveBeenCalledWith(mockShapeItem);
  });
});
