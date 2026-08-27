import type { Shape, ShapeShadow, StrokeStyle, ShapeStyle } from "../types/shape.types";

export const DEFAULT_SHADOW: ShapeShadow = {
  enabled: false,
  color: "#000000",
  blur: 10,
  offsetX: 0,
  offsetY: 4,
  opacity: 0.3,
};

export const STROKE_DASH_PATTERNS: Record<StrokeStyle, number[] | undefined> = {
  solid: undefined,
  dashed: [10, 6],
  dotted: [3, 5],
};

export const PRESET_FILL_COLORS = [
  "transparent",
  "#ffffff",
  "#f8fafc",
  "#f1f5f9",
  "#fee2e2",
  "#fef3c7",
  "#dcfce7",
  "#e0e7ff",
  "#f3e8ff",
  "#3b82f6",
  "#ef4444",
  "#10b981",
  "#f59e0b",
  "#8b5cf6",
  "#1f2937",
  "#000000",
];

export const PRESET_STROKE_COLORS = [
  "#000000",
  "#1f2937",
  "#475569",
  "#94a3b8",
  "#ef4444",
  "#f59e0b",
  "#10b981",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#ec4899",
];

export const PRESET_STROKE_WIDTHS = [1, 2, 4, 6, 8, 12, 16];

/**
 * Returns Konva-compatible dash array based on StrokeStyle.
 */
export function getKonvaDash(strokeStyle?: StrokeStyle): number[] | undefined {
  if (!strokeStyle || strokeStyle === "solid") {
    return undefined;
  }
  return STROKE_DASH_PATTERNS[strokeStyle] ?? undefined;
}

export interface KonvaStyleProps {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  dash?: number[];
  opacity: number;
  shadowEnabled: boolean;
  shadowColor: string;
  shadowBlur: number;
  shadowOffset: { x: number; y: number };
  shadowOpacity: number;
}

/**
 * Transforms a shape domain model into style properties consumed directly by Konva Shape nodes.
 */
export function getKonvaStyleProps(shape: Shape, isLocked = false): KonvaStyleProps {
  const shapeWithFill = shape as { fill?: string };
  const shapeWithStroke = shape as { stroke?: string; strokeWidth?: number; strokeStyle?: StrokeStyle };

  const shadow = shape.shadow ?? DEFAULT_SHADOW;

  return {
    fill: shapeWithFill.fill,
    stroke: shapeWithStroke.stroke,
    strokeWidth: shapeWithStroke.strokeWidth,
    dash: getKonvaDash(shapeWithStroke.strokeStyle),
    opacity: isLocked ? (shape.opacity ?? 1) * 0.8 : shape.opacity ?? 1,
    shadowEnabled: Boolean(shadow.enabled),
    shadowColor: shadow.color ?? "#000000",
    shadowBlur: typeof shadow.blur === "number" ? shadow.blur : 10,
    shadowOffset: {
      x: typeof shadow.offsetX === "number" ? shadow.offsetX : 0,
      y: typeof shadow.offsetY === "number" ? shadow.offsetY : 4,
    },
    shadowOpacity: typeof shadow.opacity === "number" ? shadow.opacity : 0.3,
  };
}

/**
 * Inspects a property across an array of shapes and determines if they share a single value
 * or if they are in a "Mixed" state.
 */
export function getMixedStyleValue<T>(
  shapes: Shape[],
  getter: (shape: Shape) => T | undefined
): { isMixed: boolean; value: T | undefined } {
  if (!shapes || shapes.length === 0) {
    return { isMixed: false, value: undefined };
  }

  const values: T[] = [];
  for (const s of shapes) {
    const val = getter(s);
    if (val !== undefined) {
      values.push(val);
    }
  }

  if (values.length === 0) {
    return { isMixed: false, value: undefined };
  }

  const first = values[0];
  const allMatch = values.every((v) => JSON.stringify(v) === JSON.stringify(first));

  if (allMatch) {
    return { isMixed: false, value: first };
  }

  return { isMixed: true, value: undefined };
}

/**
 * Extracts the current appearance style from a discriminated Shape union.
 */
export function getShapeStyle(shape: Shape): ShapeStyle {
  const baseStyle: ShapeStyle = {
    opacity: shape.opacity,
    strokeStyle: shape.strokeStyle,
    shadow: shape.shadow,
  };

  switch (shape.type) {
    case "rectangle":
    case "circle":
    case "ellipse":
    case "triangle":
    case "polygon":
    case "star":
      return {
        ...baseStyle,
        fill: shape.fill,
        stroke: shape.stroke,
        strokeWidth: shape.strokeWidth,
      };
    case "line":
    case "arrow":
    case "connector":
    case "freehand":
      return {
        ...baseStyle,
        stroke: shape.stroke,
        strokeWidth: shape.strokeWidth,
      };
    case "text":
      return {
        ...baseStyle,
        fill: shape.fill,
        fontSize: shape.fontSize,
        fontFamily: shape.fontFamily,
        fontWeight: shape.fontWeight,
        fontStyle: shape.fontStyle,
        textDecoration: shape.textDecoration,
        textAlign: shape.textAlign,
        verticalAlign: shape.verticalAlign,
        padding: shape.padding,
        lineHeight: shape.lineHeight,
      };
    case "sticky_note":
      return {
        ...baseStyle,
        backgroundColor: shape.backgroundColor,
        textColor: shape.textColor,
        fontSize: shape.fontSize,
      };
  }
}
