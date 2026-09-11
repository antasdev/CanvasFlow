// Types
export type {
  ExportFormat,
  ExportScope,
  ExportBackground,
  ExportBounds,
  ExportDimensions,
  ExportViewport,
  ExportOptions,
  ExportPreparedShape,
  ExportPreparedScene,
  ExportErrorCode,
} from "./types/export.types";

export type {
  ExportResult,
  ExportProcessorOptions,
  ExportProcessor,
} from "./types/export-processor.types";

// Constants
export {
  SUPPORTED_EXPORT_FORMATS,
  SUPPORTED_EXPORT_SCOPES,
  SUPPORTED_EXPORT_BACKGROUNDS,
  DEFAULT_EXPORT_SCALE,
  MIN_EXPORT_SCALE,
  MAX_EXPORT_SCALE,
  DEFAULT_EXPORT_QUALITY,
  MIN_EXPORT_QUALITY,
  MAX_EXPORT_QUALITY,
  DEFAULT_EXPORT_PADDING,
  MIN_EXPORT_PADDING,
  MAX_EXPORT_PADDING,
  MAX_EXPORT_PIXEL_DIMENSION,
  DEFAULT_CANVAS_BACKGROUND_COLOR,
} from "./constants/export.constants";

// Validation & Error
export {
  ExportError,
  validateExportOptions,
  validateExportDimensions,
} from "./utils/export-validation.utils";

// Bounds calculation
export {
  calculateShapeWorldBounds,
  calculateContentBounds,
  applyExportPadding,
} from "./utils/export-bounds.utils";

// Ordering & Filtering
export {
  filterShapesForExport,
  sortShapesForExport,
} from "./utils/export-order.utils";

// Geometry Normalization & Scene Preparation
export {
  normalizeExportShape,
  prepareExportScene,
} from "./utils/export-geometry.utils";

// Raster Canvas Adapter
export {
  renderSceneToRasterBlob,
  renderPreparedShapeToCanvas,
} from "./utils/export-canvas.adapter";

// Format Processors
export {
  SvgExporter,
  svgExporter,
  escapeXmlText,
  escapeXmlAttr,
  sanitizeColor,
} from "./processors/svg.exporter";

export { PngExporter, pngExporter } from "./processors/png.exporter";

export { JpegExporter, jpegExporter } from "./processors/jpeg.exporter";

export {
  PdfExporter,
  pdfExporter,
  buildPdfDocument,
  parseColorToRgb,
  escapePdfString,
} from "./processors/pdf.exporter";

// Export Service
export { ExportService, exportService } from "./services/export.service";

// Download Utilities
export {
  sanitizeFilename,
  triggerBlobDownload,
} from "./utils/download.utils";

// Dialog Store & Hook
export {
  useExportDialogStore,
  type ExportDialogState,
  type OpenExportOptions,
} from "./store/export-dialog.store";

export {
  useExportDialog,
  type UseExportDialogReturn,
} from "./hooks/useExportDialog";

// UI Components
export { ExportButton, type ExportButtonProps } from "./components/ExportButton";
export { ExportDialog } from "./components/ExportDialog";
