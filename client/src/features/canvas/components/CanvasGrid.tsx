import { Line } from "react-konva";

type CanvasGridProps = {
  width: number;
  height: number;
  gridSize?: number;
};

export default function CanvasGrid({
  width,
  height,
  gridSize = 40,
}: CanvasGridProps): React.JSX.Element {
  const lines: React.JSX.Element[] = [];

  for (let x = 0; x <= width; x += gridSize) {
    lines.push(
      <Line
        key={`vertical-${x}`}
        points={[x, 0, x, height]}
        stroke="#e2e8f0"
        strokeWidth={1}
      />,
    );
  }

  for (let y = 0; y <= height; y += gridSize) {
    lines.push(
      <Line
        key={`horizontal-${y}`}
        points={[0, y, width, y]}
        stroke="#e2e8f0"
        strokeWidth={1}
      />,
    );
  }

  return <>{lines}</>;
}