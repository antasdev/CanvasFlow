import { describe, expect, it } from "vitest";

import type { CommentResponseDto } from "@/services/socket";
import { mapCommentResponseToComment } from "./comment.mapper";

describe("Comment Mapper (mapCommentResponseToComment)", () => {
  it("should correctly map a standard active comment DTO", () => {
    const dto: CommentResponseDto = {
      id: "comment_1",
      boardId: "board_1",
      shapeId: "shape_1",
      authorId: "user_1",
      author: {
        id: "user_1",
        fullName: "Jane Doe",
        email: "jane@example.com",
        avatar: "avatar.png",
      },
      parentCommentId: null,
      content: "Hello world comment",
      isResolved: false,
      isEdited: false,
      isDeleted: false,
      createdAt: "2026-08-23T10:00:00.000Z",
      updatedAt: "2026-08-23T10:00:00.000Z",
    };

    const result = mapCommentResponseToComment(dto);

    expect(result.id).toBe("comment_1");
    expect(result.boardId).toBe("board_1");
    expect(result.shapeId).toBe("shape_1");
    expect(result.authorId).toBe("user_1");
    expect(result.author?.fullName).toBe("Jane Doe");
    expect(result.content).toBe("Hello world comment");
    expect(result.isResolved).toBe(false);
    expect(result.isEdited).toBe(false);
    expect(result.isDeleted).toBe(false);
  });

  it("should mask content when comment is soft-deleted", () => {
    const dto: CommentResponseDto = {
      id: "comment_deleted",
      boardId: "board_1",
      shapeId: null,
      authorId: "user_1",
      parentCommentId: null,
      content: "Old secret text",
      isResolved: false,
      isEdited: false,
      isDeleted: true,
      createdAt: "2026-08-23T10:00:00.000Z",
      updatedAt: "2026-08-23T10:05:00.000Z",
    };

    const result = mapCommentResponseToComment(dto);

    expect(result.isDeleted).toBe(true);
    expect(result.content).toBe("");
  });
});
