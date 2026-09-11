import { describe, it, expect } from "vitest";
import type { RectangleShape, CircleShape, TextShape } from "@/features/canvas/types";
import { prepareExportScene } from "../utils/export-geometry.utils";
import {
  pdfExporter,
  escapePdfString,
  parseColorToRgb,
} from "../processors/pdf.exporter";
import { ExportError } from "../utils/export-validation.utils";

describe("PdfExporter (Slice 47)", () => {
  const rect: RectangleShape = {
    id: "rect-pdf-1",
    type: "rectangle",
    x: 0,
    y: 0,
    width: 200,
    height: 100,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    fill: "#3b82f6",
    stroke: "#1e3a8a",
    strokeWidth: 2,
  };

  const circle: CircleShape = {
    id: "circle-pdf-1",
    type: "circle",
    x: 250,
    y: 50,
    width: 80,
    height: 80,
    rotation: 0,
    opacity: 1,
    zIndex: 2,
    fill: "#ef4444",
    stroke: "#991b1b",
    strokeWidth: 1,
  };

  const text: TextShape = {
    id: "text-pdf-1",
    type: "text",
    x: 50,
    y: 150,
    width: 200,
    height: 40,
    rotation: 0,
    opacity: 1,
    zIndex: 3,
    text: "Hello PDF (CanvasFlow)",
    fontSize: 16,
    fontFamily: "Helvetica",
    fontWeight: "normal",
    fontStyle: "normal",
    textDecoration: "none",
    textAlign: "left",
    verticalAlign: "top",
    fill: "#000000",
    padding: 0,
    lineHeight: 1.2,
  };

  it("should escape special PDF string characters (parentheses and backslashes)", () => {
    const raw = "Special (nested) \\ path / test";
    const escaped = escapePdfString(raw);
    expect(escaped).toBe("Special \\(nested\\) \\\\ path / test");
  });

  it("should parse hex and rgb colors into normalized [0, 1] RGB floats", () => {
    const white = parseColorToRgb("#ffffff");
    expect(white[0]).toBeCloseTo(1);
    expect(white[1]).toBeCloseTo(1);
    expect(white[2]).toBeCloseTo(1);

    const black = parseColorToRgb("#000000");
    expect(black[0]).toBe(0);
    expect(black[1]).toBe(0);
    expect(black[2]).toBe(0);

    const rgb = parseColorToRgb("rgb(255, 128, 0)");
    expect(rgb[0]).toBeCloseTo(1);
    expect(rgb[1]).toBeCloseTo(128 / 255);
    expect(rgb[2]).toBe(0);
  });

  it("should generate a valid PDF 1.4 document Blob with correct MIME type and structure", async () => {
    const scene = prepareExportScene([rect, circle, text], {
      format: "pdf",
      scope: "canvas",
      padding: 10,
    });

    const result = await pdfExporter.process(scene);

    expect(result.format).toBe("pdf");
    expect(result.mimeType).toBe("application/pdf");
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.type).toBe("application/pdf");
    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.filename).toContain(".pdf");

    const textContent = await result.blob.text();
    // Validate standard PDF structure
    expect(textContent).toContain("%PDF-1.4");
    expect(textContent).toContain("/Type /Catalog");
    expect(textContent).toContain("/Type /Pages");
    expect(textContent).toContain("/Type /Page");
    expect(textContent).toContain("/MediaBox [0 0");
    expect(textContent).toContain("xref");
    expect(textContent).toContain("trailer");
    expect(textContent).toContain("%%EOF");
    // Verify text content was embedded safely
    expect(textContent).toContain("(Hello PDF \\(CanvasFlow\\))");
  });

  it("should respect scaling factors in PDF MediaBox", async () => {
    const scene = prepareExportScene([rect], {
      format: "pdf",
      scope: "canvas",
      scale: 2,
      padding: 0,
    });

    const result = await pdfExporter.process(scene);
    expect(result.pixelWidth).toBe(scene.logicalDimensions.width * 2);
    expect(result.pixelHeight).toBe(scene.logicalDimensions.height * 2);

    const textContent = await result.blob.text();
    expect(textContent).toContain(
      `/MediaBox [0 0 ${result.pixelWidth} ${result.pixelHeight}]`
    );
  });

  it("should abort processing when signal is aborted", async () => {
    const scene = prepareExportScene([rect], {
      format: "pdf",
      scope: "canvas",
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      pdfExporter.process(scene, { signal: controller.signal })
    ).rejects.toThrow(ExportError);
  });
});
