import { api } from "@/services/api";
import type { SearchQueryParams, SearchResponse } from "../types/search.types";

interface SearchApiResponse {
  success: boolean;
  data: SearchResponse;
}

export const searchApi = {
  async search(
    params: SearchQueryParams,
    signal?: AbortSignal
  ): Promise<SearchResponse> {
    const queryParams = new URLSearchParams();
    queryParams.set("q", params.q.trim());
    queryParams.set("scope", params.scope);

    if (params.workspaceId) {
      queryParams.set("workspaceId", params.workspaceId);
    }
    if (params.boardId) {
      queryParams.set("boardId", params.boardId);
    }
    if (params.types && params.types.length > 0) {
      queryParams.set("types", params.types.join(","));
    }
    if (params.limit !== undefined) {
      queryParams.set("limit", String(params.limit));
    }
    if (params.cursor) {
      queryParams.set("cursor", params.cursor);
    }

    const response = await api.get<SearchApiResponse>(
      `/search?${queryParams.toString()}`,
      { signal }
    );
    return response.data.data;
  },
};
