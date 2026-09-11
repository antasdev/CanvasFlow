import type { Shape } from "@/features/canvas/types";
import { getShapeWorldTransform } from "@/features/canvas/utils/group-geometry.utils";
import type {
  ExportOptions,
  ExportPreparedScene,
  ExportPreparedShape,
  ExportDimensions,
} from "../types/export.types";
import {
  DEFAULT_EXPORT_SCALE,
  DEFAULT_EXPORT_QUALITY,
  DEFAULT_EXPORT_PADDING,
  DEFAULT_CANVAS_BACKGROUND_COLOR,
} from "../constants/export.constants";
import {
  validateExportOptions,
  validateExportDimensions,
  ExportError,
} from "./export-validation.utils";
import {
  calculateContentBounds,
  applyExportPadding,
} from "./export-bounds.utils";
import {
  filterShapesForExport,
  sortShapesForExport,
} from "./export-order.utils";

/**
 * Normalizes an individual shape into the export coordinate space.
 * Translates coordinates by `(worldX - finalBounds.minX, worldY - finalBounds.minY)`
 * so that the output origin starts at (0, 0) inside the padded export scene.
 */
export function normalizeExportShape(
  shape: Shape,
  shapesMap: Map<string, Shape>,
  finalBounds: { minX: number; minY: number }
): ExportPreparedShape {
  const worldTransform = getShapeWorldTransform(shape, shapesMap);
  const normalizedX = worldTransform.x - finalBounds.minX;
  const normalizedY = worldTransform.y - finalBounds.minY;

  let normalizedPoints: number[] | undefined = undefined;

  if ("points" in shape && Array.isArray(shape.points)) {
    const rawPoints = shape.points as number[];
    normalizedPoints = [];
    const rad = ((worldTransform.rotation ?? 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    for (let i = 0; i < rawPoints.length; i += 2) {
      const px = rawPoints[i];
      const py = rawPoints[i + 1];

      // Rotate local points by world rotation, then translate by world origin offset
      const worldPx = cos * px - sin * py + worldTransform.x;
      const worldPy = sin * px + cos * py + worldTransform.y;

      normalizedPoints.push(
        worldPx - finalBounds.minX,
        worldPy - finalBounds.minY
      );
    }
  }

  return {
    id: shape.id,
    type: shape.type,
    shape, // Preserved reference for future renderer adapters (Slice 47)
    worldX: worldTransform.x,
    worldY: worldTransform.y,
    normalizedX,
    normalizedY,
    width: shape.width,
    height: shape.height,
    rotation: worldTransform.rotation,
    zIndex: shape.zIndex,
    parentId: shape.parentId ?? null,
    points: "points" in shape && Array.isArray(shape.points) ? (shape.points as number[]) : undefined,
    normalizedPoints,
  };
}

/**
 * Pure orchestration pipeline:
 * 1. Validates options.
 * 2. Filters shapes by scope.
 * 3. Sorts shapes deterministically by authoritative zIndex.
 * 4. Computes content bounds in world coordinates.
 * 5. Applies padding to create final export bounds.
 * 6. Calculates logical and pixel output dimensions.
 * 7. Validates pixel dimensions against safety limits.
 * 8. Normalizes shape coordinates relative to final bounds.
 * 9. Produces an immutable ExportPreparedScene representation ready for Slice 47 encoders.
 *
 * Guaranteed read-only: NEVER mutates the input shapes or canvas state.
 */
export function prepareExportScene(
  shapes: readonly Shape[],
  options: ExportOptions
): ExportPreparedScene {
  validateExportOptions(options);

  // Build lookup map for fast group hierarchy resolution
  const shapesMap = new Map<string, Shape>();
  for (const s of shapes) {
    shapesMap.set(s.id, s);
  }

  // Filter shapes by requested scope
  const filteredShapes = filterShapesForExport(
    [...shapes],
    options,
    shapesMap
  );

  if (filteredShapes.length === 0) {
    throw new ExportError(
      "EMPTY_CANVAS",
      "No shapes available for export in the requested scope."
    );
  }

  // Sort deterministically
  const sortedShapes = sortShapesForExport(filteredShapes);

  // Compute world content bounds
  const contentBounds = calculateContentBounds(sortedShapes, shapesMap);

  // Apply padding
  const padding = options.padding ?? DEFAULT_EXPORT_PADDING;
  const finalBounds = applyExportPadding(contentBounds, padding);

  const scale = options.scale ?? DEFAULT_EXPORT_SCALE;
  const quality = options.quality ?? DEFAULT_EXPORT_QUALITY;

  const logicalDimensions: ExportDimensions = {
    width: Math.round(finalBounds.width),
    height: Math.round(finalBounds.height),
  };

  const pixelDimensions: ExportDimensions = {
    width: Math.round(logicalDimensions.width * scale),
    height: Math.round(logicalDimensions.height * scale),
  };

  // Ensure output dimensions don't exceed memory limits
  validateExportDimensions(pixelDimensions);

  // Normalize shape positions
  const preparedShapes: ExportPreparedShape[] = sortedShapes.map((shape) =>
    normalizeExportShape(shape, shapesMap, finalBounds)
  );

  const backgroundMode = options.background ?? "canvas";
  const backgroundColor =
    options.backgroundColor ??
    (backgroundMode === "canvas"
      ? DEFAULT_CANVAS_BACKGROUND_COLOR
      : backgroundMode === "solid"
      ? "#ffffff"
      : "transparent");

  return {
    format: options.format,
    scope: options.scope,
    scale,
    quality,
    padding,
    background: {
      mode: backgroundMode,
      color: backgroundColor,
    },
    contentBounds,
    finalBounds,
    logicalDimensions,
    pixelDimensions,
    shapes: preparedShapes,
    metadata: {
      shapeCount: preparedShapes.length,
      totalInputShapes: shapes.length,
      timestamp: Date.now(),
      isSelection: options.scope === "selection",
      isViewport: options.scope === "viewport",
    },
  };
}
