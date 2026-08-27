import { create } from "zustand";

import {
  CANVAS_TOOLS,
  type CanvasTool,
} from "../constants";
import type { Shape, TextShape } from "../types";
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

  undo: () => void;

  redo: () => void;

  canUndo: () => boolean;

  canRedo: () => boolean;
};

export const useCanvasStore = create<CanvasStore>(
  (set, get) => ({
    activeTool: CANVAS_TOOLS.SELECT,

    shapes: [],

    selectedShapeIds: [],

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

    resetCanvas: (): void => {
      set({
        shapes: [],
        selectedShapeIds: [],
        remoteCursors: {},
        remoteSelections: {},
        remoteShapeLocks: {},
        remoteShapeTransforms: {},
        past: [],
        future: [],
      });
    },

    deleteShape: (shapeId: string): void => {
      set((state) => ({
        past: [
          ...state.past,
          state.shapes,
        ],
        future: [],
        shapes: state.shapes.filter(
          (shape) => shape.id !== shapeId,
        ),
        selectedShapeIds:
          state.selectedShapeIds.filter(
            (id) => id !== shapeId,
          ),
      }));
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
        const nextTransforms = { ...state.remoteShapeTransforms };
        delete nextTransforms[shapeId];
        const nextLocks = { ...state.remoteShapeLocks };
        delete nextLocks[shapeId];

        return {
          shapes: state.shapes.filter((s) => s.id !== shapeId),
          selectedShapeIds: state.selectedShapeIds.filter((id) => id !== shapeId),
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