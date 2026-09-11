import type { Shape } from "@/features/canvas/types";
import { screenToWorld } from "@/features/canvas/utils/canvas.coordinates";
import type { ExportOptions, ExportBounds } from "../types/export.types";
import { calculateShapeWorldBounds } from "./export-bounds.utils";

/**
 * Traverses descendant shapes recursively for any group ID.
 */
function collectDescendantIds(
  groupId: string,
  shapes: Shape[],
  collected: Set<string>
): void {
  for (const shape of shapes) {
    if (shape.parentId === groupId && !collected.has(shape.id)) {
      collected.add(shape.id);
      if (shape.type === "group") {
        collectDescendantIds(shape.id, shapes, collected);
      }
    }
  }
}

/**
 * Tests if an axis-aligned bounding box intersects another axis-aligned bounding box.
 */
function aabbIntersects(a: ExportBounds, b: ExportBounds): boolean {
  return !(
    a.maxX < b.minX ||
    a.minX > b.maxX ||
    a.maxY < b.minY ||
    a.minY > b.maxY
  );
}

/**
 * Pure function to filter candidate shapes based on the requested export scope:
 * - "canvas": all shapes in the document.
 * - "selection": selected shapes plus any descendants if a group is selected.
 * - "viewport": shapes whose world bounds intersect the world rectangle of the visible viewport.
 *
 * Excludes non-renderable tools and pure containers without visual representation if necessary.
 */
export function filterShapesForExport(
  shapes: Shape[],
  options: ExportOptions,
  shapesMap: Map<string, Shape>
): Shape[] {
  const eligibleShapes = shapes;

  if (options.scope === "canvas") {
    return eligibleShapes;
  }

  if (options.scope === "selection") {
    const selectedIds = new Set<string>(options.selectedShapeIds ?? []);
    const expandedIds = new Set<string>(selectedIds);

    // If any selected shape is a group, include all of its descendants
    for (const id of selectedIds) {
      const shape = shapesMap.get(id);
      if (shape && shape.type === "group") {
        collectDescendantIds(shape.id, eligibleShapes, expandedIds);
      }
    }

    return eligibleShapes.filter((s) => expandedIds.has(s.id));
  }

  if (options.scope === "viewport" && options.viewport) {
    const { zoom, pan, screenWidth, screenHeight } = options.viewport;

    // Convert top-left and bottom-right viewport corners to world space
    const topLeftWorld = screenToWorld({ x: 0, y: 0 }, { zoom, pan });
    const bottomRightWorld = screenToWorld(
      { x: screenWidth, y: screenHeight },
      { zoom, pan }
    );

    const viewportWorldBounds: ExportBounds = {
      minX: Math.min(topLeftWorld.x, bottomRightWorld.x),
      minY: Math.min(topLeftWorld.y, bottomRightWorld.y),
      maxX: Math.max(topLeftWorld.x, bottomRightWorld.x),
      maxY: Math.max(topLeftWorld.y, bottomRightWorld.y),
      width: Math.abs(bottomRightWorld.x - topLeftWorld.x),
      height: Math.abs(bottomRightWorld.y - topLeftWorld.y),
    };

    return eligibleShapes.filter((shape) => {
      const shapeBounds = calculateShapeWorldBounds(shape, shapesMap);
      return aabbIntersects(shapeBounds, viewportWorldBounds);
    });
  }

  return eligibleShapes;
}

/**
 * Pure function to sort shapes deterministically preserving authoritative zIndex order.
 * If zIndex is equal, falls back to the original index in the input array.
 */
export function sortShapesForExport(shapes: Shape[]): Shape[] {
  // Record original index for stable tie-breaking
  const indexed = shapes.map((shape, originalIndex) => ({
    shape,
    originalIndex,
  }));

  indexed.sort((a, b) => {
    const zA = typeof a.shape.zIndex === "number" ? a.shape.zIndex : 0;
    const zB = typeof b.shape.zIndex === "number" ? b.shape.zIndex : 0;

    if (zA !== zB) {
      return zA - zB;
    }

    return a.originalIndex - b.originalIndex;
  });

  return indexed.map((item) => item.shape);
}
