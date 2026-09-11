import { describe, it, expect, beforeEach } from "vitest";

import type { RemoteShapeLock, RemoteShapeTransform } from "@/services/socket";

import { useCanvasStore } from "./canvas.store";
import {
  selectActiveTool,
  selectZoom,
  selectPan,
  selectCanUndo,
  selectCanRedo,
  selectIsShapeSelected,
  selectRemoteShapeLock,
  selectRemoteShapeTransform,
  selectShapeCount,
  selectSelectedShapeCount,
  selectHasSelection,
  selectSmartGuides,
  selectShapeById,
} from "./canvas.selectors";
import type { RectangleShape } from "../types";

function createMockShape(id: string, overrides: Partial<RectangleShape> = {}): RectangleShape {
  return {
    id,
    type: "rectangle",
    x: 10,
    y: 20,
    width: 100,
    height: 100,
    rotation: 0,
    stroke: "#000000",
    strokeWidth: 2,
    fill: "#ffffff",
    opacity: 1,
    zIndex: 1,
    ...overrides,
  };
}

describe("Slice 53 — Canvas Selectors & Equality Guards", () => {
  beforeEach(() => {
    // Reset canvas store to known default clean state
    useCanvasStore.setState({
      shapes: [],
      selectedShapeIds: [],
      editingGroupId: null,
      activeTool: "select",
      zoom: 1,
      pan: { x: 0, y: 0 },
      past: [],
      future: [],
      remoteCursors: {},
      remoteSelections: {},
      remoteShapeLocks: {},
      remoteShapeTransforms: {},
      smartGuides: [],
    });
  });

  describe("Primitive & Basic Selectors", () => {
    it("selectActiveTool returns current active tool", () => {
      expect(selectActiveTool(useCanvasStore.getState())).toBe("select");
      useCanvasStore.getState().setActiveTool("rectangle");
      expect(selectActiveTool(useCanvasStore.getState())).toBe("rectangle");
    });

    it("selectZoom returns current zoom level", () => {
      expect(selectZoom(useCanvasStore.getState())).toBe(1);
      useCanvasStore.getState().setZoom(1.5);
      expect(selectZoom(useCanvasStore.getState())).toBe(1.5);
    });

    it("selectPan returns current pan coordinates", () => {
      expect(selectPan(useCanvasStore.getState())).toEqual({ x: 0, y: 0 });
      useCanvasStore.getState().setPan(150, -80);
      expect(selectPan(useCanvasStore.getState())).toEqual({ x: 150, y: -80 });
    });

    it("selectSmartGuides returns current smart guide array", () => {
      expect(selectSmartGuides(useCanvasStore.getState())).toEqual([]);
    });
  });

  describe("History Selectors", () => {
    it("selectCanUndo returns false when past stack is empty", () => {
      expect(selectCanUndo(useCanvasStore.getState())).toBe(false);
    });

    it("selectCanUndo returns true when past stack has snapshots", () => {
      useCanvasStore.setState({
        past: [[]],
      });
      expect(selectCanUndo(useCanvasStore.getState())).toBe(true);
    });

    it("selectCanRedo returns false when future stack is empty", () => {
      expect(selectCanRedo(useCanvasStore.getState())).toBe(false);
    });

    it("selectCanRedo returns true when future stack has snapshots", () => {
      useCanvasStore.setState({
        future: [[]],
      });
      expect(selectCanRedo(useCanvasStore.getState())).toBe(true);
    });
  });

  describe("Shape Selection Selectors (selectIsShapeSelected)", () => {
    it("returns true only when specific shape is selected", () => {
      const isASelected = selectIsShapeSelected("shape-A");
      const isBSelected = selectIsShapeSelected("shape-B");

      useCanvasStore.setState({
        selectedShapeIds: ["shape-A"],
      });

      const state1 = useCanvasStore.getState();
      expect(isASelected(state1)).toBe(true);
      expect(isBSelected(state1)).toBe(false);

      // Now add shape-C to selection: shape-B remains false, shape-A remains true
      useCanvasStore.setState({
        selectedShapeIds: ["shape-A", "shape-C"],
      });

      const state2 = useCanvasStore.getState();
      expect(isASelected(state2)).toBe(true);
      expect(isBSelected(state2)).toBe(false);
    });

    it("preserves boolean equality when unrelated shapes are selected", () => {
      const isUnrelatedSelected = selectIsShapeSelected("unrelated-shape");

      useCanvasStore.setState({ selectedShapeIds: [] });
      const val1 = isUnrelatedSelected(useCanvasStore.getState());

      useCanvasStore.setState({ selectedShapeIds: ["shape-1", "shape-2"] });
      const val2 = isUnrelatedSelected(useCanvasStore.getState());

      expect(val1).toBe(false);
      expect(val2).toBe(false);
      expect(val1).toBe(val2);
    });
  });

  describe("Remote Collaboration Selectors", () => {
    it("selectRemoteShapeLock isolates lock by shapeId", () => {
      const lockA: RemoteShapeLock = {
        userId: "user-1",
        shapeId: "shape-1",
        boardId: "board-1",
        fullName: "User One",
        color: "#3b82f6",
      };

      useCanvasStore.setState({
        remoteShapeLocks: {
          "shape-1": lockA,
        },
      });

      const selector1 = selectRemoteShapeLock("shape-1");
      const selector2 = selectRemoteShapeLock("shape-2");

      expect(selector1(useCanvasStore.getState())).toBe(lockA);
      expect(selector2(useCanvasStore.getState())).toBeUndefined();
    });

    it("selectRemoteShapeTransform isolates transform by shapeId", () => {
      const transformA: RemoteShapeTransform = {
        userId: "user-1",
        shapeId: "shape-1",
        boardId: "board-1",
        fullName: "User One",
        color: "#3b82f6",
        x: 100,
        y: 200,
        width: 150,
        height: 80,
        rotation: 0,
        lastUpdatedAt: Date.now(),
      };

      useCanvasStore.setState({
        remoteShapeTransforms: {
          "shape-1": transformA,
        },
      });

      const selector1 = selectRemoteShapeTransform("shape-1");
      const selector2 = selectRemoteShapeTransform("shape-2");

      expect(selector1(useCanvasStore.getState())).toBe(transformA);
      expect(selector2(useCanvasStore.getState())).toBeUndefined();
    });
  });

  describe("Aggregate & Lookup Selectors", () => {
    it("selectShapeCount returns primitive count", () => {
      const shapeA = createMockShape("s-1");
      const shapeB = createMockShape("s-2");

      useCanvasStore.setState({ shapes: [shapeA, shapeB] });
      expect(selectShapeCount(useCanvasStore.getState())).toBe(2);

      // Updating a shape position without changing count keeps primitive equal
      useCanvasStore.setState({
        shapes: [{ ...shapeA, x: 999 }, shapeB],
      });
      expect(selectShapeCount(useCanvasStore.getState())).toBe(2);
    });

    it("selectSelectedShapeCount returns selected count", () => {
      useCanvasStore.setState({ selectedShapeIds: ["s-1", "s-2", "s-3"] });
      expect(selectSelectedShapeCount(useCanvasStore.getState())).toBe(3);
    });

    it("selectHasSelection returns boolean for whether selection exists", () => {
      useCanvasStore.setState({ selectedShapeIds: [] });
      expect(selectHasSelection(useCanvasStore.getState())).toBe(false);

      useCanvasStore.setState({ selectedShapeIds: ["s-1"] });
      expect(selectHasSelection(useCanvasStore.getState())).toBe(true);
    });

    it("selectShapeById finds shape by ID or returns undefined", () => {
      const shapeA = createMockShape("shape-alpha");
      useCanvasStore.setState({ shapes: [shapeA] });

      const selectAlpha = selectShapeById("shape-alpha");
      const selectBeta = selectShapeById("shape-beta");
      const selectNull = selectShapeById(null);
      const selectUndefined = selectShapeById(undefined);

      expect(selectAlpha(useCanvasStore.getState())).toBe(shapeA);
      expect(selectBeta(useCanvasStore.getState())).toBeUndefined();
      expect(selectNull(useCanvasStore.getState())).toBeUndefined();
      expect(selectUndefined(useCanvasStore.getState())).toBeUndefined();
    });
  });

  describe("Store Action Equality Guards", () => {
    it("setPan does not trigger state change when coordinates are unchanged", () => {
      useCanvasStore.getState().setPan(100, 200);
      const stateBefore = useCanvasStore.getState();

      // Setting same pan
      useCanvasStore.getState().setPan(100, 200);
      const stateAfter = useCanvasStore.getState();

      // Object identity of root state must be preserved
      expect(stateAfter).toBe(stateBefore);
    });

    it("setZoom does not trigger state change when zoom is unchanged", () => {
      useCanvasStore.getState().setZoom(2.0);
      const stateBefore = useCanvasStore.getState();

      // Setting same zoom
      useCanvasStore.getState().setZoom(2.0);
      const stateAfter = useCanvasStore.getState();

      expect(stateAfter).toBe(stateBefore);
    });

    it("clearSelection does not trigger state change when already empty", () => {
      useCanvasStore.setState({ selectedShapeIds: [] });
      const stateBefore = useCanvasStore.getState();

      useCanvasStore.getState().clearSelection();
      const stateAfter = useCanvasStore.getState();

      expect(stateAfter).toBe(stateBefore);
    });

    it("selectShape does not trigger state change when already the only selected shape", () => {
      useCanvasStore.setState({ selectedShapeIds: ["shape-target"] });
      const stateBefore = useCanvasStore.getState();

      useCanvasStore.getState().selectShape("shape-target");
      const stateAfter = useCanvasStore.getState();

      expect(stateAfter).toBe(stateBefore);
    });

    it("setSelectedShapeIds guards against identical array content", () => {
      useCanvasStore.setState({ selectedShapeIds: ["shape-1", "shape-2"] });
      const stateBefore = useCanvasStore.getState();

      // Set same array content
      useCanvasStore.getState().setSelectedShapeIds(["shape-1", "shape-2"]);
      const stateAfter = useCanvasStore.getState();

      expect(stateAfter).toBe(stateBefore);
    });

    it("selectAllShapes does not trigger state change when all shapes are already selected", () => {
      const s1 = createMockShape("s-1");
      const s2 = createMockShape("s-2");
      useCanvasStore.setState({
        shapes: [s1, s2],
        selectedShapeIds: ["s-1", "s-2"],
      });
      const stateBefore = useCanvasStore.getState();

      useCanvasStore.getState().selectAllShapes();
      const stateAfter = useCanvasStore.getState();

      expect(stateAfter).toBe(stateBefore);
    });
  });
});
