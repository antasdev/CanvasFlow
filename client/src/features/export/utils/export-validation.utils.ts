import type {
  ExportErrorCode,
  ExportOptions,
  ExportDimensions,
} from "../types/export.types";
import {
  SUPPORTED_EXPORT_FORMATS,
  SUPPORTED_EXPORT_SCOPES,
  SUPPORTED_EXPORT_BACKGROUNDS,
  MIN_EXPORT_SCALE,
  MAX_EXPORT_SCALE,
  MIN_EXPORT_PADDING,
  MAX_EXPORT_PADDING,
  MIN_EXPORT_QUALITY,
  MAX_EXPORT_QUALITY,
  MAX_EXPORT_PIXEL_DIMENSION,
} from "../constants/export.constants";

export class ExportError extends Error {
  public readonly code: ExportErrorCode;

  constructor(code: ExportErrorCode, message: string) {
    super(message);
    this.name = "ExportError";
    this.code = code;
    Object.setPrototypeOf(this, ExportError.prototype);
  }
}

/**
 * Validates the raw export options supplied to the domain pipeline.
 */
export function validateExportOptions(options: ExportOptions): void {
  if (!options) {
    throw new ExportError(
      "INVALID_EXPORT_OPTIONS",
      "Export options must be provided."
    );
  }

  if (!SUPPORTED_EXPORT_FORMATS.includes(options.format)) {
    throw new ExportError(
      "UNSUPPORTED_FORMAT",
      `Unsupported export format: ${String(options.format)}`
    );
  }

  if (!SUPPORTED_EXPORT_SCOPES.includes(options.scope)) {
    throw new ExportError(
      "INVALID_EXPORT_OPTIONS",
      `Invalid export scope: ${String(options.scope)}`
    );
  }

  if (options.scale !== undefined) {
    if (
      typeof options.scale !== "number" ||
      Number.isNaN(options.scale) ||
      options.scale < MIN_EXPORT_SCALE ||
      options.scale > MAX_EXPORT_SCALE
    ) {
      throw new ExportError(
        "INVALID_EXPORT_OPTIONS",
        `Export scale must be a finite number between ${MIN_EXPORT_SCALE} and ${MAX_EXPORT_SCALE}.`
      );
    }
  }

  if (options.padding !== undefined) {
    if (
      typeof options.padding !== "number" ||
      Number.isNaN(options.padding) ||
      options.padding < MIN_EXPORT_PADDING ||
      options.padding > MAX_EXPORT_PADDING
    ) {
      throw new ExportError(
        "INVALID_EXPORT_OPTIONS",
        `Export padding must be a finite number between ${MIN_EXPORT_PADDING} and ${MAX_EXPORT_PADDING}.`
      );
    }
  }

  if (options.quality !== undefined) {
    if (
      typeof options.quality !== "number" ||
      Number.isNaN(options.quality) ||
      options.quality < MIN_EXPORT_QUALITY ||
      options.quality > MAX_EXPORT_QUALITY
    ) {
      throw new ExportError(
        "INVALID_EXPORT_OPTIONS",
        `Export quality must be a finite number between ${MIN_EXPORT_QUALITY} and ${MAX_EXPORT_QUALITY}.`
      );
    }
  }

  if (options.background !== undefined) {
    if (!SUPPORTED_EXPORT_BACKGROUNDS.includes(options.background)) {
      throw new ExportError(
        "INVALID_EXPORT_OPTIONS",
        `Invalid export background mode: ${String(options.background)}`
      );
    }
  }

  if (options.scope === "selection") {
    if (
      !options.selectedShapeIds ||
      !Array.isArray(options.selectedShapeIds) ||
      options.selectedShapeIds.length === 0
    ) {
      throw new ExportError(
        "INVALID_EXPORT_OPTIONS",
        "Selection export requires at least one selected shape ID."
      );
    }
  }

  if (options.scope === "viewport") {
    if (!options.viewport) {
      throw new ExportError(
        "INVALID_EXPORT_OPTIONS",
        "Viewport export requires viewport parameters (zoom, pan, screen dimensions)."
      );
    }
    const { zoom, pan, screenWidth, screenHeight } = options.viewport;
    if (
      typeof zoom !== "number" ||
      Number.isNaN(zoom) ||
      zoom <= 0 ||
      !pan ||
      typeof pan.x !== "number" ||
      typeof pan.y !== "number" ||
      typeof screenWidth !== "number" ||
      typeof screenHeight !== "number" ||
      screenWidth <= 0 ||
      screenHeight <= 0
    ) {
      throw new ExportError(
        "INVALID_EXPORT_OPTIONS",
        "Invalid viewport parameters provided for viewport export."
      );
    }
  }
}

/**
 * Validates the output pixel dimensions against maximum safe canvas size limits.
 */
export function validateExportDimensions(pixelDimensions: ExportDimensions): void {
  if (
    pixelDimensions.width > MAX_EXPORT_PIXEL_DIMENSION ||
    pixelDimensions.height > MAX_EXPORT_PIXEL_DIMENSION
  ) {
    throw new ExportError(
      "EXPORT_TOO_LARGE",
      `Export dimensions (${pixelDimensions.width}x${pixelDimensions.height}) exceed maximum allowed dimension (${MAX_EXPORT_PIXEL_DIMENSION}px).`
    );
  }
}
