import { api } from "@/services/api";

import type { Canvas } from "../types";

const CANVAS_ENDPOINT = "/canvases";

type CanvasApiResponseItem = {
  _id: string;
  boardId: string;
  name: string;
  order: number;
  backgroundColor: string;
  thumbnail?: string;
  createdAt: string;
  updatedAt: string;
};

type CanvasApiResponse = {
  success: boolean;
  data: CanvasApiResponseItem[];
};

export const mapCanvasResponse = (item: CanvasApiResponseItem): Canvas => {
  return {
    id: item._id,
    boardId: item.boardId,
    name: item.name,
    order: item.order,
    backgroundColor: item.backgroundColor,
    thumbnail: item.thumbnail,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
};

export const canvasApi = {
  async getBoardCanvases(boardId: string): Promise<Canvas[]> {
    const response = await api.get<CanvasApiResponse>(
      `${CANVAS_ENDPOINT}/board/${boardId}`
    );

    return response.data.data.map(mapCanvasResponse);
  },

  async getCanvas(id: string): Promise<Canvas> {
    const response = await api.get<{
      success: boolean;
      data: CanvasApiResponseItem;
    }>(`${CANVAS_ENDPOINT}/${id}`);

    return mapCanvasResponse(response.data.data);
  },
};
