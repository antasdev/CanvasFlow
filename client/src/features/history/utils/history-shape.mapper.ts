import type {
  ArrowShape,
  CircleShape,
  ConnectorShape,
  EllipseShape,
  FreehandShape,
  GroupShape,
  LineShape,
  PolygonShape,
  RectangleShape,
  Shape,
  ShapeShadow,
  StarShape,
  StickyNoteShape,
  StrokeStyle,
  TextAlign,
  TextDecoration,
  TextFontStyle,
  TextShape,
  TextVerticalAlign,
  TriangleShape,
} from "@/features/canvas/types";

import type { VersionShapeSnapshot } from "../types/history.types";

function extractShadow(style?: Record<string, unknown>): ShapeShadow | undefined {
  if (!style || !style.shadow || typeof style.shadow !== "object") {
    return undefined;
  }
  const s = style.shadow as Record<string, unknown>;
  return {
    enabled: Boolean(s.enabled),
    color: typeof s.color === "string" ? s.color : "#000000",
    blur: typeof s.blur === "number" ? s.blur : 10,
    offsetX: typeof s.offsetX === "number" ? s.offsetX : 0,
    offsetY: typeof s.offsetY === "number" ? s.offsetY : 4,
    opacity: typeof s.opacity === "number" ? s.opacity : 0.3,
  };
}

function extractStrokeStyle(style?: Record<string, unknown>): StrokeStyle | undefined {
  if (!style || typeof style.strokeStyle !== "string") {
    return undefined;
  }
  if (style.strokeStyle === "dashed" || style.strokeStyle === "dotted" || style.strokeStyle === "solid") {
    return style.strokeStyle;
  }
  return undefined;
}

function extractString(val: unknown, fallback: string): string {
  return typeof val === "string" ? val : fallback;
}

function extractNumber(val: unknown, fallback: number): number {
  return typeof val === "number" && !Number.isNaN(val) ? val : fallback;
}

/**
 * Maps a single VersionShapeSnapshot into the frontend Shape discriminated union.
 */
export function mapVersionShapeSnapshotToShape(snapshot: VersionShapeSnapshot): Shape {
  const style = snapshot.style ?? {};
  const shadow = extractShadow(style);
  const strokeStyle = extractStrokeStyle(style);
  const opacity = extractNumber(style.opacity, 1);
  const stroke = extractString(style.stroke, "#1f2937");
  const strokeWidth = extractNumber(style.strokeWidth, 2);
  const fill = extractString(style.fill, "#ffffff");

  const baseProps = {
    id: snapshot.id,
    x: snapshot.x,
    y: snapshot.y,
    width: snapshot.width,
    height: snapshot.height,
    rotation: snapshot.rotation ?? 0,
    zIndex: snapshot.zIndex ?? 0,
    opacity,
    version: snapshot.version ?? 1,
    ...(snapshot.parentId ? { parentId: snapshot.parentId } : {}),
    ...(strokeStyle ? { strokeStyle } : {}),
    ...(shadow ? { shadow } : {}),
  };

  switch (snapshot.type) {
    case "group": {
      const group: GroupShape = {
        id: snapshot.id,
        type: "group",
        x: snapshot.x,
        y: snapshot.y,
        width: snapshot.width,
        height: snapshot.height,
        rotation: snapshot.rotation ?? 0,
        zIndex: snapshot.zIndex ?? 0,
        opacity,
        version: snapshot.version ?? 1,
        ...(snapshot.parentId ? { parentId: snapshot.parentId } : {}),
      };
      return group;
    }

    case "circle": {
      const circle: CircleShape = {
        ...baseProps,
        type: "circle",
        fill,
        stroke,
        strokeWidth,
      };
      return circle;
    }

    case "ellipse": {
      const ellipse: EllipseShape = {
        ...baseProps,
        type: "ellipse",
        fill,
        stroke,
        strokeWidth,
      };
      return ellipse;
    }

    case "triangle": {
      const triangle: TriangleShape = {
        ...baseProps,
        type: "triangle",
        fill,
        stroke,
        strokeWidth,
      };
      return triangle;
    }

    case "polygon": {
      const sides =
        typeof snapshot.shapeConfig?.sides === "number"
          ? snapshot.shapeConfig.sides
          : 5;
      const polygon: PolygonShape = {
        ...baseProps,
        type: "polygon",
        sides,
        shapeConfig: { sides },
        fill,
        stroke,
        strokeWidth,
      };
      return polygon;
    }

    case "star": {
      const points =
        typeof snapshot.shapeConfig?.points === "number"
          ? snapshot.shapeConfig.points
          : 5;
      const innerRadiusRatio =
        typeof snapshot.shapeConfig?.innerRadiusRatio === "number"
          ? snapshot.shapeConfig.innerRadiusRatio
          : 0.5;
      const star: StarShape = {
        ...baseProps,
        type: "star",
        shapeConfig: { points, innerRadiusRatio },
        fill,
        stroke,
        strokeWidth,
      };
      return star;
    }

    case "line": {
      const line: LineShape = {
        ...baseProps,
        type: "line",
        points: Array.isArray(snapshot.points)
          ? snapshot.points
          : [0, 0, snapshot.width, snapshot.height],
        stroke,
        strokeWidth,
      };
      return line;
    }

    case "arrow": {
      const arrow: ArrowShape = {
        ...baseProps,
        type: "arrow",
        points: Array.isArray(snapshot.points)
          ? snapshot.points
          : [0, 0, snapshot.width, snapshot.height],
        stroke,
        strokeWidth,
        arrowHeadEnd: typeof style.arrowHeadEnd === "boolean" ? style.arrowHeadEnd : true,
        arrowHeadStart: typeof style.arrowHeadStart === "boolean" ? style.arrowHeadStart : false,
        pointerLength: typeof style.pointerLength === "number" ? style.pointerLength : 10,
        pointerWidth: typeof style.pointerWidth === "number" ? style.pointerWidth : 10,
      };
      return arrow;
    }

    case "connector": {
      const conn: ConnectorShape = {
        ...baseProps,
        type: "connector",
        points: Array.isArray(snapshot.points)
          ? snapshot.points
          : [0, 0, snapshot.width, snapshot.height],
        stroke,
        strokeWidth,
        connector: snapshot.connector
          ? {
              sourceShapeId: snapshot.connector.sourceShapeId ?? null,
              sourceAnchor: snapshot.connector.sourceAnchor ?? null,
              targetShapeId: snapshot.connector.targetShapeId ?? null,
              targetAnchor: snapshot.connector.targetAnchor ?? null,
              routing: snapshot.connector.routing ?? "straight",
            }
          : undefined,
        arrowHeadEnd: typeof style.arrowHeadEnd === "boolean" ? style.arrowHeadEnd : true,
        arrowHeadStart: typeof style.arrowHeadStart === "boolean" ? style.arrowHeadStart : false,
        pointerLength: typeof style.pointerLength === "number" ? style.pointerLength : 10,
        pointerWidth: typeof style.pointerWidth === "number" ? style.pointerWidth : 10,
      };
      return conn;
    }

    case "freehand": {
      const freehand: FreehandShape = {
        ...baseProps,
        type: "freehand",
        points: Array.isArray(snapshot.points) ? snapshot.points : [],
        stroke,
        strokeWidth,
      };
      return freehand;
    }

    case "text": {
      const textContent =
        typeof snapshot.text === "string"
          ? snapshot.text
          : typeof style.text === "string"
          ? style.text
          : "";

      const textAlign: TextAlign =
        style.textAlign === "center" || style.textAlign === "right"
          ? style.textAlign
          : "left";

      const verticalAlign: TextVerticalAlign =
        style.verticalAlign === "middle" || style.verticalAlign === "bottom"
          ? style.verticalAlign
          : "top";

      const fontStyle: TextFontStyle =
        style.fontStyle === "italic" ? "italic" : "normal";

      const textDecoration: TextDecoration =
        style.textDecoration === "underline" ? "underline" : "none";

      const textShape: TextShape = {
        ...baseProps,
        type: "text",
        text: textContent,
        fontSize: extractNumber(style.fontSize, 24),
        fontFamily: extractString(style.fontFamily, "Inter"),
        fontWeight: typeof style.fontWeight === "string" || typeof style.fontWeight === "number" ? style.fontWeight : "normal",
        fontStyle,
        textDecoration,
        textAlign,
        verticalAlign,
        fill: extractString(style.fill, "#1f2937"),
        padding: extractNumber(style.padding, 8),
        lineHeight: extractNumber(style.lineHeight, 1.2),
      };
      return textShape;
    }

    case "sticky_note": {
      const sticky: StickyNoteShape = {
        ...baseProps,
        type: "sticky_note",
        text: extractString(snapshot.text ?? style.text, ""),
        fontSize: extractNumber(style.fontSize, 14),
        backgroundColor: extractString(style.backgroundColor, "#fef08a"),
        textColor: extractString(style.textColor, "#1f2937"),
      };
      return sticky;
    }

    case "rectangle":
    default: {
      const rect: RectangleShape = {
        ...baseProps,
        type: "rectangle",
        fill,
        stroke,
        strokeWidth,
      };
      return rect;
    }
  }
}
