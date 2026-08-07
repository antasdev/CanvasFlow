import { api } from "@/services/api";

import type {
  Board,
  CreateBoardRequest,
  UpdateBoardRequest,
} from "../types";

import { mapBoardResponse } from "./board.mapper";

const BOARD_ENDPOINT = "/boards";

type BoardApiResponse = {
  success: boolean;
  data: BoardApiResponseItem[];
};

type BoardApiResponseItem = {
  _id: string;
  workspaceId: string;
  name: string;
  description?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export const boardApi = {
  async getBoardsByWorkspace(
    workspaceId: string,
  ): Promise<Board[]> {
    const response = await api.get<BoardApiResponse>(
      `${BOARD_ENDPOINT}/workspace/${workspaceId}`,
    );

    return response.data.data.map(mapBoardResponse);
  },

  async getBoard(boardId: string): Promise<Board> {
    const response = await api.get<{
      success: boolean;
      data: BoardApiResponseItem;
    }>(`${BOARD_ENDPOINT}/${boardId}`);

    return mapBoardResponse(response.data.data);
  },

  async createBoard(
    payload: CreateBoardRequest,
  ): Promise<Board> {
    const response = await api.post<{
      success: boolean;
      data: BoardApiResponseItem;
    }>(BOARD_ENDPOINT, payload);

    return mapBoardResponse(response.data.data);
  },

  async updateBoard(
    boardId: string,
    payload: UpdateBoardRequest,
  ): Promise<Board> {
    const response = await api.patch<{
      success: boolean;
      data: BoardApiResponseItem;
    }>(
      `${BOARD_ENDPOINT}/${boardId}`,
      payload,
    );

    return mapBoardResponse(response.data.data);
  },

  async deleteBoard(boardId: string): Promise<void> {
    await api.delete(
      `${BOARD_ENDPOINT}/${boardId}`,
    );
  },
};