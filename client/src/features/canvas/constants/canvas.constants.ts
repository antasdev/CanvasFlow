export const CANVAS_TOOLS = {
  SELECT: "select",
  RECTANGLE: "rectangle",
  CIRCLE: "circle",
  LINE: "line",
  ARROW: "arrow",
  TEXT: "text",
  FREEHAND: "freehand",
} as const;

export type CanvasTool =
  (typeof CANVAS_TOOLS)[keyof typeof CANVAS_TOOLS];