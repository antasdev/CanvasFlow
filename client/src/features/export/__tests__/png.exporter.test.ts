import { describe, it, expect } from "vitest";
import type { RectangleShape } from "@/features/canvas/types";
import { prepareExportScene } from "../utils/export-geometry.utils";
import { pngExporter } from "../processors/png.exporter";
import { ExportError } from "../utils/export-validation.utils";

describe("PngExporter (Slice 47)", () => {
  const baseRect: RectangleShape = {
    id: "rect-png-1",
    type: "rectangle",
    x: 10,
    y: 10,
    width: 100,
    height: 80,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    fill: "#10b981",
    stroke: "#047857",
    strokeWidth: 2,
  };

  it("should produce a valid PNG Blob with correct MIME type and dimensions", async () => {
    const scene = prepareExportScene([baseRect], {
      format: "png",
      scope: "canvas",
      scale: 2,
      padding: 10,
    });

    const result = await pngExporter.process(scene);

    expect(result.format).toBe("png");
    expect(result.mimeType).toBe("image/png");
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.type).toBe("image/png");
    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.width).toBe(scene.logicalDimensions.width);
    expect(result.height).toBe(scene.logicalDimensions.height);
    expect(result.pixelWidth).toBe(scene.pixelDimensions.width);
    expect(result.pixelHeight).toBe(scene.pixelDimensions.height);
    expect(result.filename).toContain(".png");
  });

  it("should preserve PNG binary signature in the generated Blob", async () => {
    const scene = prepareExportScene([baseRect], {
      format: "png",
      scope: "canvas",
    });

    const result = await pngExporter.process(scene);
    const arrayBuffer = await result.blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    // Standard 8-byte PNG signature: 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A
    expect(bytes[0]).toBe(0x89);
    expect(bytes[1]).toBe(0x50); // P
    expect(bytes[2]).toBe(0x4e); // N
    expect(bytes[3]).toBe(0x47); // G
  });

  it("should support custom filenames", async () => {
    const scene = prepareExportScene([baseRect], {
      format: "png",
      scope: "canvas",
    });

    const result = await pngExporter.process(scene, {
      customFilename: "my-custom-drawing.png",
    });

    expect(result.filename).toBe("my-custom-drawing.png");
  });

  it("should throw ExportError if export is aborted via signal", async () => {
    const scene = prepareExportScene([baseRect], {
      format: "png",
      scope: "canvas",
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      pngExporter.process(scene, { signal: controller.signal })
    ).rejects.toThrow(ExportError);
  });
});
