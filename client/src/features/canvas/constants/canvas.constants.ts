export const CANVAS_TOOLS = {
  SELECT: "select",
  RECTANGLE: "rectangle",
  CIRCLE: "circle",
  LINE: "line",
  ARROW: "arrow",
  TEXT: "text",
  STICKY_NOTE: "sticky_note",
  FREEHAND: "freehand",
} as const;

export type CanvasTool =
  (typeof CANVAS_TOOLS)[keyof typeof CANVAS_TOOLS];