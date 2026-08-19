export type ShapeType =
  | "select"
  | "rectangle"
  | "circle"
  | "line"
  | "arrow"
  | "text"
  | "freehand"
  | "eraser";

  export type BaseShape = {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  rotation: number;
  opacity: number;
  zIndex: number;
};

export type RectangleShape = BaseShape & {
  type: "rectangle";

  width: number;
  height: number;

  fill: string;
  stroke: string;
  strokeWidth: number;
};

export type CircleShape = BaseShape & {
  type: "circle";

  radius: number;

  fill: string;
  stroke: string;
  strokeWidth: number;
};

export type LineShape = BaseShape & {
  type: "line" | "arrow";

  points: number[];

  stroke: string;
  strokeWidth: number;
};

export type ArrowShape = BaseShape & {
  type: "arrow";

  points: number[];
};

export type TextShape = BaseShape & {
  type: "text";

  text: string;

  fontSize: number;
  fontFamily: string;
  fontWeight: number;

  fill: string;

  width?: number;
};

export type FreehandShape = BaseShape & {
  type: "freehand";

  points: number[];

  stroke: string;
  strokeWidth: number;
};

export type Shape =
  | RectangleShape
  | CircleShape
  | TextShape
  | LineShape
  | ArrowShape
  | FreehandShape;