export const CANVAS_TOOLS = {
  SELECT: "select",
  RECTANGLE: "rectangle",
  CIRCLE: "circle",
  ELLIPSE: "ellipse",
  TRIANGLE: "triangle",
  POLYGON: "polygon",
  STAR: "star",
  LINE: "line",
  ARROW: "arrow",
  TEXT: "text",
  STICKY_NOTE: "sticky_note",
  FREEHAND: "freehand",
  CONNECTOR: "connector",
  LASSO: "lasso",
  HAND: "hand",
} as const;

export type CanvasTool =
  (typeof CANVAS_TOOLS)[keyof typeof CANVAS_TOOLS];

export const MIN_ZOOM = 0.2;
export const MAX_ZOOM = 3.0;
export const DEFAULT_ZOOM = 1.0;
export const ZOOM_STEP = 1.1;
export const ZOOM_PRESETS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0] as const;