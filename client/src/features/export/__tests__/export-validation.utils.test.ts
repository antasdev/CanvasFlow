import { describe, expect, it } from "vitest";
import {
  validateExportOptions,
  validateExportDimensions,
  ExportError,
} from "../utils/export-validation.utils";
import type { ExportOptions } from "../types/export.types";
import { MAX_EXPORT_PIXEL_DIMENSION } from "../constants/export.constants";

describe("Export Validation Utilities", () => {
  const validBaseOptions: ExportOptions = {
    format: "png",
    scope: "canvas",
    scale: 2,
    padding: 20,
    quality: 0.92,
  };

  it("passes for valid canvas export options", () => {
    expect(() => validateExportOptions(validBaseOptions)).not.toThrow();
  });

  it("throws UNSUPPORTED_FORMAT for invalid formats", () => {
    const invalidOptions: ExportOptions = {
      ...validBaseOptions,
      format: "bmp" as never,
    };
    expect(() => validateExportOptions(invalidOptions)).toThrowError(ExportError);
    expect(() => validateExportOptions(invalidOptions)).toThrow("Unsupported export format");
  });

  it("throws INVALID_EXPORT_OPTIONS for out-of-range scale", () => {
    expect(() =>
      validateExportOptions({ ...validBaseOptions, scale: 0.1 })
    ).toThrowError(ExportError);

    expect(() =>
      validateExportOptions({ ...validBaseOptions, scale: 10 })
    ).toThrowError(ExportError);
  });

  it("throws INVALID_EXPORT_OPTIONS for out-of-range padding", () => {
    expect(() =>
      validateExportOptions({ ...validBaseOptions, padding: -5 })
    ).toThrowError(ExportError);

    expect(() =>
      validateExportOptions({ ...validBaseOptions, padding: 1000 })
    ).toThrowError(ExportError);
  });

  it("requires selectedShapeIds when scope is selection", () => {
    expect(() =>
      validateExportOptions({
        format: "png",
        scope: "selection",
      })
    ).toThrowError(ExportError);

    expect(() =>
      validateExportOptions({
        format: "png",
        scope: "selection",
        selectedShapeIds: [],
      })
    ).toThrow("Selection export requires at least one selected shape ID.");
  });

  it("requires valid viewport parameters when scope is viewport", () => {
    expect(() =>
      validateExportOptions({
        format: "png",
        scope: "viewport",
      })
    ).toThrow("Viewport export requires viewport parameters");

    expect(() =>
      validateExportOptions({
        format: "png",
        scope: "viewport",
        viewport: {
          zoom: 0,
          pan: { x: 0, y: 0 },
          screenWidth: 800,
          screenHeight: 600,
        },
      })
    ).toThrow("Invalid viewport parameters");
  });

  it("validates export pixel dimensions against maximum safe limits", () => {
    expect(() =>
      validateExportDimensions({ width: 1920, height: 1080 })
    ).not.toThrow();

    expect(() =>
      validateExportDimensions({
        width: MAX_EXPORT_PIXEL_DIMENSION + 10,
        height: 1080,
      })
    ).toThrowError(ExportError);

    expect(() =>
      validateExportDimensions({
        width: MAX_EXPORT_PIXEL_DIMENSION + 10,
        height: 1080,
      })
    ).toThrow("exceed maximum allowed dimension");
  });
});
