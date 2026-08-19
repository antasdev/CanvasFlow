import { api } from "@/services/api";

const SHAPE_ENDPOINT = "/shapes";

export type ShapeResponseDto = {
  id: string;
  canvasId: string;
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    opacity: number;
  };
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateShapeRequest = {
  canvasId: string;
  type: "rectangle";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  style?: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
  };
};

export type UpdateShapeRequest = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  style?: {
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    opacity?: number;
  };
};

export const shapeApi = {
  async getShapes(canvasId: string): Promise<ShapeResponseDto[]> {
    const response = await api.get<{
      success: boolean;
      data: ShapeResponseDto[];
    }>(`${SHAPE_ENDPOINT}/canvas/${canvasId}`);

    return response.data.data;
  },

  async getShape(id: string): Promise<ShapeResponseDto> {
    const response = await api.get<{
      success: boolean;
      data: ShapeResponseDto;
    }>(`${SHAPE_ENDPOINT}/${id}`);

    return response.data.data;
  },

  async createShape(payload: CreateShapeRequest): Promise<ShapeResponseDto> {
    const response = await api.post<{
      success: boolean;
      data: ShapeResponseDto;
    }>(SHAPE_ENDPOINT, payload);

    return response.data.data;
  },

  async updateShape(
    id: string,
    payload: UpdateShapeRequest
  ): Promise<ShapeResponseDto> {
    const response = await api.patch<{
      success: boolean;
      data: ShapeResponseDto;
    }>(`${SHAPE_ENDPOINT}/${id}`, payload);

    return response.data.data;
  },

  async deleteShape(id: string): Promise<void> {
    await api.delete(`${SHAPE_ENDPOINT}/${id}`);
  },
};
