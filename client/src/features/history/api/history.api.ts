import { api } from "@/services/api";

import type {
  RestoreVersionPayload,
  RestoreVersionResult,
  VersionDetail,
  VersionListResponse,
  VersionQueryParams,
  VersionSummary,
} from "../types";

type HistoryListApiResponse = {
  success: boolean;
  data: VersionSummary[];
  pagination: {
    nextCursor?: number;
    hasMore: boolean;
    totalCount: number;
  };
};

type HistoryDetailApiResponse = {
  success: boolean;
  data: VersionDetail;
};

type HistoryRestoreApiResponse = {
  success: boolean;
  data: RestoreVersionResult;
};

export const historyApi = {
  /**
   * Fetches paginated lightweight version summaries for a board.
   */
  async getVersions(
    boardId: string,
    params?: VersionQueryParams
  ): Promise<VersionListResponse> {
    const queryParams = new URLSearchParams();
    if (params?.limit) {
      queryParams.set("limit", String(params.limit));
    }
    if (params?.cursor !== undefined) {
      queryParams.set("cursor", String(params.cursor));
    }
    if (params?.trigger) {
      queryParams.set("trigger", params.trigger);
    }

    const queryString = queryParams.toString();
    const endpoint = `/boards/${boardId}/versions${queryString ? `?${queryString}` : ""}`;

    const response = await api.get<HistoryListApiResponse>(endpoint);
    return {
      items: response.data.data,
      pagination: response.data.pagination,
    };
  },

  /**
   * Fetches the complete historical version checkpoint including full canvas snapshot.
   */
  async getVersionById(
    boardId: string,
    versionId: string
  ): Promise<VersionDetail> {
    const response = await api.get<HistoryDetailApiResponse>(
      `/boards/${boardId}/versions/${versionId}`
    );
    return response.data.data;
  },

  /**
   * Restores historical version checkpoint to live board state.
   */
  async restoreVersion(
    boardId: string,
    versionId: string,
    payload?: RestoreVersionPayload
  ): Promise<RestoreVersionResult> {
    const response = await api.post<HistoryRestoreApiResponse>(
      `/boards/${boardId}/versions/${versionId}/restore`,
      payload ?? {}
    );
    return response.data.data;
  },
};
