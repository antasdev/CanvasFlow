export type GridLine = {
  id: string;
  points: [number, number, number, number];
  isVertical: boolean;
};

export type CalculateGridOptions = {
  width: number;
  height: number;
  pan?: { x: number; y: number };
  zoom?: number;
  gridSize?: number;
  maxLinesPerAxis?: number;
};

export type CalculateGridResult = {
  lines: GridLine[];
  step: number;
  strokeWidth: number;
};

function normalizeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

/**
 * Calculates infinite adaptive grid lines aligned to world-space coordinates.
 * Line density automatically scales with zoom level to prevent visual noise
 * and maintain consistent 60fps rendering performance.
 */
export function calculateInfiniteGridLines({
  width,
  height,
  pan = { x: 0, y: 0 },
  zoom = 1,
  gridSize = 40,
  maxLinesPerAxis = 200,
}: CalculateGridOptions): CalculateGridResult {
  if (width <= 0 || height <= 0 || gridSize <= 0) {
    return { lines: [], step: gridSize, strokeWidth: 1 };
  }

  const effectiveZoom = Math.max(0.05, zoom);

  // Adaptive step calculation based on zoom level
  let step = gridSize;
  if (effectiveZoom < 0.35) {
    step = gridSize * 4;
  } else if (effectiveZoom < 0.7) {
    step = gridSize * 2;
  }

  // Screen-constant line stroke width
  const strokeWidth = Math.max(0.5, 1 / effectiveZoom);

  // Compute visible viewport bounds in world coordinates
  const worldLeft = -pan.x / effectiveZoom;
  const worldRight = (-pan.x + width) / effectiveZoom;
  const worldTop = -pan.y / effectiveZoom;
  const worldBottom = (-pan.y + height) / effectiveZoom;

  // Align start/end to step boundaries
  const startX = normalizeZero(Math.floor(worldLeft / step) * step);
  const endX = normalizeZero(Math.ceil(worldRight / step) * step);
  const startY = normalizeZero(Math.floor(worldTop / step) * step);
  const endY = normalizeZero(Math.ceil(worldBottom / step) * step);

  const lines: GridLine[] = [];

  // Generate vertical grid lines
  let vCount = 0;
  for (let x = startX; x <= endX && vCount < maxLinesPerAxis; x += step) {
    const snappedX = normalizeZero(Math.round(x));
    lines.push({
      id: `v-${snappedX}`,
      points: [snappedX, startY, snappedX, endY],
      isVertical: true,
    });
    vCount++;
  }

  // Generate horizontal grid lines
  let hCount = 0;
  for (let y = startY; y <= endY && hCount < maxLinesPerAxis; y += step) {
    const snappedY = normalizeZero(Math.round(y));
    lines.push({
      id: `h-${snappedY}`,
      points: [startX, snappedY, endX, snappedY],
      isVertical: false,
    });
    hCount++;
  }

  return { lines, step, strokeWidth };
}
