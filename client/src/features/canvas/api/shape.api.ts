import { api } from "@/services/api";

const SHAPE_ENDPOINT = "/shapes";

export type BaseShapeResponseDto = {
  id: string;
  canvasId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  zIndex: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
};

export type RectangleShapeResponseDto = BaseShapeResponseDto & {
  type: "rectangle";
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    opacity: number;
  };
};

export type TextShapeResponseDto = BaseShapeResponseDto & {
  type: "text";
  style: {
    text: string;
    fontSize: number;
    fontFamily: string;
    fontWeight: string | number;
    fontStyle: string;
    textAlign: "left" | "center" | "right";
    fill: string;
    opacity: number;
  };
};

export type StickyNoteShapeResponseDto = BaseShapeResponseDto & {
  type: "sticky_note";
  style: {
    text: string;
    fontSize: number;
    backgroundColor: string;
    textColor: string;
    opacity: number;
  };
};

export type ShapeResponseDto =
  | RectangleShapeResponseDto
  | TextShapeResponseDto
  | StickyNoteShapeResponseDto;

export type ShapeStyleRequest = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  textAlign?: "left" | "center" | "right";
  backgroundColor?: string;
  textColor?: string;
};

export type CreateShapeRequest = {
  canvasId: string;
  type: "rectangle" | "text" | "sticky_note";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  style?: ShapeStyleRequest;
};

export type UpdateShapeRequest = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  style?: ShapeStyleRequest;
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
