export type ShapeType =
  | "select"
  | "rectangle"
  | "circle"
  | "line"
  | "arrow"
  | "connector"
  | "text"
  | "sticky_note"
  | "freehand"
  | "eraser";

export type AnchorPosition = "top" | "right" | "bottom" | "left" | "center";
export type ConnectorRouting = "straight" | "orthogonal" | "curved";

export type ShapeConnectorData = {
  sourceShapeId?: string | null;
  sourceAnchor?: AnchorPosition | null;
  targetShapeId?: string | null;
  targetAnchor?: AnchorPosition | null;
  routing?: ConnectorRouting;
};

export type BaseShape = {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  opacity: number;
  zIndex: number;
  version?: number;
};

export type RectangleShape = BaseShape & {
  type: "rectangle";
  fill: string;
  stroke: string;
  strokeWidth: number;
};

export type TextShape = BaseShape & {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: string | number;
  fontStyle: string;
  textAlign: "left" | "center" | "right";
  fill: string;
};

export type StickyNoteShape = BaseShape & {
  type: "sticky_note";
  text: string;
  fontSize: number;
  backgroundColor: string;
  textColor: string;
};

export type CircleShape = BaseShape & {
  type: "circle";
  radius: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
};

export type LineShape = BaseShape & {
  type: "line";
  points: number[];
  stroke: string;
  strokeWidth: number;
  strokeStyle?: "solid" | "dashed";
};

export type ArrowShape = BaseShape & {
  type: "arrow";
  points: number[];
  stroke: string;
  strokeWidth: number;
  arrowHeadEnd: boolean;
  arrowHeadStart?: boolean;
  pointerLength?: number;
  pointerWidth?: number;
};

export type ConnectorShape = BaseShape & {
  type: "connector";
  points: number[];
  stroke: string;
  strokeWidth: number;
  connector?: ShapeConnectorData;
  arrowHeadEnd?: boolean;
  arrowHeadStart?: boolean;
  pointerLength?: number;
  pointerWidth?: number;
};

export type FreehandShape = BaseShape & {
  type: "freehand";
  points: number[];
  stroke: string;
  strokeWidth: number;
};

export type Shape =
  | RectangleShape
  | TextShape
  | StickyNoteShape
  | CircleShape
  | LineShape
  | ArrowShape
  | ConnectorShape
  | FreehandShape;