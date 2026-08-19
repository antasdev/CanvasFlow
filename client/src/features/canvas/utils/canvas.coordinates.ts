export type CanvasPoint = {
  x: number;
  y: number;
};

export type CanvasTransform = {
  zoom: number;
  pan: CanvasPoint;
};

export const screenToWorld = (
  point: CanvasPoint,
  transform: CanvasTransform,
): CanvasPoint => {
  return {
    x:
      (point.x - transform.pan.x) /
      transform.zoom,

    y:
      (point.y - transform.pan.y) /
      transform.zoom,
  };
};

export const worldToScreen = (
  point: CanvasPoint,
  transform: CanvasTransform,
): CanvasPoint => {
  return {
    x:
      point.x * transform.zoom +
      transform.pan.x,

    y:
      point.y * transform.zoom +
      transform.pan.y,
  };
};