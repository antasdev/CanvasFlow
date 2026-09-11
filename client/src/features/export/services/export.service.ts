import type { Shape } from "@/features/canvas/types";
import type {
  ExportFormat,
  ExportOptions,
  ExportPreparedScene,
} from "../types/export.types";
import type {
  ExportProcessor,
  ExportProcessorOptions,
  ExportResult,
} from "../types/export-processor.types";
import { prepareExportScene } from "../utils/export-geometry.utils";
import {
  validateExportDimensions,
  ExportError,
} from "../utils/export-validation.utils";
import { pngExporter } from "../processors/png.exporter";
import { jpegExporter } from "../processors/jpeg.exporter";
import { svgExporter } from "../processors/svg.exporter";
import { pdfExporter } from "../processors/pdf.exporter";

/**
 * Registry mapping supported ExportFormats to their dedicated ExportProcessor implementations.
 */
const PROCESSOR_REGISTRY: Record<ExportFormat, ExportProcessor> = {
  png: pngExporter,
  jpeg: jpegExporter,
  svg: svgExporter,
  pdf: pdfExporter,
};

/**
 * Service providing the authoritative export processing orchestration pipeline.
 *
 * Strictly read-only: Never mutates document state, creates mutation records,
 * increments revisions, or interacts with collaborative sockets.
 */
export class ExportService {
  /**
   * Retrieves the processor registered for the given export format.
   */
  public getProcessor(format: ExportFormat): ExportProcessor {
    const processor = PROCESSOR_REGISTRY[format];
    if (!processor) {
      throw new ExportError(
        "UNSUPPORTED_FORMAT",
        `No processor registered for export format: ${String(format)}`
      );
    }
    return processor;
  }

  /**
   * Processes a pre-prepared ExportPreparedScene into an ExportResult Blob.
   */
  public async exportPreparedScene(
    scene: ExportPreparedScene,
    options?: ExportProcessorOptions
  ): Promise<ExportResult> {
    if (!scene) {
      throw new ExportError(
        "INVALID_EXPORT_OPTIONS",
        "Prepared export scene must be provided."
      );
    }

    // Safety validation
    validateExportDimensions(scene.pixelDimensions);

    if (!scene.shapes || scene.shapes.length === 0) {
      throw new ExportError(
        "EMPTY_CANVAS",
        "Cannot export an empty scene with zero shapes."
      );
    }

    const processor = this.getProcessor(scene.format);
    return processor.process(scene, options);
  }

  /**
   * End-to-end export pipeline:
   * 1. Prepares the normalized export scene from input shapes and options.
   * 2. Validates export dimensions against memory limits.
   * 3. Dispatches to the appropriate format encoder.
   * 4. Returns the strongly-typed ExportResult Blob.
   */
  public async exportShapes(
    shapes: readonly Shape[],
    options: ExportOptions,
    processingOptions?: ExportProcessorOptions
  ): Promise<ExportResult> {
    // Prepare normalized export scene using Slice 46 domain logic
    const scene = prepareExportScene(shapes, options);

    // Process through the format-specific processor
    return this.exportPreparedScene(scene, processingOptions);
  }
}

export const exportService = new ExportService();
