import type { CanvasTool } from "../constants";
import type { Shape } from "../types";
import type { CanvasStore, RemoteShapeLock, RemoteShapeTransform, SmartGuide } from "./canvas.store";

/**
 * Primitive selector for current active canvas tool.
 */
export const selectActiveTool = (state: CanvasStore): CanvasTool => state.activeTool;

/**
 * Primitive selector for canvas zoom level.
 */
export const selectZoom = (state: CanvasStore): number => state.zoom;

/**
 * Selector for viewport pan coordinates.
 */
export const selectPan = (state: CanvasStore): { x: number; y: number } => state.pan;

/**
 * Primitive selector for undo availability.
 * Avoids broad re-evaluation on shape movements and only flips when history boundary changes.
 */
export const selectCanUndo = (state: CanvasStore): boolean => state.past.length > 0;

/**
 * Primitive selector for redo availability.
 */
export const selectCanRedo = (state: CanvasStore): boolean => state.future.length > 0;

/**
 * Curried primitive boolean selector checking whether a specific shape is currently selected.
 * Returning a boolean ensures that unselected shapes do NOT re-render when other shapes are selected.
 */
export const selectIsShapeSelected = (shapeId: string): ((state: CanvasStore) => boolean) => {
  return (state: CanvasStore): boolean => state.selectedShapeIds.includes(shapeId);
};

/**
 * Curried selector for shape-specific remote collaborative lock.
 * Ensures peer lock activity on other shapes does not re-render unaffected shapes.
 */
export const selectRemoteShapeLock = (
  shapeId: string
): ((state: CanvasStore) => RemoteShapeLock | undefined) => {
  return (state: CanvasStore): RemoteShapeLock | undefined => state.remoteShapeLocks[shapeId];
};

/**
 * Curried selector for shape-specific remote transformation frame.
 * Ensures 60Hz peer transform streams only notify the targeted shape node.
 */
export const selectRemoteShapeTransform = (
  shapeId: string
): ((state: CanvasStore) => RemoteShapeTransform | undefined) => {
  return (state: CanvasStore): RemoteShapeTransform | undefined =>
    state.remoteShapeTransforms[shapeId];
};

/**
 * Primitive selector for total count of shapes on the canvas.
 * Useful for dialogs and status counters without subscribing to the shapes array.
 */
export const selectShapeCount = (state: CanvasStore): number => state.shapes.length;

/**
 * Primitive selector for count of selected shapes.
 */
export const selectSelectedShapeCount = (state: CanvasStore): number =>
  state.selectedShapeIds.length;

/**
 * Primitive boolean selector for whether any shape is currently selected.
 */
export const selectHasSelection = (state: CanvasStore): boolean =>
  state.selectedShapeIds.length > 0;

/**
 * Selector for ephemeral smart snapping guidelines.
 */
export const selectSmartGuides = (state: CanvasStore): SmartGuide[] => state.smartGuides;

/**
 * Curried selector to find a single shape by its ID.
 * Returns stable reference when other shapes are modified.
 */
export const selectShapeById = (
  shapeId: string | null | undefined
): ((state: CanvasStore) => Shape | undefined) => {
  return (state: CanvasStore): Shape | undefined =>
    shapeId ? state.shapes.find((s) => s.id === shapeId) : undefined;
};
