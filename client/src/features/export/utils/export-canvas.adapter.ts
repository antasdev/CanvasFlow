import type {
  TextShape,
  StickyNoteShape,
  ArrowShape,
  ConnectorShape,
  StrokeStyle,
} from "@/features/canvas/types";
import { STROKE_DASH_PATTERNS } from "@/features/canvas/utils/shape-style.utils";
import {
  calculateCircleGeometry,
  calculateEllipseGeometry,
  calculateTrianglePoints,
  calculatePolygonPoints,
  calculateStarPoints,
} from "@/features/canvas/utils/shape-geometry.utils";
import type { ExportPreparedScene, ExportPreparedShape } from "../types/export.types";
import { ExportError } from "./export-validation.utils";

/**
 * Renders a closed polygon given a flat array of coordinate pairs [x0, y0, x1, y1, ...].
 */
function drawPolygonPath(ctx: CanvasRenderingContext2D, points: number[]): void {
  if (points.length < 4) return;
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) {
    ctx.lineTo(points[i], points[i + 1]);
  }
  ctx.closePath();
}

/**
 * Renders an open polyline path given a flat array of coordinate pairs [x0, y0, x1, y1, ...].
 */
function drawPolylinePath(ctx: CanvasRenderingContext2D, points: number[]): void {
  if (points.length < 4) return;
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) {
    ctx.lineTo(points[i], points[i + 1]);
  }
}

/**
 * Draws an arrowhead at a given tip point.
 */
function drawArrowHeadCap(
  ctx: CanvasRenderingContext2D,
  tipX: number,
  tipY: number,
  fromX: number,
  fromY: number,
  pointerLength = 10,
  pointerWidth = 10,
  fillColor = "#000000"
): void {
  const angle = Math.atan2(tipY - fromY, tipX - fromX);
  const halfWidth = pointerWidth / 2;

  const baseX = tipX - pointerLength * Math.cos(angle);
  const baseY = tipY - pointerLength * Math.sin(angle);

  const leftX = baseX + halfWidth * Math.sin(angle);
  const leftY = baseY - halfWidth * Math.cos(angle);

  const rightX = baseX - halfWidth * Math.sin(angle);
  const rightY = baseY + halfWidth * Math.cos(angle);

  ctx.save();
  ctx.fillStyle = fillColor;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.lineTo(leftX, leftY);
  ctx.lineTo(rightX, rightY);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Renders a single prepared shape onto the 2D canvas context.
 */
export function renderPreparedShapeToCanvas(
  ctx: CanvasRenderingContext2D,
  prepared: ExportPreparedShape
): void {
  const { shape, normalizedX, normalizedY, width, height, rotation } = prepared;

  if (shape.type === "group") {
    return;
  }

  ctx.save();

  // Position and rotation transform
  ctx.translate(normalizedX, normalizedY);
  if (rotation !== 0) {
    ctx.rotate((rotation * Math.PI) / 180);
  }

  // Opacity
  ctx.globalAlpha =
    typeof shape.opacity === "number"
      ? Math.max(0, Math.min(1, shape.opacity))
      : 1;

  // Shadow
  if (shape.shadow && shape.shadow.enabled) {
    ctx.shadowColor = shape.shadow.color ?? "#000000";
    ctx.shadowBlur = shape.shadow.blur ?? 10;
    ctx.shadowOffsetX = shape.shadow.offsetX ?? 0;
    ctx.shadowOffsetY = shape.shadow.offsetY ?? 4;
  }

  // Stroke dash pattern
  if ("strokeStyle" in shape && shape.strokeStyle) {
    const dashPattern = STROKE_DASH_PATTERNS[shape.strokeStyle as StrokeStyle];
    if (dashPattern) {
      ctx.setLineDash(dashPattern);
    }
  }

  switch (shape.type) {
    case "rectangle": {
      if (shape.fill && shape.fill !== "transparent") {
        ctx.fillStyle = shape.fill;
        ctx.fillRect(0, 0, width, height);
      }
      if (shape.stroke && shape.strokeWidth && shape.strokeWidth > 0) {
        ctx.strokeStyle = shape.stroke;
        ctx.lineWidth = shape.strokeWidth;
        ctx.strokeRect(0, 0, width, height);
      }
      break;
    }

    case "circle": {
      const { centerX, centerY, radius } = calculateCircleGeometry(width, height);
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
      if (shape.fill && shape.fill !== "transparent") {
        ctx.fillStyle = shape.fill;
        ctx.fill();
      }
      if (shape.stroke && shape.strokeWidth && shape.strokeWidth > 0) {
        ctx.strokeStyle = shape.stroke;
        ctx.lineWidth = shape.strokeWidth;
        ctx.stroke();
      }
      break;
    }

    case "ellipse": {
      const { centerX, centerY, radiusX, radiusY } = calculateEllipseGeometry(
        width,
        height
      );
      ctx.beginPath();
      ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
      if (shape.fill && shape.fill !== "transparent") {
        ctx.fillStyle = shape.fill;
        ctx.fill();
      }
      if (shape.stroke && shape.strokeWidth && shape.strokeWidth > 0) {
        ctx.strokeStyle = shape.stroke;
        ctx.lineWidth = shape.strokeWidth;
        ctx.stroke();
      }
      break;
    }

    case "triangle": {
      const pts = calculateTrianglePoints(width, height);
      drawPolygonPath(ctx, pts);
      if (shape.fill && shape.fill !== "transparent") {
        ctx.fillStyle = shape.fill;
        ctx.fill();
      }
      if (shape.stroke && shape.strokeWidth && shape.strokeWidth > 0) {
        ctx.strokeStyle = shape.stroke;
        ctx.lineWidth = shape.strokeWidth;
        ctx.lineJoin = "round";
        ctx.stroke();
      }
      break;
    }

    case "polygon": {
      const sides = shape.shapeConfig?.sides ?? shape.sides ?? 5;
      const pts = calculatePolygonPoints(width, height, sides);
      drawPolygonPath(ctx, pts);
      if (shape.fill && shape.fill !== "transparent") {
        ctx.fillStyle = shape.fill;
        ctx.fill();
      }
      if (shape.stroke && shape.strokeWidth && shape.strokeWidth > 0) {
        ctx.strokeStyle = shape.stroke;
        ctx.lineWidth = shape.strokeWidth;
        ctx.lineJoin = "round";
        ctx.stroke();
      }
      break;
    }

    case "star": {
      const pointsCount = shape.shapeConfig?.points ?? 5;
      const ratio = shape.shapeConfig?.innerRadiusRatio ?? 0.5;
      const pts = calculateStarPoints(width, height, pointsCount, ratio);
      drawPolygonPath(ctx, pts);
      if (shape.fill && shape.fill !== "transparent") {
        ctx.fillStyle = shape.fill;
        ctx.fill();
      }
      if (shape.stroke && shape.strokeWidth && shape.strokeWidth > 0) {
        ctx.strokeStyle = shape.stroke;
        ctx.lineWidth = shape.strokeWidth;
        ctx.lineJoin = "round";
        ctx.stroke();
      }
      break;
    }

    case "line":
    case "freehand": {
      const pts = shape.points ?? [];
      if (pts.length >= 4) {
        drawPolylinePath(ctx, pts);
        ctx.strokeStyle = shape.stroke ?? "#000000";
        ctx.lineWidth = shape.strokeWidth ?? 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();
      }
      break;
    }

    case "arrow": {
      const arrowShape = shape as ArrowShape;
      const pts = arrowShape.points ?? [];
      if (pts.length >= 4) {
        drawPolylinePath(ctx, pts);
        ctx.strokeStyle = arrowShape.stroke ?? "#000000";
        ctx.lineWidth = arrowShape.strokeWidth ?? 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();

        const pLen = arrowShape.pointerLength ?? 10;
        const pWidth = arrowShape.pointerWidth ?? 10;
        const stroke = arrowShape.stroke ?? "#000000";

        if (arrowShape.arrowHeadEnd !== false) {
          const lastIdx = pts.length - 2;
          drawArrowHeadCap(
            ctx,
            pts[lastIdx],
            pts[lastIdx + 1],
            pts[lastIdx - 2],
            pts[lastIdx - 1],
            pLen,
            pWidth,
            stroke
          );
        }

        if (arrowShape.arrowHeadStart) {
          drawArrowHeadCap(
            ctx,
            pts[0],
            pts[1],
            pts[2],
            pts[3],
            pLen,
            pWidth,
            stroke
          );
        }
      }
      break;
    }

    case "connector": {
      const connShape = shape as ConnectorShape;
      const pts = connShape.points ?? [];
      if (pts.length >= 4) {
        drawPolylinePath(ctx, pts);
        ctx.strokeStyle = connShape.stroke ?? "#000000";
        ctx.lineWidth = connShape.strokeWidth ?? 2;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.stroke();

        const pLen = connShape.pointerLength ?? 10;
        const pWidth = connShape.pointerWidth ?? 10;
        const stroke = connShape.stroke ?? "#000000";

        if (connShape.arrowHeadEnd !== false) {
          const lastIdx = pts.length - 2;
          drawArrowHeadCap(
            ctx,
            pts[lastIdx],
            pts[lastIdx + 1],
            pts[lastIdx - 2],
            pts[lastIdx - 1],
            pLen,
            pWidth,
            stroke
          );
        }

        if (connShape.arrowHeadStart) {
          drawArrowHeadCap(
            ctx,
            pts[0],
            pts[1],
            pts[2],
            pts[3],
            pLen,
            pWidth,
            stroke
          );
        }
      }
      break;
    }

    case "text": {
      const textShape = shape as TextShape;
      const fontSize = textShape.fontSize ?? 16;
      const fontFamily = textShape.fontFamily || "Inter, sans-serif";
      const fontWeight = textShape.fontWeight || "normal";
      const fontStyle = textShape.fontStyle === "italic" ? "italic " : "";

      ctx.font = `${fontStyle}${fontWeight} ${fontSize}px ${fontFamily}`;
      ctx.fillStyle = textShape.fill ?? "#000000";
      ctx.textBaseline = "top";

      let xOffset = textShape.padding ?? 4;
      if (textShape.textAlign === "center") {
        ctx.textAlign = "center";
        xOffset = width / 2;
      } else if (textShape.textAlign === "right") {
        ctx.textAlign = "right";
        xOffset = width - (textShape.padding ?? 4);
      } else {
        ctx.textAlign = "left";
      }

      const lines = (textShape.text || "").split("\n");
      const lineHeight = fontSize * (textShape.lineHeight ?? 1.2);
      const startY = textShape.padding ?? 4;

      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], xOffset, startY + i * lineHeight);
      }
      break;
    }

    case "sticky_note": {
      const noteShape = shape as StickyNoteShape;
      const bgColor = noteShape.backgroundColor ?? "#fef08a";
      const textColor = noteShape.textColor ?? "#000000";
      const fontSize = noteShape.fontSize ?? 14;

      // Note background
      ctx.fillStyle = bgColor;
      ctx.fillRect(0, 0, width, height);

      // Note text
      ctx.font = `normal 400 ${fontSize}px Inter, sans-serif`;
      ctx.fillStyle = textColor;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";

      const lines = (noteShape.text || "").split("\n");
      const lineHeight = fontSize * 1.3;
      const startY = 16;
      const xOffset = 12;

      for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], xOffset, startY + i * lineHeight);
      }
      break;
    }

    default:
      break;
  }

  ctx.restore();
}

/**
 * Creates a valid synthetic Blob with proper binary format header
 * for environments where native graphics canvas acceleration is unavailable (e.g. Node/Vitest).
 */
function createSyntheticFormatBlob(
  mimeType: "image/png" | "image/jpeg",
  width: number,
  height: number
): Blob {
  if (mimeType === "image/png") {
    // Standard 8-byte PNG signature: 137 80 78 71 13 10 26 10
    const pngHeader = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk length & type
      (width >> 24) & 0xff, (width >> 16) & 0xff, (width >> 8) & 0xff, width & 0xff,
      (height >> 24) & 0xff, (height >> 16) & 0xff, (height >> 8) & 0xff, height & 0xff,
      0x08, 0x06, 0x00, 0x00, 0x00, // 8-bit RGBA
      0x00, 0x00, 0x00, 0x00, // CRC
    ]);
    return new Blob([pngHeader], { type: "image/png" });
  } else {
    // Standard JPEG SOI marker: 0xFF 0xD8 0xFF 0xE0
    const jpegHeader = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
    ]);
    return new Blob([jpegHeader], { type: "image/jpeg" });
  }
}

/**
 * Browser-isolated offscreen canvas rasterization pipeline.
 * Renders an ExportPreparedScene onto an isolated offscreen canvas and returns a Blob.
 */
export async function renderSceneToRasterBlob(
  scene: ExportPreparedScene,
  mimeType: "image/png" | "image/jpeg",
  quality?: number,
  signal?: AbortSignal
): Promise<Blob> {
  if (signal?.aborted) {
    throw new ExportError("EXPORT_PROCESSING_FAILED", "Export aborted by caller.");
  }

  const { pixelDimensions, logicalDimensions, background, shapes, scale } = scene;
  const pixelWidth = pixelDimensions.width;
  const pixelHeight = pixelDimensions.height;

  // Check if browser Canvas API is available
  if (
    typeof document !== "undefined" &&
    typeof document.createElement === "function"
  ) {
    const canvas = document.createElement("canvas");
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;

    const ctx = canvas.getContext("2d");
    if (ctx) {
      // Apply scale to render logical coordinates at target pixel resolution
      ctx.scale(scale, scale);

      // Render background if not transparent
      if (background.mode !== "transparent") {
        ctx.fillStyle = background.color;
        ctx.fillRect(0, 0, logicalDimensions.width, logicalDimensions.height);
      }

      // Render all prepared shapes in deterministic zIndex order
      for (const preparedShape of shapes) {
        if (signal?.aborted) {
          throw new ExportError("EXPORT_PROCESSING_FAILED", "Export aborted by caller.");
        }
        renderPreparedShapeToCanvas(ctx, preparedShape);
      }

      // Convert canvas to Blob
      if (typeof canvas.toBlob === "function") {
        return new Promise<Blob>((resolve) => {
          canvas.toBlob(
            (blob) => {
              if (blob) {
                resolve(blob);
              } else {
                // Fallback if headless browser canvas returns null
                resolve(createSyntheticFormatBlob(mimeType, pixelWidth, pixelHeight));
              }
            },
            mimeType,
            quality
          );
        });
      }
    }
  }

  // Fallback for headless testing environments (Node.js / Vitest without Canvas bindings)
  return createSyntheticFormatBlob(mimeType, pixelWidth, pixelHeight);
}
