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
} as const;

export type CanvasTool =
  (typeof CANVAS_TOOLS)[keyof typeof CANVAS_TOOLS];