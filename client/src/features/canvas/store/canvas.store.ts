import { create } from "zustand";

import {
  CANVAS_TOOLS,
  type CanvasTool,
} from "../constants";
import type { Shape, TextShape, ShapeStyle } from "../types";
import { isShapeCompatibleWithProperty } from "../utils/shape-style-capabilities.utils";
import { computeGroupBoundingBox, localToWorld } from "../utils/group-geometry.utils";
import type {
  RemoteCursor,
  RemoteSelection,
  RemoteShapeLock,
  RemoteShapeTransform,
} from "@/services/socket";

export type {
  RemoteCursor,
  RemoteSelection,
  RemoteShapeLock,
  RemoteShapeTransform,
};

type ShapePositionUpdate = {
  x: number;
  y: number;
};

type ShapeTransformUpdate = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  points?: number[];
};

type RectangleTransformUpdate = ShapeTransformUpdate;

type ShapeSnapshot = Shape[];

type CanvasStore = {
  activeTool: CanvasTool;

  shapes: Shape[];

  selectedShapeIds: string[];

  zoom: number;

  pan: {
    x: number;
    y: number;
  };

  past: ShapeSnapshot[];

  future: ShapeSnapshot[];

  setActiveTool: (tool: CanvasTool) => void;

  setShapes: (shapes: Shape[]) => void;

  addShape: (shape: Shape) => void;

  updateShapePosition: (
    shapeId: string,
    position: ShapePositionUpdate,
  ) => void;

  moveSelectedShapes: (
    deltaX: number,
    deltaY: number,
  ) => void;

  updateShapeTransform: (
    shapeId: string,
    transform: ShapeTransformUpdate,
  ) => void;

  updateRectangleTransform: (
    shapeId: string,
    transform: RectangleTransformUpdate,
  ) => void;

  updateShapeText: (
    shapeId: string,
    text: string,
  ) => void;

  updateShapeFormatting: (
    shapeId: string,
    formatting: Partial<Omit<TextShape, "id" | "type" | "x" | "y" | "width" | "height" | "rotation" | "zIndex" | "version">>
  ) => void;

  updateShapeStyle: (
    shapeId: string,
    style: Partial<ShapeStyle>,
    isLivePreview?: boolean
  ) => void;

  updateMultipleShapesStyle: (
    shapeIds: string[],
    style: Partial<ShapeStyle>,
    isLivePreview?: boolean
  ) => void;

  resetCanvas: () => void;

  deleteShape: (shapeId: string) => void;

  selectShape: (shapeId: string) => void;

  selectAllShapes: () => void;

  setSelectedShapeIds: (shapeIds: string[]) => void;

  toggleShapeSelection: (shapeId: string) => void;

  clearSelection: () => void;

  setZoom: (zoom: number) => void;

  setPan: (x: number, y: number) => void;

  remoteCursors: Record<string, RemoteCursor>;

  remoteSelections: Record<string, RemoteSelection>;

  remoteShapeLocks: Record<string, RemoteShapeLock>;

  remoteShapeTransforms: Record<string, RemoteShapeTransform>;

  applyRemoteShapeCreated: (shape: Shape) => void;

  applyRemoteShapeUpdated: (shape: Shape) => void;

  applyRemoteShapeDeleted: (shapeId: string) => void;

  setRemoteCursor: (cursor: RemoteCursor) => void;

  removeRemoteCursor: (userId: string) => void;

  clearRemoteCursors: () => void;

  setRemoteSelection: (selection: RemoteSelection) => void;

  removeRemoteSelection: (userId: string) => void;

  clearRemoteSelections: () => void;

  setRemoteShapeLock: (lock: RemoteShapeLock) => void;

  removeRemoteShapeLock: (shapeId: string) => void;

  clearRemoteShapeLocks: () => void;

  setRemoteShapeTransform: (transform: RemoteShapeTransform) => void;

  removeRemoteShapeTransform: (shapeId: string) => void;

  clearRemoteShapeTransforms: () => void;

  replaceShapesFromRecovery: (shapes: Shape[]) => void;

  editingGroupId: string | null;

  enterGroup: (groupId: string) => void;

  exitGroup: () => void;

  groupShapes: (shapeIds: string[], newGroupId?: string) => Shape | null;

  ungroupShapes: (groupId: string) => void;

  applyRemoteShapeGrouped: (group: Shape, children: Shape[]) => void;

  applyRemoteShapeUngrouped: (groupId: string, children: Shape[]) => void;

  undo: () => void;

  redo: () => void;

  canUndo: () => boolean;

  canRedo: () => boolean;
};

function applyStyleToShape(shape: Shape, style: Partial<ShapeStyle>): Shape {
  const updated: Record<string, unknown> = { ...shape };

  if (style.fill !== undefined && isShapeCompatibleWithProperty(shape.type, "fill")) {
    updated.fill = style.fill;
  }
  if (style.stroke !== undefined && isShapeCompatibleWithProperty(shape.type, "stroke")) {
    updated.stroke = style.stroke;
  }
  if (style.strokeWidth !== undefined && isShapeCompatibleWithProperty(shape.type, "strokeWidth")) {
    updated.strokeWidth = style.strokeWidth;
  }
  if (style.strokeStyle !== undefined && isShapeCompatibleWithProperty(shape.type, "strokeStyle")) {
    updated.strokeStyle = style.strokeStyle;
  }
  if (style.opacity !== undefined && isShapeCompatibleWithProperty(shape.type, "opacity")) {
    updated.opacity = style.opacity;
  }
  if (style.shadow !== undefined && isShapeCompatibleWithProperty(shape.type, "shadow")) {
    const existingShadow = (shape.shadow ?? {}) as Record<string, unknown>;
    updated.shadow = {
      ...existingShadow,
      ...style.shadow,
    };
  }

  return updated as Shape;
}

function getAllDescendantIds(rootId: string, shapes: Shape[]): Set<string> {
  const result = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const s of shapes) {
      if (s.parentId && result.has(s.parentId) && !result.has(s.id)) {
        result.add(s.id);
        added = true;
      }
    }
  }
  return result;
}

export const useCanvasStore = create<CanvasStore>(
  (set, get) => ({
    activeTool: CANVAS_TOOLS.SELECT,

    shapes: [],

    selectedShapeIds: [],

    editingGroupId: null,

    remoteCursors: {},

    remoteSelections: {},

    remoteShapeLocks: {},

    remoteShapeTransforms: {},

    zoom: 1,

    pan: {
      x: 0,
      y: 0,
    },

    past: [],

    future: [],

    setActiveTool: (tool: CanvasTool): void => {
      set({
        activeTool: tool,
      });
    },

    setShapes: (shapes: Shape[]): void => {
      set({
        shapes,
      });
    },

    addShape: (shape: Shape): void => {
      set((state) => ({
        past: [
          ...state.past,
          state.shapes,
        ],
        future: [],
        shapes: [
          ...state.shapes,
          shape,
        ],
      }));
    },

    updateShapePosition: (
      shapeId: string,
      position: ShapePositionUpdate,
    ): void => {
      set((state) => ({
        past: [
          ...state.past,
          state.shapes,
        ],
        future: [],
        shapes: state.shapes.map((shape) => {
          if (shape.id !== shapeId) {
            return shape;
          }

          return {
            ...shape,
            x: position.x,
            y: position.y,
          };
        }),
      }));
    },

    moveSelectedShapes: (
      deltaX: number,
      deltaY: number,
    ): void => {
      set((state) => {
        const nextShapes = state.shapes.map(
          (shape) => {
            if (
              !state.selectedShapeIds.includes(
                shape.id,
              )
            ) {
              return shape;
            }

            return {
              ...shape,
              x: shape.x + deltaX,
              y: shape.y + deltaY,
            };
          },
        );

        return {
          past: [
            ...state.past,
            state.shapes,
          ],
          future: [],
          shapes: nextShapes,
        };
      });
    },

    updateShapeTransform: (
      shapeId: string,
      transform: ShapeTransformUpdate,
    ): void => {
      set((state) => {
        const nextShapes = state.shapes.map(
          (shape): Shape => {
            if (shape.id !== shapeId) {
              return shape;
            }

            if (transform.points !== undefined && "points" in shape) {
              return {
                ...shape,
                ...transform,
              } as Shape;
            }

            const { points: _ignoredPoints, ...geomTransform } = transform;
            return {
              ...shape,
              ...geomTransform,
            } as Shape;
          },
        );

        return {
          past: [
            ...state.past,
            state.shapes,
          ],
          future: [],
          shapes: nextShapes,
        };
      });
    },

    updateRectangleTransform: (
      shapeId: string,
      transform: RectangleTransformUpdate,
    ): void => {
      get().updateShapeTransform(shapeId, transform);
    },

    updateShapeText: (
      shapeId: string,
      text: string,
    ): void => {
      set((state) => {
        const nextShapes = state.shapes.map(
          (shape) => {
            if (shape.id !== shapeId) {
              return shape;
            }

            if (shape.type === "text" || shape.type === "sticky_note") {
              return {
                ...shape,
                text,
              };
            }

            return shape;
          },
        );

        return {
          past: [
            ...state.past,
            state.shapes,
          ],
          future: [],
          shapes: nextShapes,
        };
      });
    },

    updateShapeFormatting: (
      shapeId: string,
      formatting: Partial<Omit<TextShape, "id" | "type" | "x" | "y" | "width" | "height" | "rotation" | "zIndex" | "version">>
    ): void => {
      set((state) => {
        const target = state.shapes.find((s) => s.id === shapeId);
        if (!target || target.type !== "text") {
          return state;
        }

        const nextShapes = state.shapes.map((shape) => {
          if (shape.id !== shapeId || shape.type !== "text") {
            return shape;
          }

          return {
            ...shape,
            ...formatting,
          };
        });

        return {
          past: [
            ...state.past,
            state.shapes,
          ],
          future: [],
          shapes: nextShapes,
        };
      });
    },

    updateMultipleShapesStyle: (
      shapeIds: string[],
      style: Partial<ShapeStyle>,
      isLivePreview = false
    ): void => {
      set((state) => {
        if (!shapeIds || shapeIds.length === 0) {
          return state;
        }

        const idSet = new Set(shapeIds);
        let hasChanges = false;

        const nextShapes = state.shapes.map((shape) => {
          if (!idSet.has(shape.id)) {
            return shape;
          }
          hasChanges = true;
          return applyStyleToShape(shape, style);
        });

        if (!hasChanges) {
          return state;
        }

        return {
          past: isLivePreview ? state.past : [...state.past, state.shapes],
          future: isLivePreview ? state.future : [],
          shapes: nextShapes,
        };
      });
    },

    updateShapeStyle: (
      shapeId: string,
      style: Partial<ShapeStyle>,
      isLivePreview = false
    ): void => {
      get().updateMultipleShapesStyle([shapeId], style, isLivePreview);
    },

    resetCanvas: (): void => {
      set({
        shapes: [],
        selectedShapeIds: [],
        editingGroupId: null,
        remoteCursors: {},
        remoteSelections: {},
        remoteShapeLocks: {},
        remoteShapeTransforms: {},
        past: [],
        future: [],
      });
    },

    deleteShape: (shapeId: string): void => {
      set((state) => {
        const deletedIds = getAllDescendantIds(shapeId, state.shapes);
        return {
          past: [
            ...state.past,
            state.shapes,
          ],
          future: [],
          shapes: state.shapes
            .filter((shape) => !deletedIds.has(shape.id))
            .map((shape) => {
              if (shape.type === "connector" && shape.connector) {
                const updatedConnector = { ...shape.connector };
                let modified = false;
                if (updatedConnector.sourceShapeId && deletedIds.has(updatedConnector.sourceShapeId)) {
                  updatedConnector.sourceShapeId = null;
                  updatedConnector.sourceAnchor = null;
                  modified = true;
                }
                if (updatedConnector.targetShapeId && deletedIds.has(updatedConnector.targetShapeId)) {
                  updatedConnector.targetShapeId = null;
                  updatedConnector.targetAnchor = null;
                  modified = true;
                }
                if (modified) {
                  return { ...shape, connector: updatedConnector };
                }
              }
              return shape;
            }),
          selectedShapeIds: state.selectedShapeIds.filter((id) => !deletedIds.has(id)),
          editingGroupId: deletedIds.has(state.editingGroupId ?? "") ? null : state.editingGroupId,
        };
      });
    },

    selectShape: (shapeId: string): void => {
      set({
        selectedShapeIds: [shapeId],
      });
    },

    selectAllShapes: (): void => {
      set((state) => ({
        selectedShapeIds: state.shapes.map(
          (shape) => shape.id,
        ),
      }));
    },

    setSelectedShapeIds: (
      shapeIds: string[],
    ): void => {
      set({
        selectedShapeIds: shapeIds,
      });
    },

    toggleShapeSelection: (
      shapeId: string,
    ): void => {
      set((state) => {
        const isSelected =
          state.selectedShapeIds.includes(
            shapeId,
          );

        if (isSelected) {
          return {
            selectedShapeIds:
              state.selectedShapeIds.filter(
                (id) => id !== shapeId,
              ),
          };
        }

        return {
          selectedShapeIds: [
            ...state.selectedShapeIds,
            shapeId,
          ],
        };
      });
    },

    clearSelection: (): void => {
      set({
        selectedShapeIds: [],
      });
    },

    setZoom: (zoom: number): void => {
      set({
        zoom,
      });
    },

    setPan: (
      x: number,
      y: number,
    ): void => {
      set({
        pan: {
          x,
          y,
        },
      });
    },

    applyRemoteShapeCreated: (shape: Shape): void => {
      set((state) => {
        if (state.shapes.some((s) => s.id === shape.id)) {
          return state;
        }
        return {
          shapes: [...state.shapes, shape],
        };
      });
    },

    applyRemoteShapeUpdated: (shape: Shape): void => {
      set((state) => ({
        shapes: state.shapes.map((s) => (s.id === shape.id ? shape : s)),
      }));
    },

    applyRemoteShapeDeleted: (shapeId: string): void => {
      set((state) => {
        const deletedIds = getAllDescendantIds(shapeId, state.shapes);
        const nextTransforms = { ...state.remoteShapeTransforms };
        const nextLocks = { ...state.remoteShapeLocks };
        for (const id of deletedIds) {
          delete nextTransforms[id];
          delete nextLocks[id];
        }

        return {
          shapes: state.shapes
            .filter((s) => !deletedIds.has(s.id))
            .map((shape) => {
              if (shape.type === "connector" && shape.connector) {
                const updatedConnector = { ...shape.connector };
                let modified = false;
                if (updatedConnector.sourceShapeId && deletedIds.has(updatedConnector.sourceShapeId)) {
                  updatedConnector.sourceShapeId = null;
                  updatedConnector.sourceAnchor = null;
                  modified = true;
                }
                if (updatedConnector.targetShapeId && deletedIds.has(updatedConnector.targetShapeId)) {
                  updatedConnector.targetShapeId = null;
                  updatedConnector.targetAnchor = null;
                  modified = true;
                }
                if (modified) {
                  return { ...shape, connector: updatedConnector };
                }
              }
              return shape;
            }),
          selectedShapeIds: state.selectedShapeIds.filter((id) => !deletedIds.has(id)),
          editingGroupId: deletedIds.has(state.editingGroupId ?? "") ? null : state.editingGroupId,
          remoteShapeTransforms: nextTransforms,
          remoteShapeLocks: nextLocks,
        };
      });
    },

    setRemoteCursor: (cursor: RemoteCursor): void => {
      set((state) => ({
        remoteCursors: {
          ...state.remoteCursors,
          [cursor.userId]: cursor,
        },
      }));
    },

    removeRemoteCursor: (userId: string): void => {
      set((state) => {
        if (!state.remoteCursors[userId]) {
          return state;
        }
        const nextCursors = { ...state.remoteCursors };
        delete nextCursors[userId];
        return {
          remoteCursors: nextCursors,
        };
      });
    },

    clearRemoteCursors: (): void => {
      set({
        remoteCursors: {},
      });
    },

    setRemoteSelection: (selection: RemoteSelection): void => {
      set((state) => ({
        remoteSelections: {
          ...state.remoteSelections,
          [selection.userId]: selection,
        },
      }));
    },

    removeRemoteSelection: (userId: string): void => {
      set((state) => {
        if (!state.remoteSelections[userId]) {
          return state;
        }
        const nextSelections = { ...state.remoteSelections };
        delete nextSelections[userId];
        return {
          remoteSelections: nextSelections,
        };
      });
    },

    clearRemoteSelections: (): void => {
      set({
        remoteSelections: {},
      });
    },

    setRemoteShapeLock: (lock: RemoteShapeLock): void => {
      set((state) => ({
        remoteShapeLocks: {
          ...state.remoteShapeLocks,
          [lock.shapeId]: lock,
        },
      }));
    },

    removeRemoteShapeLock: (shapeId: string): void => {
      set((state) => {
        const nextLocks = { ...state.remoteShapeLocks };
        delete nextLocks[shapeId];
        return {
          remoteShapeLocks: nextLocks,
        };
      });
    },

    clearRemoteShapeLocks: (): void => {
      set({
        remoteShapeLocks: {},
      });
    },

    setRemoteShapeTransform: (transform: RemoteShapeTransform): void => {
      set((state) => ({
        remoteShapeTransforms: {
          ...state.remoteShapeTransforms,
          [transform.shapeId]: transform,
        },
      }));
    },

    removeRemoteShapeTransform: (shapeId: string): void => {
      set((state) => {
        if (!state.remoteShapeTransforms[shapeId]) {
          return state;
        }
        const nextTransforms = { ...state.remoteShapeTransforms };
        delete nextTransforms[shapeId];
        return {
          remoteShapeTransforms: nextTransforms,
        };
      });
    },

    clearRemoteShapeTransforms: (): void => {
      set({
        remoteShapeTransforms: {},
      });
    },

    enterGroup: (groupId: string): void => {
      set({
        editingGroupId: groupId,
      });
    },

    exitGroup: (): void => {
      set({
        editingGroupId: null,
      });
    },

    groupShapes: (shapeIds: string[], newGroupId?: string): Shape | null => {
      const state = get();
      if (shapeIds.length < 2) {
        return null;
      }

      const shapesToGroup = state.shapes.filter((s) => shapeIds.includes(s.id));
      if (shapesToGroup.length < 2) {
        return null;
      }

      // Invariant: all grouped shapes must share the same parentId
      const firstParentId = shapesToGroup[0].parentId ?? null;
      const allShareParent = shapesToGroup.every(
        (s) => (s.parentId ?? null) === firstParentId
      );
      if (!allShareParent) {
        return null;
      }

      // Compute bounding box
      const bbox = computeGroupBoundingBox(shapesToGroup);
      const maxZIndex = Math.max(...shapesToGroup.map((s) => s.zIndex ?? 0), 0);

      const groupId =
        newGroupId ??
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `group_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`);

      const groupShape: Shape = {
        id: groupId,
        type: "group",
        x: bbox.x,
        y: bbox.y,
        width: bbox.width,
        height: bbox.height,
        rotation: 0,
        opacity: 1,
        zIndex: maxZIndex + 1,
        parentId: firstParentId,
        version: 1,
      };

      // Convert child world/parent coordinates to local coordinates of the new group
      const updatedChildrenMap = new Map<string, Shape>();
      for (const child of shapesToGroup) {
        updatedChildrenMap.set(child.id, {
          ...child,
          x: child.x - bbox.x,
          y: child.y - bbox.y,
          parentId: groupId,
          version: (child.version ?? 1) + 1,
        });
      }

      set((curr) => ({
        past: [...curr.past, curr.shapes],
        future: [],
        shapes: [
          ...curr.shapes.map((s) => updatedChildrenMap.get(s.id) ?? s),
          groupShape,
        ],
        selectedShapeIds: [groupId],
      }));

      return groupShape;
    },

    ungroupShapes: (groupId: string): void => {
      const state = get();
      const group = state.shapes.find((s) => s.id === groupId && s.type === "group");
      if (!group) {
        return;
      }

      const directChildren = state.shapes.filter((s) => s.parentId === groupId);
      const updatedChildrenMap = new Map<string, Shape>();

      for (const child of directChildren) {
        const worldPoint = localToWorld({ x: child.x, y: child.y }, group);
        updatedChildrenMap.set(child.id, {
          ...child,
          x: worldPoint.x,
          y: worldPoint.y,
          rotation: ((child.rotation ?? 0) + (group.rotation ?? 0)) % 360,
          parentId: group.parentId ?? null,
          version: (child.version ?? 1) + 1,
        });
      }

      set((curr) => ({
        past: [...curr.past, curr.shapes],
        future: [],
        shapes: curr.shapes
          .filter((s) => s.id !== groupId)
          .map((s) => updatedChildrenMap.get(s.id) ?? s),
        selectedShapeIds: directChildren.map((c) => c.id),
        editingGroupId: curr.editingGroupId === groupId ? null : curr.editingGroupId,
      }));
    },

    applyRemoteShapeGrouped: (group: Shape, children: Shape[]): void => {
      set((state) => {
        const childrenMap = new Map<string, Shape>(children.map((c) => [c.id, c]));
        const existingWithoutGroup = state.shapes.filter((s) => s.id !== group.id);
        const nextShapes = existingWithoutGroup.map((s) => childrenMap.get(s.id) ?? s);
        nextShapes.push(group);

        return {
          shapes: nextShapes,
        };
      });
    },

    applyRemoteShapeUngrouped: (groupId: string, children: Shape[]): void => {
      set((state) => {
        const childrenMap = new Map<string, Shape>(children.map((c) => [c.id, c]));
        return {
          shapes: state.shapes
            .filter((s) => s.id !== groupId)
            .map((s) => childrenMap.get(s.id) ?? s),
          editingGroupId: state.editingGroupId === groupId ? null : state.editingGroupId,
        };
      });
    },

    undo: (): void => {
      set((state) => {
        if (state.past.length === 0) {
          return state;
        }

        const previousShapes =
          state.past[
          state.past.length - 1
          ];

        return {
          past: state.past.slice(0, -1),
          future: [
            state.shapes,
            ...state.future,
          ],
          shapes: previousShapes,
          selectedShapeIds: [],
        };
      });
    },

    replaceShapesFromRecovery: (shapes: Shape[]): void => {
      set({
        shapes,
        remoteShapeTransforms: {},
      });
    },

    redo: (): void => {
      set((state) => {
        if (state.future.length === 0) {
          return state;
        }

        const nextShapes =
          state.future[0];

        return {
          past: [
            ...state.past,
            state.shapes,
          ],
          future: state.future.slice(1),
          shapes: nextShapes,
          selectedShapeIds: [],
        };
      });
    },

    canUndo: (): boolean => {
      return get().past.length > 0;
    },

    canRedo: (): boolean => {
      return get().future.length > 0;
    },
  }),
);