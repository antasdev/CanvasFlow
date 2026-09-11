import type { ExportFormat, ExportScope, ExportBackground } from "../types/export.types";

export const SUPPORTED_EXPORT_FORMATS: readonly ExportFormat[] = [
  "png",
  "jpeg",
  "svg",
  "pdf",
] as const;

export const SUPPORTED_EXPORT_SCOPES: readonly ExportScope[] = [
  "canvas",
  "selection",
  "viewport",
] as const;

export const SUPPORTED_EXPORT_BACKGROUNDS: readonly ExportBackground[] = [
  "transparent",
  "canvas",
  "solid",
] as const;

export const DEFAULT_EXPORT_SCALE = 1;
export const MIN_EXPORT_SCALE = 0.5;
export const MAX_EXPORT_SCALE = 4;

export const DEFAULT_EXPORT_QUALITY = 0.92;
export const MIN_EXPORT_QUALITY = 0.1;
export const MAX_EXPORT_QUALITY = 1.0;

export const DEFAULT_EXPORT_PADDING = 20;
export const MIN_EXPORT_PADDING = 0;
export const MAX_EXPORT_PADDING = 500;

/**
 * Maximum rendered output pixel dimension in width or height (e.g., 8192px).
 * Protects client memory from canvas allocation crash (e.g. allocating 20,000x20,000px).
 */
export const MAX_EXPORT_PIXEL_DIMENSION = 8192;

export const DEFAULT_CANVAS_BACKGROUND_COLOR = "#ffffff";
