import { describe, it, expect } from "vitest";
import type { Shape, RectangleShape, CircleShape, GroupShape } from "@/features/canvas/types";
import { exportService, ExportService } from "../services/export.service";
import { ExportError } from "../utils/export-validation.utils";
import { MAX_EXPORT_PIXEL_DIMENSION } from "../constants/export.constants";

describe("ExportService (Slice 47)", () => {
  const rect1: RectangleShape = {
    id: "rect-service-1",
    type: "rectangle",
    x: 100,
    y: 100,
    width: 200,
    height: 150,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    fill: "#3b82f6",
    stroke: "#1d4ed8",
    strokeWidth: 2,
  };

  const circle1: CircleShape = {
    id: "circle-service-1",
    type: "circle",
    x: 350,
    y: 120,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 0.9,
    zIndex: 2,
    fill: "#10b981",
    stroke: "#047857",
    strokeWidth: 1,
  };

  const groupShape: GroupShape = {
    id: "group-1",
    type: "group",
    x: 100,
    y: 100,
    width: 350,
    height: 150,
    rotation: 0,
    opacity: 1,
    zIndex: 0,
  };

  const shapes: Shape[] = [groupShape, rect1, circle1];

  it("should successfully process exports for all 4 supported formats", async () => {
    const formats = ["png", "jpeg", "svg", "pdf"] as const;

    for (const format of formats) {
      const result = await exportService.exportShapes(shapes, {
        format,
        scope: "canvas",
      });

      expect(result.format).toBe(format);
      expect(result.blob).toBeInstanceOf(Blob);
      expect(result.blob.size).toBeGreaterThan(0);
      expect(result.width).toBeGreaterThan(0);
      expect(result.height).toBeGreaterThan(0);
      expect(result.pixelWidth).toBeGreaterThan(0);
      expect(result.pixelHeight).toBeGreaterThan(0);
      expect(result.filename).toContain(`.${format}`);
    }
  });

  it("should export only selected shapes and their descendants when scope is 'selection'", async () => {
    const result = await exportService.exportShapes(shapes, {
      format: "svg",
      scope: "selection",
      selectedShapeIds: [rect1.id],
      padding: 0,
    });

    expect(result.width).toBe(rect1.width);
    expect(result.height).toBe(rect1.height);

    const svgText = await result.blob.text();
    expect(svgText).toContain(rect1.fill);
    expect(svgText).not.toContain(circle1.fill);
  });

  it("should guarantee canvas export is viewport-independent (same document = same export regardless of pan/zoom)", async () => {
    // Viewport camera state A: zoomed in at 200%, panned to (500, -300)
    const exportA = await exportService.exportShapes(shapes, {
      format: "svg",
      scope: "canvas",
      padding: 20,
      viewport: {
        zoom: 2,
        pan: { x: 500, y: -300 },
        screenWidth: 1920,
        screenHeight: 1080,
      },
    });

    // Viewport camera state B: zoomed out at 50%, panned to (-1000, 2000)
    const exportB = await exportService.exportShapes(shapes, {
      format: "svg",
      scope: "canvas",
      padding: 20,
      viewport: {
        zoom: 0.5,
        pan: { x: -1000, y: 2000 },
        screenWidth: 1366,
        screenHeight: 768,
      },
    });

    // Both exports must have byte-for-byte identical dimensions and geometry
    expect(exportA.width).toBe(exportB.width);
    expect(exportA.height).toBe(exportB.height);
    expect(exportA.pixelWidth).toBe(exportB.pixelWidth);
    expect(exportA.pixelHeight).toBe(exportB.pixelHeight);

    const textA = await exportA.blob.text();
    const textB = await exportB.blob.text();
    expect(textA).toBe(textB);
  });

  it("should preserve strict immutability of input shapes (read-only invariant)", async () => {
    const originalShapesSnapshot = JSON.stringify(shapes);

    await exportService.exportShapes(shapes, {
      format: "png",
      scope: "canvas",
      scale: 2,
    });

    await exportService.exportShapes(shapes, {
      format: "svg",
      scope: "selection",
      selectedShapeIds: [rect1.id],
    });

    const currentShapesSnapshot = JSON.stringify(shapes);
    expect(currentShapesSnapshot).toBe(originalShapesSnapshot);
  });

  it("should reject exports exceeding MAX_EXPORT_PIXEL_DIMENSION with EXPORT_TOO_LARGE", async () => {
    // A shape of size 5000 scaled by 2 => 10,000px > 8192px
    const largeRect: RectangleShape = {
      id: "huge-rect",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 5000,
      height: 5000,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      fill: "#000",
      stroke: "#000",
      strokeWidth: 1,
    };

    await expect(
      exportService.exportShapes([largeRect], {
        format: "png",
        scope: "canvas",
        scale: 2, // 10000px > 8192px
      })
    ).rejects.toThrow(
      new ExportError(
        "EXPORT_TOO_LARGE",
        `Export dimensions (10080x10080) exceed maximum allowed dimension (${MAX_EXPORT_PIXEL_DIMENSION}px).`
      )
    );
  });

  it("should reject empty exports with EMPTY_CANVAS error", async () => {
    await expect(
      exportService.exportShapes([], {
        format: "png",
        scope: "canvas",
      })
    ).rejects.toThrow(
      new ExportError(
        "EMPTY_CANVAS",
        "No shapes available for export in the requested scope."
      )
    );
  });

  it("should throw UNSUPPORTED_FORMAT for unknown format", () => {
    const service = new ExportService();
    expect(() =>
      service.getProcessor("bmp" as never)
    ).toThrow(ExportError);
  });
});
