import { api } from "@/services/api";
import type { CommentResponseDto } from "@/services/socket";
import type { Comment, CreateCommentInput, UpdateCommentInput } from "../types";
import { mapCommentResponseToComment } from "./comment.mapper";

type CommentsApiResponse = {
  success: boolean;
  data: CommentResponseDto[];
};

type SingleCommentApiResponse = {
  success: boolean;
  data: CommentResponseDto;
};

export const commentApi = {
  /**
   * Fetches all comments for a board with optional shape / resolved filters.
   */
  async getComments(
    boardId: string,
    params?: { shapeId?: string; resolved?: boolean }
  ): Promise<Comment[]> {
    const queryParams = new URLSearchParams();
    if (params?.shapeId) {
      queryParams.set("shapeId", params.shapeId);
    }
    if (params?.resolved !== undefined) {
      queryParams.set("resolved", String(params.resolved));
    }

    const queryString = queryParams.toString();
    const endpoint = `/boards/${boardId}/comments${queryString ? `?${queryString}` : ""}`;

    const response = await api.get<CommentsApiResponse>(endpoint);
    return response.data.data.map(mapCommentResponseToComment);
  },

  /**
   * Creates a comment over HTTP.
   */
  async createComment(
    boardId: string,
    payload: CreateCommentInput
  ): Promise<Comment> {
    const response = await api.post<SingleCommentApiResponse>(
      `/boards/${boardId}/comments`,
      payload
    );
    return mapCommentResponseToComment(response.data.data);
  },

  /**
   * Updates a comment's content over HTTP.
   */
  async updateComment(
    boardId: string,
    commentId: string,
    payload: UpdateCommentInput
  ): Promise<Comment> {
    const response = await api.patch<SingleCommentApiResponse>(
      `/boards/${boardId}/comments/${commentId}`,
      payload
    );
    return mapCommentResponseToComment(response.data.data);
  },

  /**
   * Resolves or unresolves a comment thread over HTTP.
   */
  async resolveComment(
    boardId: string,
    commentId: string,
    isResolved: boolean
  ): Promise<Comment> {
    const response = await api.patch<SingleCommentApiResponse>(
      `/boards/${boardId}/comments/${commentId}/resolve`,
      { isResolved }
    );
    return mapCommentResponseToComment(response.data.data);
  },

  /**
   * Soft-deletes a comment over HTTP.
   */
  async deleteComment(
    boardId: string,
    commentId: string
  ): Promise<Comment> {
    const response = await api.delete<SingleCommentApiResponse>(
      `/boards/${boardId}/comments/${commentId}`
    );
    return mapCommentResponseToComment(response.data.data);
  },
};
