import type {
  TextShape,
  StickyNoteShape,
  ArrowShape,
  ConnectorShape,
  StrokeStyle,
} from "@/features/canvas/types";
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
 * Parses hex or standard CSS colors into normalized RGB float values [0.0 - 1.0].
 */
export function parseColorToRgb(
  color: string | undefined,
  defaultRgb: [number, number, number] = [0, 0, 0]
): [number, number, number] {
  if (!color || typeof color !== "string" || color === "transparent") {
    return defaultRgb;
  }

  const trimmed = color.trim().toLowerCase();

  // Hex color #RRGGBB or #RGB
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16) / 255;
      const g = parseInt(hex[1] + hex[1], 16) / 255;
      const b = parseInt(hex[2] + hex[2], 16) / 255;
      return [r, g, b];
    } else if (hex.length >= 6) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      return [r, g, b];
    }
  }

  // rgb(r, g, b)
  const rgbMatch = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(trimmed);
  if (rgbMatch) {
    const r = Math.min(255, parseInt(rgbMatch[1], 10)) / 255;
    const g = Math.min(255, parseInt(rgbMatch[2], 10)) / 255;
    const b = Math.min(255, parseInt(rgbMatch[3], 10)) / 255;
    return [r, g, b];
  }

  return defaultRgb;
}

/**
 * Escapes characters for PDF literal strings (parentheses and backslashes).
 */
export function escapePdfString(str: string): string {
  if (!str) return "";
  return str.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/**
 * Formats a float number compactly for PDF content streams.
 */
function f(n: number): string {
  return Number(n.toFixed(2)).toString();
}

/**
 * Builds cubic Bézier approximation curves for an ellipse/circle in PDF.
 */
function appendBezierCircle(
  cx: number,
  cy: number,
  rx: number,
  ry: number
): string {
  const k = 0.5522847498;
  const kx = rx * k;
  const ky = ry * k;

  let stream = "";
  // Start top
  stream += `${f(cx)} ${f(cy - ry)} m\n`;
  // Top to Right
  stream += `${f(cx + kx)} ${f(cy - ry)} ${f(cx + rx)} ${f(cy - ky)} ${f(cx + rx)} ${f(cy)} c\n`;
  // Right to Bottom
  stream += `${f(cx + rx)} ${f(cy + ky)} ${f(cx + kx)} ${f(cy + ry)} ${f(cx)} ${f(cy + ry)} c\n`;
  // Bottom to Left
  stream += `${f(cx - kx)} ${f(cy + ry)} ${f(cx - rx)} ${f(cy + ky)} ${f(cx - rx)} ${f(cy)} c\n`;
  // Left to Top
  stream += `${f(cx - rx)} ${f(cy - ky)} ${f(cx - kx)} ${f(cy - ry)} ${f(cx)} ${f(cy - ry)} c\n`;
  stream += `h\n`;
  return stream;
}

/**
 * Generates vector PDF operators for an individual prepared shape.
 */
function serializeShapeToPdf(prepared: ExportPreparedShape): string {
  const { shape, normalizedX, normalizedY, width, height, rotation } = prepared;

  if (shape.type === "group") {
    return "";
  }

  let stream = "q\n";

  // Translate and rotate
  if (rotation !== 0) {
    const rad = (rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    // [cos sin -sin cos tx ty]
    stream += `${f(cos)} ${f(sin)} ${f(-sin)} ${f(cos)} ${f(normalizedX)} ${f(normalizedY)} cm\n`;
  } else {
    stream += `1 0 0 1 ${f(normalizedX)} ${f(normalizedY)} cm\n`;
  }

  // Stroke Dash
  if ("strokeStyle" in shape && shape.strokeStyle) {
    const strokeStyle = shape.strokeStyle as StrokeStyle;
    if (strokeStyle === "dashed") {
      stream += "[10 6] 0 d\n";
    } else if (strokeStyle === "dotted") {
      stream += "[3 5] 0 d\n";
    } else {
      stream += "[] 0 d\n";
    }
  }

  switch (shape.type) {
    case "rectangle": {
      const hasFill = shape.fill && shape.fill !== "transparent";
      const hasStroke = shape.stroke && shape.strokeWidth && shape.strokeWidth > 0;

      if (hasFill) {
        const [r, g, b] = parseColorToRgb(shape.fill);
        stream += `${f(r)} ${f(g)} ${f(b)} rg\n`;
      }
      if (hasStroke) {
        const [r, g, b] = parseColorToRgb(shape.stroke);
        stream += `${f(r)} ${f(g)} ${f(b)} RG\n`;
        stream += `${f(shape.strokeWidth ?? 1)} w\n`;
        stream += "1 J 1 j\n";
      }

      stream += `0 0 ${f(width)} ${f(height)} re\n`;

      if (hasFill && hasStroke) {
        stream += "B\n";
      } else if (hasFill) {
        stream += "f\n";
      } else if (hasStroke) {
        stream += "S\n";
      }
      break;
    }

    case "circle": {
      const { centerX, centerY, radius } = calculateCircleGeometry(width, height);
      const hasFill = shape.fill && shape.fill !== "transparent";
      const hasStroke = shape.stroke && shape.strokeWidth && shape.strokeWidth > 0;

      if (hasFill) {
        const [r, g, b] = parseColorToRgb(shape.fill);
        stream += `${f(r)} ${f(g)} ${f(b)} rg\n`;
      }
      if (hasStroke) {
        const [r, g, b] = parseColorToRgb(shape.stroke);
        stream += `${f(r)} ${f(g)} ${f(b)} RG\n`;
        stream += `${f(shape.strokeWidth ?? 1)} w\n`;
        stream += "1 J 1 j\n";
      }

      stream += appendBezierCircle(centerX, centerY, radius, radius);

      if (hasFill && hasStroke) {
        stream += "B\n";
      } else if (hasFill) {
        stream += "f\n";
      } else if (hasStroke) {
        stream += "S\n";
      }
      break;
    }

    case "ellipse": {
      const { centerX, centerY, radiusX, radiusY } = calculateEllipseGeometry(
        width,
        height
      );
      const hasFill = shape.fill && shape.fill !== "transparent";
      const hasStroke = shape.stroke && shape.strokeWidth && shape.strokeWidth > 0;

      if (hasFill) {
        const [r, g, b] = parseColorToRgb(shape.fill);
        stream += `${f(r)} ${f(g)} ${f(b)} rg\n`;
      }
      if (hasStroke) {
        const [r, g, b] = parseColorToRgb(shape.stroke);
        stream += `${f(r)} ${f(g)} ${f(b)} RG\n`;
        stream += `${f(shape.strokeWidth ?? 1)} w\n`;
        stream += "1 J 1 j\n";
      }

      stream += appendBezierCircle(centerX, centerY, radiusX, radiusY);

      if (hasFill && hasStroke) {
        stream += "B\n";
      } else if (hasFill) {
        stream += "f\n";
      } else if (hasStroke) {
        stream += "S\n";
      }
      break;
    }

    case "triangle": {
      const pts = calculateTrianglePoints(width, height);
      const hasFill = shape.fill && shape.fill !== "transparent";
      const hasStroke = shape.stroke && shape.strokeWidth && shape.strokeWidth > 0;

      if (hasFill) {
        const [r, g, b] = parseColorToRgb(shape.fill);
        stream += `${f(r)} ${f(g)} ${f(b)} rg\n`;
      }
      if (hasStroke) {
        const [r, g, b] = parseColorToRgb(shape.stroke);
        stream += `${f(r)} ${f(g)} ${f(b)} RG\n`;
        stream += `${f(shape.strokeWidth ?? 1)} w\n`;
        stream += "1 J 1 j\n";
      }

      stream += `${f(pts[0])} ${f(pts[1])} m\n`;
      stream += `${f(pts[2])} ${f(pts[3])} l\n`;
      stream += `${f(pts[4])} ${f(pts[5])} l\n`;
      stream += "h\n";

      if (hasFill && hasStroke) {
        stream += "B\n";
      } else if (hasFill) {
        stream += "f\n";
      } else if (hasStroke) {
        stream += "S\n";
      }
      break;
    }

    case "polygon": {
      const sides = shape.shapeConfig?.sides ?? shape.sides ?? 5;
      const pts = calculatePolygonPoints(width, height, sides);
      const hasFill = shape.fill && shape.fill !== "transparent";
      const hasStroke = shape.stroke && shape.strokeWidth && shape.strokeWidth > 0;

      if (hasFill) {
        const [r, g, b] = parseColorToRgb(shape.fill);
        stream += `${f(r)} ${f(g)} ${f(b)} rg\n`;
      }
      if (hasStroke) {
        const [r, g, b] = parseColorToRgb(shape.stroke);
        stream += `${f(r)} ${f(g)} ${f(b)} RG\n`;
        stream += `${f(shape.strokeWidth ?? 1)} w\n`;
        stream += "1 J 1 j\n";
      }

      if (pts.length >= 4) {
        stream += `${f(pts[0])} ${f(pts[1])} m\n`;
        for (let i = 2; i < pts.length; i += 2) {
          stream += `${f(pts[i])} ${f(pts[i + 1])} l\n`;
        }
        stream += "h\n";

        if (hasFill && hasStroke) {
          stream += "B\n";
        } else if (hasFill) {
          stream += "f\n";
        } else if (hasStroke) {
          stream += "S\n";
        }
      }
      break;
    }

    case "star": {
      const pointsCount = shape.shapeConfig?.points ?? 5;
      const ratio = shape.shapeConfig?.innerRadiusRatio ?? 0.5;
      const pts = calculateStarPoints(width, height, pointsCount, ratio);
      const hasFill = shape.fill && shape.fill !== "transparent";
      const hasStroke = shape.stroke && shape.strokeWidth && shape.strokeWidth > 0;

      if (hasFill) {
        const [r, g, b] = parseColorToRgb(shape.fill);
        stream += `${f(r)} ${f(g)} ${f(b)} rg\n`;
      }
      if (hasStroke) {
        const [r, g, b] = parseColorToRgb(shape.stroke);
        stream += `${f(r)} ${f(g)} ${f(b)} RG\n`;
        stream += `${f(shape.strokeWidth ?? 1)} w\n`;
        stream += "1 J 1 j\n";
      }

      if (pts.length >= 4) {
        stream += `${f(pts[0])} ${f(pts[1])} m\n`;
        for (let i = 2; i < pts.length; i += 2) {
          stream += `${f(pts[i])} ${f(pts[i + 1])} l\n`;
        }
        stream += "h\n";

        if (hasFill && hasStroke) {
          stream += "B\n";
        } else if (hasFill) {
          stream += "f\n";
        } else if (hasStroke) {
          stream += "S\n";
        }
      }
      break;
    }

    case "line":
    case "freehand": {
      const pts = shape.points ?? [];
      if (pts.length >= 4) {
        const [r, g, b] = parseColorToRgb(shape.stroke ?? "#000000");
        stream += `${f(r)} ${f(g)} ${f(b)} RG\n`;
        stream += `${f(shape.strokeWidth ?? 2)} w\n`;
        stream += "1 J 1 j\n";

        stream += `${f(pts[0])} ${f(pts[1])} m\n`;
        for (let i = 2; i < pts.length; i += 2) {
          stream += `${f(pts[i])} ${f(pts[i + 1])} l\n`;
        }
        stream += "S\n";
      }
      break;
    }

    case "arrow": {
      const arrowShape = shape as ArrowShape;
      const pts = arrowShape.points ?? [];
      if (pts.length >= 4) {
        const [r, g, b] = parseColorToRgb(arrowShape.stroke ?? "#000000");
        stream += `${f(r)} ${f(g)} ${f(b)} RG\n`;
        stream += `${f(r)} ${f(g)} ${f(b)} rg\n`;
        stream += `${f(arrowShape.strokeWidth ?? 2)} w\n`;
        stream += "1 J 1 j\n";

        // Line
        stream += `${f(pts[0])} ${f(pts[1])} m\n`;
        for (let i = 2; i < pts.length; i += 2) {
          stream += `${f(pts[i])} ${f(pts[i + 1])} l\n`;
        }
        stream += "S\n";

        // Arrow head end
        if (arrowShape.arrowHeadEnd !== false) {
          const lastIdx = pts.length - 2;
          const tipX = pts[lastIdx];
          const tipY = pts[lastIdx + 1];
          const fromX = pts[lastIdx - 2];
          const fromY = pts[lastIdx - 1];

          const angle = Math.atan2(tipY - fromY, tipX - fromX);
          const pLen = arrowShape.pointerLength ?? 10;
          const pHalf = (arrowShape.pointerWidth ?? 10) / 2;

          const baseX = tipX - pLen * Math.cos(angle);
          const baseY = tipY - pLen * Math.sin(angle);
          const lx = baseX + pHalf * Math.sin(angle);
          const ly = baseY - pHalf * Math.cos(angle);
          const rx = baseX - pHalf * Math.sin(angle);
          const ry = baseY + pHalf * Math.cos(angle);

          stream += `${f(tipX)} ${f(tipY)} m ${f(lx)} ${f(ly)} l ${f(rx)} ${f(ry)} l h f\n`;
        }
      }
      break;
    }

    case "connector": {
      const connShape = shape as ConnectorShape;
      const pts = connShape.points ?? [];
      if (pts.length >= 4) {
        const [r, g, b] = parseColorToRgb(connShape.stroke ?? "#000000");
        stream += `${f(r)} ${f(g)} ${f(b)} RG\n`;
        stream += `${f(r)} ${f(g)} ${f(b)} rg\n`;
        stream += `${f(connShape.strokeWidth ?? 2)} w\n`;
        stream += "1 J 1 j\n";

        // Line
        stream += `${f(pts[0])} ${f(pts[1])} m\n`;
        for (let i = 2; i < pts.length; i += 2) {
          stream += `${f(pts[i])} ${f(pts[i + 1])} l\n`;
        }
        stream += "S\n";

        // Arrow head end
        if (connShape.arrowHeadEnd !== false) {
          const lastIdx = pts.length - 2;
          const tipX = pts[lastIdx];
          const tipY = pts[lastIdx + 1];
          const fromX = pts[lastIdx - 2];
          const fromY = pts[lastIdx - 1];

          const angle = Math.atan2(tipY - fromY, tipX - fromX);
          const pLen = connShape.pointerLength ?? 10;
          const pHalf = (connShape.pointerWidth ?? 10) / 2;

          const baseX = tipX - pLen * Math.cos(angle);
          const baseY = tipY - pLen * Math.sin(angle);
          const lx = baseX + pHalf * Math.sin(angle);
          const ly = baseY - pHalf * Math.cos(angle);
          const rx = baseX - pHalf * Math.sin(angle);
          const ry = baseY + pHalf * Math.cos(angle);

          stream += `${f(tipX)} ${f(tipY)} m ${f(lx)} ${f(ly)} l ${f(rx)} ${f(ry)} l h f\n`;
        }
      }
      break;
    }

    case "text": {
      const textShape = shape as TextShape;
      const [r, g, b] = parseColorToRgb(textShape.fill ?? "#000000");
      const fontSize = textShape.fontSize ?? 16;
      const lines = (textShape.text || "").split("\n");
      const lineHeight = fontSize * (textShape.lineHeight ?? 1.2);
      const startX = textShape.padding ?? 4;
      const startY = (textShape.padding ?? 4) + fontSize;

      stream += "BT\n";
      stream += `/F1 ${f(fontSize)} Tf\n`;
      stream += `${f(r)} ${f(g)} ${f(b)} rg\n`;

      for (let i = 0; i < lines.length; i++) {
        const lineY = startY + i * lineHeight;
        // In the inverted coordinate system, text matrix applies standard font orientation
        stream += `1 0 0 -1 ${f(startX)} ${f(lineY)} Tm\n`;
        stream += `(${escapePdfString(lines[i])}) Tj\n`;
      }

      stream += "ET\n";
      break;
    }

    case "sticky_note": {
      const noteShape = shape as StickyNoteShape;
      const [bgR, bgG, bgB] = parseColorToRgb(
        noteShape.backgroundColor ?? "#fef08a",
        [0.99, 0.94, 0.54]
      );
      const [textR, textG, textB] = parseColorToRgb(
        noteShape.textColor ?? "#000000",
        [0, 0, 0]
      );
      const fontSize = noteShape.fontSize ?? 14;

      // Note background card
      stream += `${f(bgR)} ${f(bgG)} ${f(bgB)} rg\n`;
      stream += `0 0 ${f(width)} ${f(height)} re f\n`;

      // Note text
      const lines = (noteShape.text || "").split("\n");
      const lineHeight = fontSize * 1.3;
      const startX = 12;
      const startY = 16 + fontSize;

      stream += "BT\n";
      stream += `/F1 ${f(fontSize)} Tf\n`;
      stream += `${f(textR)} ${f(textG)} ${f(textB)} rg\n`;

      for (let i = 0; i < lines.length; i++) {
        const lineY = startY + i * lineHeight;
        stream += `1 0 0 -1 ${f(startX)} ${f(lineY)} Tm\n`;
        stream += `(${escapePdfString(lines[i])}) Tj\n`;
      }

      stream += "ET\n";
      break;
    }

    default:
      break;
  }

  stream += "Q\n";
  return stream;
}

/**
 * Builds a valid, vector PDF 1.4 document stream containing all shapes and metadata.
 */
export function buildPdfDocument(scene: ExportPreparedScene): ArrayBuffer {
  const { logicalDimensions, pixelDimensions, background, shapes, scale } = scene;
  const pixelWidth = pixelDimensions.width;
  const pixelHeight = pixelDimensions.height;
  const logicalWidth = logicalDimensions.width;
  const logicalHeight = logicalDimensions.height;

  // Build page content stream
  let contentStream = "q\n";

  // Invert Y axis and apply scale so coordinates match top-left canvas origin
  contentStream += `${f(scale)} 0 0 -${f(scale)} 0 ${f(pixelHeight)} cm\n`;

  // Draw background if not transparent
  if (background.mode !== "transparent") {
    const [r, g, b] = parseColorToRgb(background.color, [1, 1, 1]);
    contentStream += `${f(r)} ${f(g)} ${f(b)} rg\n`;
    contentStream += `0 0 ${f(logicalWidth)} ${f(logicalHeight)} re f\n`;
  }

  // Draw shapes
  for (const preparedShape of shapes) {
    contentStream += serializeShapeToPdf(preparedShape);
  }

  contentStream += "Q\n";

  const encoder = new TextEncoder();
  const contentBytes = encoder.encode(contentStream);

  // Construct PDF objects
  const header = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";

  const obj1 = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";
  const obj2 = "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n";
  const obj3 = `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(pixelWidth)} ${f(pixelHeight)}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> /ProcSet [/PDF /Text] >> >>\nendobj\n`;
  const obj4Header = `4 0 obj\n<< /Length ${contentBytes.length} >>\nstream\n`;
  const obj4Footer = "\nendstream\nendobj\n";
  const obj5 =
    "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n";

  // Calculate byte offsets for XRef table
  const offsets: number[] = [];
  let currentOffset = encoder.encode(header).length;

  offsets.push(currentOffset);
  currentOffset += encoder.encode(obj1).length;

  offsets.push(currentOffset);
  currentOffset += encoder.encode(obj2).length;

  offsets.push(currentOffset);
  currentOffset += encoder.encode(obj3).length;

  offsets.push(currentOffset);
  currentOffset +=
    encoder.encode(obj4Header).length +
    contentBytes.length +
    encoder.encode(obj4Footer).length;

  offsets.push(currentOffset);
  currentOffset += encoder.encode(obj5).length;

  const startXref = currentOffset;

  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (const off of offsets) {
    xref += `${off.toString().padStart(10, "0")} 00000 n \n`;
  }

  const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${startXref}\n%%EOF\n`;

  // Assemble full PDF byte buffer
  const parts: Uint8Array[] = [
    encoder.encode(header),
    encoder.encode(obj1),
    encoder.encode(obj2),
    encoder.encode(obj3),
    encoder.encode(obj4Header),
    contentBytes,
    encoder.encode(obj4Footer),
    encoder.encode(obj5),
    encoder.encode(xref),
    encoder.encode(trailer),
  ];

  const totalLength = parts.reduce((acc, p) => acc + p.length, 0);
  const buffer = new ArrayBuffer(totalLength);
  const result = new Uint8Array(buffer);
  let pos = 0;
  for (const part of parts) {
    result.set(part, pos);
    pos += part.length;
  }

  return buffer;
}

/**
 * Pure PDF exporter implementing the ExportProcessor interface.
 * Generates valid vector PDF 1.4 documents without requiring heavyweight external dependencies.
 */
export class PdfExporter implements ExportProcessor {
  public readonly format = "pdf" as const;
  public readonly mimeType = "application/pdf" as const;

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

    const { logicalDimensions, pixelDimensions } = scene;
    const width = logicalDimensions.width;
    const height = logicalDimensions.height;
    const pixelWidth = pixelDimensions.width;
    const pixelHeight = pixelDimensions.height;

    const pdfBytes = buildPdfDocument(scene);
    const blob = new Blob([pdfBytes], { type: this.mimeType });

    const filename =
      options?.customFilename ??
      `canvasflow-export-${scene.metadata.timestamp || Date.now()}.pdf`;

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

export const pdfExporter = new PdfExporter();
