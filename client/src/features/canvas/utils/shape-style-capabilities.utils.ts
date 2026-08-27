import type { ShapeType } from "../types/shape.types";

export interface ShapeStyleCapabilities {
  canFill: boolean;
  canStroke: boolean;
  canStrokeWidth: boolean;
  canStrokeStyle: boolean;
  canOpacity: boolean;
  canShadow: boolean;
}

const NO_CAPABILITIES: ShapeStyleCapabilities = {
  canFill: false,
  canStroke: false,
  canStrokeWidth: false,
  canStrokeStyle: false,
  canOpacity: false,
  canShadow: false,
};

const FILLED_SHAPE_CAPABILITIES: ShapeStyleCapabilities = {
  canFill: true,
  canStroke: true,
  canStrokeWidth: true,
  canStrokeStyle: true,
  canOpacity: true,
  canShadow: true,
};

const VECTOR_SHAPE_CAPABILITIES: ShapeStyleCapabilities = {
  canFill: false,
  canStroke: true,
  canStrokeWidth: true,
  canStrokeStyle: true,
  canOpacity: true,
  canShadow: true,
};

const TEXT_SHAPE_CAPABILITIES: ShapeStyleCapabilities = {
  canFill: true, // Used as text color
  canStroke: false,
  canStrokeWidth: false,
  canStrokeStyle: false,
  canOpacity: true,
  canShadow: true,
};

const STICKY_NOTE_CAPABILITIES: ShapeStyleCapabilities = {
  canFill: true, // Used as note background color
  canStroke: false,
  canStrokeWidth: false,
  canStrokeStyle: false,
  canOpacity: true,
  canShadow: true,
};

/**
 * Returns capability-aware styling capabilities for a single shape type.
 */
export function getShapeStyleCapabilities(shapeType: ShapeType | string): ShapeStyleCapabilities {
  switch (shapeType) {
    case "rectangle":
    case "circle":
    case "ellipse":
    case "triangle":
    case "polygon":
    case "star":
      return FILLED_SHAPE_CAPABILITIES;

    case "line":
    case "arrow":
    case "connector":
    case "freehand":
      return VECTOR_SHAPE_CAPABILITIES;

    case "text":
      return TEXT_SHAPE_CAPABILITIES;

    case "sticky_note":
      return STICKY_NOTE_CAPABILITIES;

    default:
      return NO_CAPABILITIES;
  }
}

/**
 * Aggregates style capabilities across a collection of selected shapes.
 * A capability is supported if at least one selected shape supports it.
 */
export function getMultiShapeCapabilities(
  shapes: Array<{ type: ShapeType | string }>
): ShapeStyleCapabilities {
  if (!shapes || shapes.length === 0) {
    return NO_CAPABILITIES;
  }

  const result: ShapeStyleCapabilities = {
    canFill: false,
    canStroke: false,
    canStrokeWidth: false,
    canStrokeStyle: false,
    canOpacity: false,
    canShadow: false,
  };

  for (const s of shapes) {
    const caps = getShapeStyleCapabilities(s.type);
    if (caps.canFill) result.canFill = true;
    if (caps.canStroke) result.canStroke = true;
    if (caps.canStrokeWidth) result.canStrokeWidth = true;
    if (caps.canStrokeStyle) result.canStrokeStyle = true;
    if (caps.canOpacity) result.canOpacity = true;
    if (caps.canShadow) result.canShadow = true;
  }

  return result;
}

/**
 * Checks if a specific shape type supports updating a particular style key.
 */
export function isShapeCompatibleWithProperty(
  shapeType: ShapeType | string,
  property: "fill" | "stroke" | "strokeWidth" | "strokeStyle" | "opacity" | "shadow"
): boolean {
  const caps = getShapeStyleCapabilities(shapeType);
  switch (property) {
    case "fill":
      return caps.canFill;
    case "stroke":
      return caps.canStroke;
    case "strokeWidth":
      return caps.canStrokeWidth;
    case "strokeStyle":
      return caps.canStrokeStyle;
    case "opacity":
      return caps.canOpacity;
    case "shadow":
      return caps.canShadow;
    default:
      return false;
  }
}
