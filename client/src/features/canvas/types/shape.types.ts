export type ShapeType =
  | "select"
  | "rectangle"
  | "circle"
  | "ellipse"
  | "triangle"
  | "polygon"
  | "star"
  | "line"
  | "arrow"
  | "connector"
  | "text"
  | "sticky_note"
  | "freehand"
  | "group"
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

export type StrokeStyle = "solid" | "dashed" | "dotted";

export type ShapeShadow = {
  enabled: boolean;
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
  opacity: number;
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
  parentId?: string | null;
  version?: number;
  strokeStyle?: StrokeStyle;
  shadow?: ShapeShadow;
};

export type RectangleShape = BaseShape & {
  type: "rectangle";
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeStyle?: StrokeStyle;
  shadow?: ShapeShadow;
};

export type TextFontStyle = "normal" | "italic";
export type TextDecoration = "none" | "underline";
export type TextAlign = "left" | "center" | "right";
export type TextVerticalAlign = "top" | "middle" | "bottom";

export type TextShape = BaseShape & {
  type: "text";
  text: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: string | number;
  fontStyle: TextFontStyle;
  textDecoration: TextDecoration;
  textAlign: TextAlign;
  verticalAlign: TextVerticalAlign;
  fill: string;
  opacity: number;
  padding: number;
  lineHeight: number;
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
  fill: string;
  stroke: string;
  strokeWidth: number;
};

export type EllipseShape = BaseShape & {
  type: "ellipse";
  fill: string;
  stroke: string;
  strokeWidth: number;
};

export type TriangleShape = BaseShape & {
  type: "triangle";
  fill: string;
  stroke: string;
  strokeWidth: number;
};

export type PolygonShape = BaseShape & {
  type: "polygon";
  sides?: number;
  shapeConfig?: {
    sides: number;
  };
  fill: string;
  stroke: string;
  strokeWidth: number;
};

export type StarShape = BaseShape & {
  type: "star";
  shapeConfig?: {
    points: number;
    innerRadiusRatio: number;
  };
  fill: string;
  stroke: string;
  strokeWidth: number;
};

export type LineShape = BaseShape & {
  type: "line";
  points: number[];
  stroke: string;
  strokeWidth: number;
  strokeStyle?: StrokeStyle;
};

export type ArrowShape = BaseShape & {
  type: "arrow";
  points: number[];
  stroke: string;
  strokeWidth: number;
  strokeStyle?: StrokeStyle;
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
  strokeStyle?: StrokeStyle;
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
  strokeStyle?: StrokeStyle;
};

export type GroupShape = BaseShape & {
  type: "group";
};

export type Shape =
  | RectangleShape
  | TextShape
  | StickyNoteShape
  | CircleShape
  | EllipseShape
  | TriangleShape
  | PolygonShape
  | StarShape
  | LineShape
  | ArrowShape
  | ConnectorShape
  | FreehandShape
  | GroupShape;

export type ShapeStyle = {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  strokeStyle?: StrokeStyle;
  opacity?: number;
  shadow?: Partial<ShapeShadow>;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: TextFontStyle;
  textDecoration?: TextDecoration;
  textAlign?: TextAlign;
  verticalAlign?: TextVerticalAlign;
  padding?: number;
  lineHeight?: number;
  backgroundColor?: string;
  textColor?: string;
  points?: number[];
  arrowHeadEnd?: boolean;
  arrowHeadStart?: boolean;
  pointerLength?: number;
  pointerWidth?: number;
};