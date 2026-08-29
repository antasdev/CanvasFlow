import type { CanvasPoint } from "../utils/canvas.coordinates";

export type InteractionMode =
  | "idle"
  | "panning"
  | "selecting"
  | "marquee_selecting"
  | "lasso_selecting"
  | "drawing_shape"
  | "drawing_vector"
  | "drawing_freehand"
  | "transforming"
  | "text_editing";

export type PointerContext = {
  button: number;
  isSpacePressed: boolean;
  isMiddleMouse: boolean;
  isEmptyCanvas: boolean;
  isTransformerHandle: boolean;
};

export type ViewportState = {
  zoom: number;
  pan: CanvasPoint;
};

export type EscapeAction =
  | "cancel_drawing"
  | "cancel_selection"
  | "cancel_pan"
  | "discard_text"
  | "exit_group"
  | "clear_selection"
  | "reset_tool"
  | "none";

export type ToolSwitchCleanup = {
  shouldCancelDrawing: boolean;
  shouldCancelSelection: boolean;
  shouldCancelPan: boolean;
  shouldDiscardText: boolean;
  newCursor: string;
};
