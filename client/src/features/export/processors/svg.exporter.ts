import type { Shape, TextShape, StickyNoteShape, ArrowShape, ConnectorShape } from "@/features/canvas/types";
import { STROKE_DASH_PATTERNS } from "@/features/canvas/utils/shape-style.utils";
import {
  calculateCircleGeometry,
  calculateEllipseGeometry,
  calculateTrianglePoints,
  calculatePolygonPoints,
  calculateStarPoints,
} from "@/features/canvas/utils/shape-geometry.utils";
import type { ExportPreparedScene, ExportPreparedShape } from "../types/export.types";
import type {
  ExportProcessor,
  ExportProcessorOptions,
  ExportResult,
} from "../types/export-processor.types";
import { ExportError } from "../utils/export-validation.utils";

/**
 * Strictly escapes characters in XML text content to prevent markup injection.
 */
export function escapeXmlText(value: string): string {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Strictly escapes characters in XML attribute values to prevent attribute breakout.
 */
export function escapeXmlAttr(value: string | number): string {
  if (value === undefined || value === null) return "";
  const str = String(value);
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Sanitizes CSS color strings to ensure only valid color values are emitted.
 */
export function sanitizeColor(color: string | undefined, defaultColor = "transparent"): string {
  if (!color || typeof color !== "string") return defaultColor;
  const trimmed = color.trim();
  // Safe hex, rgb, rgba, hsl, hsla, or standard alphanumeric color names
  if (/^(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\)|hsla?\([^)]+\)|[a-zA-Z]+)$/.test(trimmed)) {
    return trimmed;
  }
  return defaultColor;
}

/**
 * Converts stroke style into SVG stroke-dasharray attribute value.
 */
function getSvgDashArray(shape: Shape): string {
  if ("strokeStyle" in shape && shape.strokeStyle) {
    const dashPattern = STROKE_DASH_PATTERNS[shape.strokeStyle];
    if (dashPattern && dashPattern.length > 0) {
      return dashPattern.join(",");
    }
  }
  return "";
}

/**
 * Generates arrowhead polygon points at a line end or start point.
 */
function calculateArrowHeadPoints(
  tipX: number,
  tipY: number,
  fromX: number,
  fromY: number,
  pointerLength = 10,
  pointerWidth = 10
): string {
  const angle = Math.atan2(tipY - fromY, tipX - fromX);
  const halfWidth = pointerWidth / 2;

  const baseX = tipX - pointerLength * Math.cos(angle);
  const baseY = tipY - pointerLength * Math.sin(angle);

  const leftX = baseX + halfWidth * Math.sin(angle);
  const leftY = baseY - halfWidth * Math.cos(angle);

  const rightX = baseX - halfWidth * Math.sin(angle);
  const rightY = baseY + halfWidth * Math.cos(angle);

  return `${tipX.toFixed(2)},${tipY.toFixed(2)} ${leftX.toFixed(2)},${leftY.toFixed(2)} ${rightX.toFixed(2)},${rightY.toFixed(2)}`;
}

/**
 * Serializes an individual prepared shape into SVG markup.
 */
function serializeShapeToSvg(prepared: ExportPreparedShape): string {
  const { shape, normalizedX, normalizedY, width, height, rotation } = prepared;

  if (shape.type === "group") {
    return "";
  }

  const opacity = typeof shape.opacity === "number" ? Math.max(0, Math.min(1, shape.opacity)) : 1;
  const opacityAttr = opacity < 1 ? ` opacity="${opacity}"` : "";
  const dashArray = getSvgDashArray(shape);
  const dashAttr = dashArray ? ` stroke-dasharray="${escapeXmlAttr(dashArray)}"` : "";

  // Base group transform
  const hasTransform = normalizedX !== 0 || normalizedY !== 0 || rotation !== 0;
  const transformAttr = hasTransform
    ? ` transform="translate(${normalizedX.toFixed(2)}, ${normalizedY.toFixed(2)})${
        rotation !== 0 ? ` rotate(${rotation.toFixed(2)})` : ""
      }"`
    : "";

  let innerSvg = "";

  switch (shape.type) {
    case "rectangle": {
      const fill = sanitizeColor(shape.fill, "transparent");
      const stroke = sanitizeColor(shape.stroke, "none");
      const strokeWidth = shape.strokeWidth ?? 1;
      innerSvg = `<rect width="${width}" height="${height}" fill="${escapeXmlAttr(fill)}" stroke="${escapeXmlAttr(stroke)}" stroke-width="${strokeWidth}"${dashAttr}${opacityAttr} />`;
      break;
    }

    case "circle": {
      const fill = sanitizeColor(shape.fill, "transparent");
      const stroke = sanitizeColor(shape.stroke, "none");
      const strokeWidth = shape.strokeWidth ?? 1;
      const { centerX, centerY, radius } = calculateCircleGeometry(width, height);
      innerSvg = `<circle cx="${centerX.toFixed(2)}" cy="${centerY.toFixed(2)}" r="${radius.toFixed(2)}" fill="${escapeXmlAttr(fill)}" stroke="${escapeXmlAttr(stroke)}" stroke-width="${strokeWidth}"${dashAttr}${opacityAttr} />`;
      break;
    }

    case "ellipse": {
      const fill = sanitizeColor(shape.fill, "transparent");
      const stroke = sanitizeColor(shape.stroke, "none");
      const strokeWidth = shape.strokeWidth ?? 1;
      const { centerX, centerY, radiusX, radiusY } = calculateEllipseGeometry(width, height);
      innerSvg = `<ellipse cx="${centerX.toFixed(2)}" cy="${centerY.toFixed(2)}" rx="${radiusX.toFixed(2)}" ry="${radiusY.toFixed(2)}" fill="${escapeXmlAttr(fill)}" stroke="${escapeXmlAttr(stroke)}" stroke-width="${strokeWidth}"${dashAttr}${opacityAttr} />`;
      break;
    }

    case "triangle": {
      const fill = sanitizeColor(shape.fill, "transparent");
      const stroke = sanitizeColor(shape.stroke, "none");
      const strokeWidth = shape.strokeWidth ?? 1;
      const points = calculateTrianglePoints(width, height);
      const pointsStr = points.map((p) => p.toFixed(2)).join(" ");
      innerSvg = `<polygon points="${escapeXmlAttr(pointsStr)}" fill="${escapeXmlAttr(fill)}" stroke="${escapeXmlAttr(stroke)}" stroke-width="${strokeWidth}" stroke-linejoin="round"${dashAttr}${opacityAttr} />`;
      break;
    }

    case "polygon": {
      const fill = sanitizeColor(shape.fill, "transparent");
      const stroke = sanitizeColor(shape.stroke, "none");
      const strokeWidth = shape.strokeWidth ?? 1;
      const sides = shape.shapeConfig?.sides ?? shape.sides ?? 5;
      const points = calculatePolygonPoints(width, height, sides);
      const pointsStr = points.map((p) => p.toFixed(2)).join(" ");
      innerSvg = `<polygon points="${escapeXmlAttr(pointsStr)}" fill="${escapeXmlAttr(fill)}" stroke="${escapeXmlAttr(stroke)}" stroke-width="${strokeWidth}" stroke-linejoin="round"${dashAttr}${opacityAttr} />`;
      break;
    }

    case "star": {
      const fill = sanitizeColor(shape.fill, "transparent");
      const stroke = sanitizeColor(shape.stroke, "none");
      const strokeWidth = shape.strokeWidth ?? 1;
      const pointsCount = shape.shapeConfig?.points ?? 5;
      const ratio = shape.shapeConfig?.innerRadiusRatio ?? 0.5;
      const points = calculateStarPoints(width, height, pointsCount, ratio);
      const pointsStr = points.map((p) => p.toFixed(2)).join(" ");
      innerSvg = `<polygon points="${escapeXmlAttr(pointsStr)}" fill="${escapeXmlAttr(fill)}" stroke="${escapeXmlAttr(stroke)}" stroke-width="${strokeWidth}" stroke-linejoin="round"${dashAttr}${opacityAttr} />`;
      break;
    }

    case "line":
    case "freehand": {
      const stroke = sanitizeColor(shape.stroke, "#000000");
      const strokeWidth = shape.strokeWidth ?? 2;
      const rawPoints = shape.points ?? [];
      if (rawPoints.length < 4) return "";
      const pointsStr = rawPoints.map((p) => p.toFixed(2)).join(" ");
      innerSvg = `<polyline points="${escapeXmlAttr(pointsStr)}" fill="none" stroke="${escapeXmlAttr(stroke)}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}${opacityAttr} />`;
      break;
    }

    case "arrow": {
      const arrowShape = shape as ArrowShape;
      const stroke = sanitizeColor(arrowShape.stroke, "#000000");
      const strokeWidth = arrowShape.strokeWidth ?? 2;
      const pts = arrowShape.points ?? [];
      if (pts.length < 4) return "";

      const pointsStr = pts.map((p) => p.toFixed(2)).join(" ");
      let arrowSvg = `<polyline points="${escapeXmlAttr(pointsStr)}" fill="none" stroke="${escapeXmlAttr(stroke)}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}${opacityAttr} />`;

      const pLen = arrowShape.pointerLength ?? 10;
      const pWidth = arrowShape.pointerWidth ?? 10;

      if (arrowShape.arrowHeadEnd !== false) {
        const lastIdx = pts.length - 2;
        const endHead = calculateArrowHeadPoints(
          pts[lastIdx],
          pts[lastIdx + 1],
          pts[lastIdx - 2],
          pts[lastIdx - 1],
          pLen,
          pWidth
        );
        arrowSvg += `\n<polygon points="${escapeXmlAttr(endHead)}" fill="${escapeXmlAttr(stroke)}"${opacityAttr} />`;
      }

      if (arrowShape.arrowHeadStart) {
        const startHead = calculateArrowHeadPoints(
          pts[0],
          pts[1],
          pts[2],
          pts[3],
          pLen,
          pWidth
        );
        arrowSvg += `\n<polygon points="${escapeXmlAttr(startHead)}" fill="${escapeXmlAttr(stroke)}"${opacityAttr} />`;
      }

      innerSvg = arrowSvg;
      break;
    }

    case "connector": {
      const connShape = shape as ConnectorShape;
      const stroke = sanitizeColor(connShape.stroke, "#000000");
      const strokeWidth = connShape.strokeWidth ?? 2;
      const pts = connShape.points ?? [];
      if (pts.length < 4) return "";

      const pointsStr = pts.map((p) => p.toFixed(2)).join(" ");
      let connSvg = `<polyline points="${escapeXmlAttr(pointsStr)}" fill="none" stroke="${escapeXmlAttr(stroke)}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round"${dashAttr}${opacityAttr} />`;

      const pLen = connShape.pointerLength ?? 10;
      const pWidth = connShape.pointerWidth ?? 10;

      if (connShape.arrowHeadEnd !== false) {
        const lastIdx = pts.length - 2;
        const endHead = calculateArrowHeadPoints(
          pts[lastIdx],
          pts[lastIdx + 1],
          pts[lastIdx - 2],
          pts[lastIdx - 1],
          pLen,
          pWidth
        );
        connSvg += `\n<polygon points="${escapeXmlAttr(endHead)}" fill="${escapeXmlAttr(stroke)}"${opacityAttr} />`;
      }

      if (connShape.arrowHeadStart) {
        const startHead = calculateArrowHeadPoints(
          pts[0],
          pts[1],
          pts[2],
          pts[3],
          pLen,
          pWidth
        );
        connSvg += `\n<polygon points="${escapeXmlAttr(startHead)}" fill="${escapeXmlAttr(stroke)}"${opacityAttr} />`;
      }

      innerSvg = connSvg;
      break;
    }

    case "text": {
      const textShape = shape as TextShape;
      const fill = sanitizeColor(textShape.fill, "#000000");
      const fontSize = textShape.fontSize ?? 16;
      const fontFamily = escapeXmlAttr(textShape.fontFamily || "Inter, sans-serif");
      const fontWeight = escapeXmlAttr(String(textShape.fontWeight || "normal"));
      const fontStyle = textShape.fontStyle === "italic" ? ' font-style="italic"' : "";
      const textDecoration =
        textShape.textDecoration === "underline" ? ' text-decoration="underline"' : "";

      let textAnchor = ' text-anchor="start"';
      let xOffset = textShape.padding ?? 4;
      if (textShape.textAlign === "center") {
        textAnchor = ' text-anchor="middle"';
        xOffset = width / 2;
      } else if (textShape.textAlign === "right") {
        textAnchor = ' text-anchor="end"';
        xOffset = width - (textShape.padding ?? 4);
      }

      const lines = (textShape.text || "").split("\n");
      const lineHeight = fontSize * (textShape.lineHeight ?? 1.2);
      const startY = (textShape.padding ?? 4) + fontSize;

      const tspans = lines
        .map((line, idx) => {
          const y = startY + idx * lineHeight;
          return `<tspan x="${xOffset}" y="${y.toFixed(2)}">${escapeXmlText(line)}</tspan>`;
        })
        .join("");

      innerSvg = `<text font-family="${fontFamily}" font-size="${fontSize}" font-weight="${fontWeight}"${fontStyle}${textDecoration}${textAnchor} fill="${escapeXmlAttr(fill)}"${opacityAttr}>${tspans}</text>`;
      break;
    }

    case "sticky_note": {
      const noteShape = shape as StickyNoteShape;
      const bgColor = sanitizeColor(noteShape.backgroundColor, "#fef08a");
      const textColor = sanitizeColor(noteShape.textColor, "#000000");
      const fontSize = noteShape.fontSize ?? 14;

      const rectSvg = `<rect width="${width}" height="${height}" rx="6" ry="6" fill="${escapeXmlAttr(bgColor)}" stroke="rgba(0,0,0,0.1)" stroke-width="1"${opacityAttr} />`;

      const lines = (noteShape.text || "").split("\n");
      const lineHeight = fontSize * 1.3;
      const startY = 16 + fontSize;
      const xOffset = 12;

      const tspans = lines
        .map((line, idx) => {
          const y = startY + idx * lineHeight;
          return `<tspan x="${xOffset}" y="${y.toFixed(2)}">${escapeXmlText(line)}</tspan>`;
        })
        .join("");

      const textSvg = `<text font-family="Inter, sans-serif" font-size="${fontSize}" fill="${escapeXmlAttr(textColor)}"${opacityAttr}>${tspans}</text>`;
      innerSvg = `${rectSvg}\n${textSvg}`;
      break;
    }

    default:
      return "";
  }

  if (hasTransform) {
    return `<g${transformAttr}>\n${innerSvg}\n</g>`;
  }

  return innerSvg;
}

/**
 * Pure SVG exporter implementing the ExportProcessor interface.
 * Generates valid, secure, standalone SVG documents serialized into a Blob.
 */
export class SvgExporter implements ExportProcessor {
  public readonly format = "svg" as const;
  public readonly mimeType = "image/svg+xml" as const;

  public async process(
    scene: ExportPreparedScene,
    options?: ExportProcessorOptions
  ): Promise<ExportResult> {
    if (options?.signal?.aborted) {
      throw new ExportError("EXPORT_PROCESSING_FAILED", "Export aborted by caller.");
    }

    if (!scene.shapes || scene.shapes.length === 0) {
      throw new ExportError(
        "EMPTY_CANVAS",
        "No shapes available for export in the requested scene."
      );
    }

    const { logicalDimensions, pixelDimensions, background, shapes } = scene;
    const width = logicalDimensions.width;
    const height = logicalDimensions.height;
    const pixelWidth = pixelDimensions.width;
    const pixelHeight = pixelDimensions.height;

    const svgParts: string[] = [];

    // Root element with scaling and viewBox
    svgParts.push(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${width} ${height}">`
    );

    // Metadata comment
    svgParts.push(
      `<!-- Generated by CanvasFlow Export Engine (Slice 47) - Shapes: ${shapes.length} -->`
    );

    // Background handling
    if (background.mode === "solid" || background.mode === "canvas") {
      const bgColor = sanitizeColor(background.color, "#ffffff");
      svgParts.push(
        `<rect width="${width}" height="${height}" fill="${escapeXmlAttr(bgColor)}" />`
      );
    }

    // Render shapes in established deterministic order
    for (const preparedShape of shapes) {
      if (options?.signal?.aborted) {
        throw new ExportError("EXPORT_PROCESSING_FAILED", "Export aborted by caller.");
      }
      const shapeSvg = serializeShapeToSvg(preparedShape);
      if (shapeSvg) {
        svgParts.push(shapeSvg);
      }
    }

    svgParts.push("</svg>");

    const svgString = svgParts.join("\n");
    const blob = new Blob([svgString], { type: this.mimeType });

    const filename =
      options?.customFilename ??
      `canvasflow-export-${scene.metadata.timestamp || Date.now()}.svg`;

    return {
      blob,
      mimeType: this.mimeType,
      format: this.format,
      width,
      height,
      pixelWidth,
      pixelHeight,
      filename,
    };
  }
}

export const svgExporter = new SvgExporter();
