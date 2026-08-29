import React, { useMemo } from "react";
import { Line } from "react-konva";
import { calculateInfiniteGridLines } from "../utils/grid.utils";

type CanvasGridProps = {
  width: number;
  height: number;
  pan?: { x: number; y: number };
  zoom?: number;
  gridSize?: number;
};

export default function CanvasGrid({
  width,
  height,
  pan = { x: 0, y: 0 },
  zoom = 1,
  gridSize = 40,
}: CanvasGridProps): React.JSX.Element {
  const { lines, strokeWidth } = useMemo(() => {
    return calculateInfiniteGridLines({
      width,
      height,
      pan,
      zoom,
      gridSize,
    });
  }, [width, height, pan.x, pan.y, zoom, gridSize]);

  return (
    <>
      {lines.map((l) => (
        <Line
          key={l.id}
          points={l.points}
          stroke="#f1f5f9"
          strokeWidth={strokeWidth}
          listening={false}
          perfectDrawEnabled={false}
        />
      ))}
    </>
  );
}