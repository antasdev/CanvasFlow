import type {
  Shape,
  RectangleShape,
  TextShape,
  StickyNoteShape,
  CircleShape,
  EllipseShape,
  TriangleShape,
  PolygonShape,
  StarShape,
  ArrowShape,
  FreehandShape,
  GroupShape,
} from "../types";

export interface PerformanceBoardOptions {
  seed?: number;
  gridSpacing?: number;
  canvasWidth?: number;
  includeGroups?: boolean;
}

/**
 * Deterministic pseudo-random fraction [0, 1) based on a numeric seed and index.
 * Avoids any nondeterminism or reliance on unseeded Math.random().
 */
function deterministicFraction(seed: number, index: number): number {
  const value = (seed * 9301 + index * 49297 + 233280) % 233280;
  return value / 233280;
}

const PALETTE = [
  "#2563eb", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // purple
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#64748b", // slate
];

/**
 * Generates a deterministic benchmark dataset of valid CanvasFlow shapes
 * arranged across a 2D spatial grid.
 */
export function generatePerformanceBoard(
  count: number,
  options: PerformanceBoardOptions = {}
): Shape[] {
  const seed = options.seed ?? 42;
  const gridSpacing = options.gridSpacing ?? 160;
  const columns = Math.max(1, Math.ceil(Math.sqrt(count)));

  const shapes: Shape[] = [];

  for (let i = 0; i < count; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const baseX = col * gridSpacing + 50;
    const baseY = row * gridSpacing + 50;

    const jitterX = (deterministicFraction(seed, i * 3) - 0.5) * 20;
    const jitterY = (deterministicFraction(seed, i * 3 + 1) - 0.5) * 20;
    const x = Math.round(baseX + jitterX);
    const y = Math.round(baseY + jitterY);

    const colorIndex = Math.floor(deterministicFraction(seed, i * 7) * PALETTE.length);
    const color = PALETTE[colorIndex] ?? "#2563eb";
    const typeMod = i % 12;

    switch (typeMod) {
      case 0:
      case 1:
      case 2: {
        const rect: RectangleShape = {
          id: `perf-shape-${i}`,
          type: "rectangle",
          x,
          y,
          width: 120,
          height: 80,
          rotation: 0,
          opacity: 1,
          zIndex: i + 1,
          fill: color,
          stroke: "#1e293b",
          strokeWidth: 2,
        };
        shapes.push(rect);
        break;
      }

      case 3: {
        const circle: CircleShape = {
          id: `perf-shape-${i}`,
          type: "circle",
          x,
          y,
          width: 90,
          height: 90,
          rotation: 0,
          opacity: 1,
          zIndex: i + 1,
          fill: color,
          stroke: "#1e293b",
          strokeWidth: 2,
        };
        shapes.push(circle);
        break;
      }

      case 4: {
        const text: TextShape = {
          id: `perf-shape-${i}`,
          type: "text",
          x,
          y,
          width: 140,
          height: 40,
          rotation: 0,
          opacity: 1,
          zIndex: i + 1,
          text: `Benchmark Item ${i}`,
          fontSize: 16,
          fontFamily: "Inter",
          fontWeight: 400,
          fontStyle: "normal",
          textDecoration: "none",
          textAlign: "left",
          verticalAlign: "top",
          fill: "#0f172a",
          padding: 8,
          lineHeight: 1.2,
        };
        shapes.push(text);
        break;
      }

      case 5: {
        const sticky: StickyNoteShape = {
          id: `perf-shape-${i}`,
          type: "sticky_note",
          x,
          y,
          width: 120,
          height: 120,
          rotation: 0,
          opacity: 1,
          zIndex: i + 1,
          text: `Note ${i}`,
          fontSize: 14,
          backgroundColor: "#fef08a",
          textColor: "#854d0e",
        };
        shapes.push(sticky);
        break;
      }

      case 6: {
        const ellipse: EllipseShape = {
          id: `perf-shape-${i}`,
          type: "ellipse",
          x,
          y,
          width: 110,
          height: 70,
          rotation: 0,
          opacity: 1,
          zIndex: i + 1,
          fill: color,
          stroke: "#1e293b",
          strokeWidth: 2,
        };
        shapes.push(ellipse);
        break;
      }

      case 7: {
        const triangle: TriangleShape = {
          id: `perf-shape-${i}`,
          type: "triangle",
          x,
          y,
          width: 100,
          height: 90,
          rotation: 0,
          opacity: 1,
          zIndex: i + 1,
          fill: color,
          stroke: "#1e293b",
          strokeWidth: 2,
        };
        shapes.push(triangle);
        break;
      }

      case 8: {
        const polygon: PolygonShape = {
          id: `perf-shape-${i}`,
          type: "polygon",
          x,
          y,
          width: 100,
          height: 100,
          rotation: 0,
          opacity: 1,
          zIndex: i + 1,
          sides: 5,
          shapeConfig: { sides: 5 },
          fill: color,
          stroke: "#1e293b",
          strokeWidth: 2,
        };
        shapes.push(polygon);
        break;
      }

      case 9: {
        const star: StarShape = {
          id: `perf-shape-${i}`,
          type: "star",
          x,
          y,
          width: 100,
          height: 100,
          rotation: 0,
          opacity: 1,
          zIndex: i + 1,
          shapeConfig: { points: 5, innerRadiusRatio: 0.5 },
          fill: color,
          stroke: "#1e293b",
          strokeWidth: 2,
        };
        shapes.push(star);
        break;
      }

      case 10: {
        const arrow: ArrowShape = {
          id: `perf-shape-${i}`,
          type: "arrow",
          x,
          y,
          width: 120,
          height: 40,
          rotation: 0,
          opacity: 1,
          zIndex: i + 1,
          points: [0, 0, 120, 0],
          stroke: "#334155",
          strokeWidth: 2,
          arrowHeadEnd: true,
          pointerLength: 10,
          pointerWidth: 8,
        };
        shapes.push(arrow);
        break;
      }

      case 11:
      default: {
        const freehand: FreehandShape = {
          id: `perf-shape-${i}`,
          type: "freehand",
          x,
          y,
          width: 80,
          height: 60,
          rotation: 0,
          opacity: 1,
          zIndex: i + 1,
          points: [0, 0, 20, 15, 40, 10, 60, 35, 80, 50],
          stroke: color,
          strokeWidth: 3,
        };
        shapes.push(freehand);
        break;
      }
    }
  }

  return shapes;
}

/**
 * Generates a nested hierarchy of grouped shapes for benchmarking group transform
 * and bounding box recursion.
 */
export function generateGroupedPerformanceBoard(
  groupCount: number,
  shapesPerGroup: number = 4,
  nested: boolean = false
): Shape[] {
  const shapes: Shape[] = [];
  let zIndex = 1;

  for (let g = 0; g < groupCount; g++) {
    const groupId = `perf-group-${g}`;
    const groupX = (g % 20) * 400 + 100;
    const groupY = Math.floor(g / 20) * 400 + 100;

    let parentId: string | null = null;

    if (nested && g % 2 === 1) {
      // Nest within previous group
      parentId = `perf-group-${g - 1}`;
    }

    const groupShape: GroupShape = {
      id: groupId,
      type: "group",
      x: groupX,
      y: groupY,
      width: 300,
      height: 300,
      rotation: 0,
      opacity: 1,
      zIndex: zIndex++,
      parentId,
    };
    shapes.push(groupShape);

    for (let s = 0; s < shapesPerGroup; s++) {
      const childX = (s % 2) * 120 + 20;
      const childY = Math.floor(s / 2) * 120 + 20;

      const childShape: RectangleShape = {
        id: `perf-child-${g}-${s}`,
        type: "rectangle",
        x: childX,
        y: childY,
        width: 100,
        height: 80,
        rotation: 0,
        opacity: 1,
        zIndex: zIndex++,
        parentId: groupId,
        fill: PALETTE[s % PALETTE.length] ?? "#3b82f6",
        stroke: "#1e293b",
        strokeWidth: 2,
      };
      shapes.push(childShape);
    }
  }

  return shapes;
}

/**
 * Generates an synthetic high-frequency freehand point stream for stroke simplification benchmarks.
 */
export function generatePerformanceStroke(pointCount: number): number[] {
  const points: number[] = [];
  let x = 100;
  let y = 100;

  for (let i = 0; i < pointCount; i++) {
    points.push(Math.round(x), Math.round(y));
    x += 1.5 + (deterministicFraction(99, i * 2) - 0.5) * 1.0;
    y += Math.sin(i * 0.1) * 2.5 + (deterministicFraction(99, i * 2 + 1) - 0.5) * 0.8;
  }

  return points;
}
