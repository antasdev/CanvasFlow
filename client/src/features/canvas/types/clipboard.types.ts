import type { Shape } from "./shape.types";

export const CLIPBOARD_VERSION = 1;
export const CLIPBOARD_MIME_TYPE = "application/x-canvasflow";
export const PASTE_OFFSET = 20;
export const MAX_CLIPBOARD_SHAPES = 100;
export const MAX_CLIPBOARD_PAYLOAD_SIZE = 1024 * 1024; // 1MB

export type CanvasFlowClipboardData = {
  version: number;
  sourceCanvasId: string;
  shapes: Shape[];
  createdAt: number;
};
