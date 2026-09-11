import type { ExportFormat, ExportPreparedScene } from "./export.types";

/**
 * The strongly-typed result produced by an export processor.
 * Guarantees zero DOM/React leakage and provides all metadata required for consumption or download.
 */
export type ExportResult = {
  blob: Blob;
  mimeType: string;
  format: ExportFormat;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  filename: string;
};

/**
 * Options passed to an individual export processor execution.
 */
export type ExportProcessorOptions = {
  signal?: AbortSignal;
  customFilename?: string;
};

/**
 * Processor contract implemented by each format-specific encoder.
 */
export interface ExportProcessor {
  readonly format: ExportFormat;
  readonly mimeType: string;
  process(
    scene: ExportPreparedScene,
    options?: ExportProcessorOptions
  ): Promise<ExportResult>;
}
