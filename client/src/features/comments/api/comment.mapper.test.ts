import { describe, expect, it } from "vitest";

import type { CommentResponseDto } from "@/services/socket";

import { mapCommentResponseToComment } from "./comment.mapper";

describe("Comment Mapper (mapCommentResponseToComment)", () => {
  it("should correctly map a standard active comment DTO", () => {
    const dto: CommentResponseDto = {
      id: "comment_1",
      boardId: "board_1",
      canvasId: "canvas_1",
      shapeId: "shape_1",
      authorId: "user_1",
      author: {
        id: "user_1",
        fullName: "Jane Doe",
        email: "jane@example.com",
        avatar: "avatar.png",
      },
      parentCommentId: null,
      position: { x: 150, y: 250 },
      content: "Hello world comment",
      isResolved: false,
      isEdited: false,
      isDeleted: false,
      version: 1,
      createdAt: "2026-08-23T10:00:00.000Z",
      updatedAt: "2026-08-23T10:00:00.000Z",
    };

    const result = mapCommentResponseToComment(dto);

    expect(result.id).toBe("comment_1");
    expect(result.boardId).toBe("board_1");
    expect(result.canvasId).toBe("canvas_1");
    expect(result.shapeId).toBe("shape_1");
    expect(result.authorId).toBe("user_1");
    expect(result.author?.fullName).toBe("Jane Doe");
    expect(result.position).toEqual({ x: 150, y: 250 });
    expect(result.content).toBe("Hello world comment");
    expect(result.isResolved).toBe(false);
    expect(result.isEdited).toBe(false);
    expect(result.isDeleted).toBe(false);
    expect(result.version).toBe(1);
  });

  it("should correctly map resolved metadata", () => {
    const dto: CommentResponseDto = {
      id: "comment_resolved",
      boardId: "board_1",
      canvasId: "canvas_1",
      shapeId: null,
      authorId: "user_1",
      parentCommentId: null,
      position: { x: 200, y: 300 },
      content: "Fixed issue",
      isResolved: true,
      resolvedAt: "2026-08-23T11:00:00.000Z",
      resolvedBy: "user_2",
      isEdited: false,
      isDeleted: false,
      version: 3,
      createdAt: "2026-08-23T10:00:00.000Z",
      updatedAt: "2026-08-23T11:00:00.000Z",
    };

    const result = mapCommentResponseToComment(dto);

    expect(result.isResolved).toBe(true);
    expect(result.resolvedAt).toBe("2026-08-23T11:00:00.000Z");
    expect(result.resolvedBy).toBe("user_2");
  });

  it("should mask content when comment is soft-deleted", () => {
    const dto: CommentResponseDto = {
      id: "comment_deleted",
      boardId: "board_1",
      canvasId: "canvas_1",
      shapeId: null,
      authorId: "user_1",
      parentCommentId: null,
      position: { x: 100, y: 100 },
      content: "Old secret text",
      isResolved: false,
      isEdited: false,
      isDeleted: true,
      version: 2,
      createdAt: "2026-08-23T10:00:00.000Z",
      updatedAt: "2026-08-23T10:05:00.000Z",
    };

    const result = mapCommentResponseToComment(dto);

    expect(result.isDeleted).toBe(true);
    expect(result.content).toBe("");
    expect(result.version).toBe(2);
  });
});
