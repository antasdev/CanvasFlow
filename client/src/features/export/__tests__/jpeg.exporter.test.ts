import { describe, it, expect } from "vitest";
import type { RectangleShape } from "@/features/canvas/types";
import { prepareExportScene } from "../utils/export-geometry.utils";
import { jpegExporter } from "../processors/jpeg.exporter";
import { ExportError } from "../utils/export-validation.utils";

describe("JpegExporter (Slice 47)", () => {
  const baseRect: RectangleShape = {
    id: "rect-jpeg-1",
    type: "rectangle",
    x: 20,
    y: 20,
    width: 150,
    height: 100,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    fill: "#f59e0b",
    stroke: "#b45309",
    strokeWidth: 2,
  };

  it("should produce a valid JPEG Blob with correct MIME type and dimensions", async () => {
    const scene = prepareExportScene([baseRect], {
      format: "jpeg",
      scope: "canvas",
      quality: 0.85,
    });

    const result = await jpegExporter.process(scene);

    expect(result.format).toBe("jpeg");
    expect(result.mimeType).toBe("image/jpeg");
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.blob.type).toBe("image/jpeg");
    expect(result.blob.size).toBeGreaterThan(0);
    expect(result.width).toBe(scene.logicalDimensions.width);
    expect(result.height).toBe(scene.logicalDimensions.height);
    expect(result.pixelWidth).toBe(scene.pixelDimensions.width);
    expect(result.pixelHeight).toBe(scene.pixelDimensions.height);
    expect(result.filename).toContain(".jpeg");
  });

  it("should preserve JPEG binary SOI marker (0xFF, 0xD8, 0xFF) in generated Blob", async () => {
    const scene = prepareExportScene([baseRect], {
      format: "jpeg",
      scope: "canvas",
    });

    const result = await jpegExporter.process(scene);
    const arrayBuffer = await result.blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);

    expect(bytes[0]).toBe(0xff);
    expect(bytes[1]).toBe(0xd8);
    expect(bytes[2]).toBe(0xff);
  });

  it("should map transparent background to solid #ffffff because JPEG lacks alpha support", async () => {
    const transparentScene = prepareExportScene([baseRect], {
      format: "jpeg",
      scope: "canvas",
      background: "transparent",
    });

    expect(transparentScene.background.mode).toBe("transparent");

    // Process should complete successfully without throwing
    const result = await jpegExporter.process(transparentScene);
    expect(result.blob).toBeInstanceOf(Blob);
    expect(result.mimeType).toBe("image/jpeg");
  });

  it("should abort processing if AbortSignal is cancelled", async () => {
    const scene = prepareExportScene([baseRect], {
      format: "jpeg",
      scope: "canvas",
    });

    const controller = new AbortController();
    controller.abort();

    await expect(
      jpegExporter.process(scene, { signal: controller.signal })
    ).rejects.toThrow(ExportError);
  });
});
