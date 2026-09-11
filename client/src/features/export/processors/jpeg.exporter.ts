import type { ExportPreparedScene } from "../types/export.types";
import type {
  ExportProcessor,
  ExportProcessorOptions,
  ExportResult,
} from "../types/export-processor.types";
import {
  DEFAULT_EXPORT_QUALITY,
  MIN_EXPORT_QUALITY,
  MAX_EXPORT_QUALITY,
} from "../constants/export.constants";
import { ExportError } from "../utils/export-validation.utils";
import { renderSceneToRasterBlob } from "../utils/export-canvas.adapter";

/**
 * Pure JPEG exporter implementing the ExportProcessor interface.
 *
 * Architectural Decision:
 * JPEG does not support alpha transparency.
 * If scene background mode is "transparent", it is explicitly mapped to opaque white ("#ffffff")
 * to avoid black or corrupted background artifacts in JPEG viewers.
 */
export class JpegExporter implements ExportProcessor {
  public readonly format = "jpeg" as const;
  public readonly mimeType = "image/jpeg" as const;

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

    // Guarantee non-transparent background for JPEG
    const effectiveScene: ExportPreparedScene =
      scene.background.mode === "transparent"
        ? {
            ...scene,
            background: {
              mode: "solid",
              color: "#ffffff",
            },
          }
        : scene;

    // Enforce valid quality range [MIN_EXPORT_QUALITY, MAX_EXPORT_QUALITY]
    const quality = Math.min(
      MAX_EXPORT_QUALITY,
      Math.max(
        MIN_EXPORT_QUALITY,
        typeof scene.quality === "number" ? scene.quality : DEFAULT_EXPORT_QUALITY
      )
    );

    const blob = await renderSceneToRasterBlob(
      effectiveScene,
      this.mimeType,
      quality,
      options?.signal
    );

    const filename =
      options?.customFilename ??
      `canvasflow-export-${scene.metadata.timestamp || Date.now()}.jpeg`;

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

export const jpegExporter = new JpegExporter();
