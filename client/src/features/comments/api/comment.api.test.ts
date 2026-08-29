import { describe, expect, it, vi } from "vitest";

import { api } from "@/services/api";
import { commentApi } from "./comment.api";

vi.mock("@/services/api", () => ({
  api: {
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
  },
}));

describe("Comment API Client (commentApi)", () => {
  const mockDto = {
    id: "c1",
    boardId: "b1",
    canvasId: "canvas1",
    shapeId: null,
    authorId: "u1",
    parentCommentId: null,
    position: { x: 100, y: 100 },
    content: "Test text",
    isResolved: false,
    isEdited: false,
    isDeleted: false,
    version: 1,
    createdAt: "2026-08-23T10:00:00.000Z",
    updatedAt: "2026-08-23T10:00:00.000Z",
  };

  it("should fetch board comments with getComments", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { success: true, data: [mockDto] },
    });

    const result = await commentApi.getComments("b1", { resolved: false });

    expect(api.get).toHaveBeenCalledWith("/boards/b1/comments?resolved=false");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("c1");
  });

  it("should fetch canvas-scoped comments with getCanvasComments", async () => {
    vi.mocked(api.get).mockResolvedValueOnce({
      data: { success: true, data: [mockDto] },
    });

    const result = await commentApi.getCanvasComments("b1", "canvas1", {
      resolved: false,
    });

    expect(api.get).toHaveBeenCalledWith(
      "/boards/b1/canvases/canvas1/comments?resolved=false"
    );
    expect(result).toHaveLength(1);
    expect(result[0].canvasId).toBe("canvas1");
  });

  it("should create a comment with createComment", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { success: true, data: mockDto },
    });

    const result = await commentApi.createComment("b1", {
      content: "Test text",
      shapeId: null,
      parentCommentId: null,
    });

    expect(api.post).toHaveBeenCalledWith("/boards/b1/comments", {
      content: "Test text",
      shapeId: null,
      parentCommentId: null,
    });
    expect(result.id).toBe("c1");
  });

  it("should create a canvas-scoped comment with createCanvasComment", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { success: true, data: mockDto },
    });

    const result = await commentApi.createCanvasComment("b1", "canvas1", {
      content: "Canvas comment text",
      position: { x: 50, y: 75 },
    });

    expect(api.post).toHaveBeenCalledWith(
      "/boards/b1/canvases/canvas1/comments",
      {
        content: "Canvas comment text",
        position: { x: 50, y: 75 },
      }
    );
    expect(result.id).toBe("c1");
  });

  it("should create a reply with createReply", async () => {
    vi.mocked(api.post).mockResolvedValueOnce({
      data: { success: true, data: { ...mockDto, id: "r1", parentCommentId: "c1" } },
    });

    const result = await commentApi.createReply("b1", "c1", {
      content: "Reply text",
    });

    expect(api.post).toHaveBeenCalledWith("/boards/b1/comments/c1/replies", {
      content: "Reply text",
    });
    expect(result.id).toBe("r1");
    expect(result.parentCommentId).toBe("c1");
  });

  it("should update a comment with updateComment", async () => {
    vi.mocked(api.patch).mockResolvedValueOnce({
      data: {
        success: true,
        data: { ...mockDto, content: "Updated", isEdited: true },
      },
    });

    const result = await commentApi.updateComment("b1", "c1", {
      content: "Updated",
    });

    expect(api.patch).toHaveBeenCalledWith("/boards/b1/comments/c1", {
      content: "Updated",
    });
    expect(result.content).toBe("Updated");
  });

  it("should resolve a comment with resolveComment", async () => {
    vi.mocked(api.patch).mockResolvedValueOnce({
      data: { success: true, data: { ...mockDto, isResolved: true } },
    });

    const result = await commentApi.resolveComment("b1", "c1", true);

    expect(api.patch).toHaveBeenCalledWith("/boards/b1/comments/c1/resolve", {
      isResolved: true,
    });
    expect(result.isResolved).toBe(true);
  });

  it("should delete a comment with deleteComment", async () => {
    vi.mocked(api.delete).mockResolvedValueOnce({
      data: {
        success: true,
        data: { ...mockDto, content: "", isDeleted: true },
      },
    });

    const result = await commentApi.deleteComment("b1", "c1");

    expect(api.delete).toHaveBeenCalledWith("/boards/b1/comments/c1");
    expect(result.isDeleted).toBe(true);
  });
});
