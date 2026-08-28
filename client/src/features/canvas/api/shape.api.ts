import { api } from "@/services/api";
import type { StrokeStyle, ShapeShadow } from "../types/shape.types";

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
  parentId?: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type ShapeShadowDto = Partial<ShapeShadow>;

export type RectangleShapeResponseDto = BaseShapeResponseDto & {
  type: "rectangle";
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeStyle?: StrokeStyle;
    opacity: number;
    shadow?: ShapeShadowDto;
  };
};

export type TextShapeResponseDto = BaseShapeResponseDto & {
  type: "text";
  text?: string;
  style: {
    text?: string;
    fontSize?: number;
    fontFamily?: string;
    fontWeight?: string | number;
    fontStyle?: "normal" | "italic";
    textDecoration?: "none" | "underline";
    textAlign?: "left" | "center" | "right";
    verticalAlign?: "top" | "middle" | "bottom";
    fill?: string;
    opacity?: number;
    padding?: number;
    lineHeight?: number;
    shadow?: ShapeShadowDto;
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
    shadow?: ShapeShadowDto;
  };
};

export type FreehandShapeResponseDto = BaseShapeResponseDto & {
  type: "freehand";
  points: number[];
  style: {
    stroke: string;
    strokeWidth: number;
    opacity: number;
    strokeStyle?: StrokeStyle;
    shadow?: ShapeShadowDto;
  };
};

export type ShapeConnectorDto = {
  sourceShapeId?: string | null;
  sourceAnchor?: "top" | "right" | "bottom" | "left" | "center" | null;
  targetShapeId?: string | null;
  targetAnchor?: "top" | "right" | "bottom" | "left" | "center" | null;
  routing?: "straight" | "orthogonal" | "curved";
};

export type LineShapeResponseDto = BaseShapeResponseDto & {
  type: "line";
  points: number[];
  style: {
    stroke: string;
    strokeWidth: number;
    opacity: number;
    strokeStyle?: StrokeStyle;
    shadow?: ShapeShadowDto;
  };
};

export type ArrowShapeResponseDto = BaseShapeResponseDto & {
  type: "arrow";
  points: number[];
  style: {
    stroke: string;
    strokeWidth: number;
    opacity: number;
    strokeStyle?: StrokeStyle;
    shadow?: ShapeShadowDto;
    arrowHeadEnd: boolean;
    arrowHeadStart?: boolean;
    pointerLength?: number;
    pointerWidth?: number;
  };
};

export type ConnectorShapeResponseDto = BaseShapeResponseDto & {
  type: "connector";
  points: number[];
  connector?: ShapeConnectorDto;
  style: {
    stroke: string;
    strokeWidth: number;
    opacity: number;
    strokeStyle?: StrokeStyle;
    shadow?: ShapeShadowDto;
    arrowHeadEnd?: boolean;
    arrowHeadStart?: boolean;
    pointerLength?: number;
    pointerWidth?: number;
  };
};

export type ShapeConfigDto = {
  sides?: number;
  points?: number;
  innerRadiusRatio?: number;
};

export type CircleShapeResponseDto = BaseShapeResponseDto & {
  type: "circle";
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeStyle?: StrokeStyle;
    opacity: number;
    shadow?: ShapeShadowDto;
  };
};

export type EllipseShapeResponseDto = BaseShapeResponseDto & {
  type: "ellipse";
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeStyle?: StrokeStyle;
    opacity: number;
    shadow?: ShapeShadowDto;
  };
};

export type TriangleShapeResponseDto = BaseShapeResponseDto & {
  type: "triangle";
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeStyle?: StrokeStyle;
    opacity: number;
    shadow?: ShapeShadowDto;
  };
};

export type PolygonShapeResponseDto = BaseShapeResponseDto & {
  type: "polygon";
  shapeConfig?: {
    sides: number;
  };
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeStyle?: StrokeStyle;
    opacity: number;
    shadow?: ShapeShadowDto;
  };
};

export type StarShapeResponseDto = BaseShapeResponseDto & {
  type: "star";
  shapeConfig?: {
    points: number;
    innerRadiusRatio: number;
  };
  style: {
    fill: string;
    stroke: string;
    strokeWidth: number;
    strokeStyle?: StrokeStyle;
    opacity: number;
    shadow?: ShapeShadowDto;
  };
};

export type GroupShapeResponseDto = BaseShapeResponseDto & {
  type: "group";
  style?: Record<string, unknown>;
};

export type ShapeResponseDto =
  | RectangleShapeResponseDto
  | CircleShapeResponseDto
  | EllipseShapeResponseDto
  | TriangleShapeResponseDto
  | PolygonShapeResponseDto
  | StarShapeResponseDto
  | TextShapeResponseDto
  | StickyNoteShapeResponseDto
  | FreehandShapeResponseDto
  | LineShapeResponseDto
  | ArrowShapeResponseDto
  | ConnectorShapeResponseDto
  | GroupShapeResponseDto;

export type ShapeStyleRequest = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  strokeStyle?: "solid" | "dashed";
  arrowHeadEnd?: boolean;
  arrowHeadStart?: boolean;
  pointerLength?: number;
  pointerWidth?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: "normal" | "italic";
  textDecoration?: "none" | "underline";
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  padding?: number;
  lineHeight?: number;
  backgroundColor?: string;
  textColor?: string;
  points?: number[];
};

export type CreateShapeRequest = {
  canvasId: string;
  type:
    | "rectangle"
    | "circle"
    | "ellipse"
    | "triangle"
    | "polygon"
    | "star"
    | "text"
    | "sticky_note"
    | "freehand"
    | "line"
    | "arrow"
    | "connector"
    | "group";
  x: number;
  y: number;
  width: number;
  height: number;
  rotation?: number;
  text?: string;
  parentId?: string | null;
  points?: number[];
  connector?: ShapeConnectorDto;
  shapeConfig?: ShapeConfigDto;
  style?: ShapeStyleRequest;
};

export type UpdateShapeRequest = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  text?: string;
  points?: number[];
  connector?: ShapeConnectorDto;
  shapeConfig?: ShapeConfigDto;
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
