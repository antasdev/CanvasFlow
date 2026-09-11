import type { ExportPreparedScene } from "../types/export.types";
import type {
  ExportProcessor,
  ExportProcessorOptions,
  ExportResult,
} from "../types/export-processor.types";
import { ExportError } from "../utils/export-validation.utils";
import { renderSceneToRasterBlob } from "../utils/export-canvas.adapter";

/**
 * Pure PNG exporter implementing the ExportProcessor interface.
 * Preserves transparency when requested and renders offscreen to guarantee
 * that no editor UI overlays are included in the output image.
 */
export class PngExporter implements ExportProcessor {
  public readonly format = "png" as const;
  public readonly mimeType = "image/png" as const;

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

    const blob = await renderSceneToRasterBlob(
      scene,
      this.mimeType,
      undefined,
      options?.signal
    );

    const filename =
      options?.customFilename ??
      `canvasflow-export-${scene.metadata.timestamp || Date.now()}.png`;

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

export const pngExporter = new PngExporter();
