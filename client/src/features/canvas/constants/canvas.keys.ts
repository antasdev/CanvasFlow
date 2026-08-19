export const canvasKeys = {
  all: ["canvases"] as const,

  boardCanvases: (boardId: string) =>
    [...canvasKeys.all, "board", boardId] as const,

  detail: (canvasId: string) =>
    [...canvasKeys.all, "detail", canvasId] as const,

  shapes: (canvasId: string) =>
    ["shapes", "canvas", canvasId] as const,
};
