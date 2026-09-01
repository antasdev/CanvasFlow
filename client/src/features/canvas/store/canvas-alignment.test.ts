import { beforeEach, describe, expect, it } from "vitest";

import type { RectangleShape, GroupShape } from "../types";

import { useCanvasStore } from "./canvas.store";

describe("canvas.store - alignment & distribution", () => {
  const r1: RectangleShape = {
    id: "r1",
    type: "rectangle",
    x: 100,
    y: 100,
    width: 60,
    height: 40,
    rotation: 0,
    zIndex: 1,
    opacity: 1,
    version: 1,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
  };

  const r2: RectangleShape = {
    id: "r2",
    type: "rectangle",
    x: 200,
    y: 150,
    width: 80,
    height: 50,
    rotation: 0,
    zIndex: 2,
    opacity: 1,
    version: 1,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
  };

  const r3: RectangleShape = {
    id: "r3",
    type: "rectangle",
    x: 350,
    y: 300,
    width: 50,
    height: 50,
    rotation: 0,
    zIndex: 3,
    opacity: 1,
    version: 1,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
  };

  beforeEach(() => {
    useCanvasStore.setState({
      shapes: [r1, r2, r3],
      selectedShapeIds: [],
      past: [],
      future: [],
      smartGuides: [],
    });
  });

  describe("alignShapes", () => {
    it("aligns shapes to left and creates exactly one undo snapshot", () => {
      const updated = useCanvasStore.getState().alignShapes(["r1", "r2", "r3"], "left");

      expect(updated.length).toBe(3);
      const state = useCanvasStore.getState();

      // Check updated positions
      expect(state.shapes.find((s) => s.id === "r1")?.x).toBe(100);
      expect(state.shapes.find((s) => s.id === "r2")?.x).toBe(100);
      expect(state.shapes.find((s) => s.id === "r3")?.x).toBe(100);

      // Exactly ONE undo snapshot
      expect(state.past.length).toBe(1);
      expect(state.future.length).toBe(0);

      // Undo restores all shapes simultaneously
      useCanvasStore.getState().undo();
      const afterUndo = useCanvasStore.getState();
      expect(afterUndo.shapes.find((s) => s.id === "r2")?.x).toBe(200);
      expect(afterUndo.shapes.find((s) => s.id === "r3")?.x).toBe(350);
      expect(afterUndo.past.length).toBe(0);
      expect(afterUndo.future.length).toBe(1);

      // Redo restores aligned positions
      useCanvasStore.getState().redo();
      const afterRedo = useCanvasStore.getState();
      expect(afterRedo.shapes.find((s) => s.id === "r2")?.x).toBe(100);
      expect(afterRedo.shapes.find((s) => s.id === "r3")?.x).toBe(100);
      expect(afterRedo.past.length).toBe(1);
      expect(afterRedo.future.length).toBe(0);
    });

    it("rejects alignment if < 2 shapes provided", () => {
      const updated = useCanvasStore.getState().alignShapes(["r1"], "left");
      expect(updated.length).toBe(0);
      expect(useCanvasStore.getState().past.length).toBe(0);
    });
  });

  describe("distributeShapes", () => {
    it("distributes shapes horizontally and creates exactly one undo snapshot", () => {
      // 3 rectangles along X:
      // r1: x=100, width=60 (right=160)
      // r2: x=200, width=80 (right=280)
      // r3: x=350, width=50 (right=400)
      // totalSpan = 300, sumWidths = 190, totalGap = 110, gap = 55
      const updated = useCanvasStore.getState().distributeShapes(["r1", "r2", "r3"], "horizontal");

      expect(updated.length).toBe(3);
      const state = useCanvasStore.getState();

      // First and last remain fixed
      expect(state.shapes.find((s) => s.id === "r1")?.x).toBe(100);
      expect(state.shapes.find((s) => s.id === "r3")?.x).toBe(350);

      // Middle shape r2 target is r1.right(160) + gap(55) = 215
      expect(state.shapes.find((s) => s.id === "r2")?.x).toBe(215);

      // Exactly ONE undo snapshot
      expect(state.past.length).toBe(1);

      useCanvasStore.getState().undo();
      expect(useCanvasStore.getState().shapes.find((s) => s.id === "r2")?.x).toBe(200);
    });

    it("rejects distribution if < 3 shapes provided", () => {
      const updated = useCanvasStore.getState().distributeShapes(["r1", "r2"], "horizontal");
      expect(updated.length).toBe(0);
      expect(useCanvasStore.getState().past.length).toBe(0);
    });
  });

  describe("Nested Group Alignment", () => {
    it("correctly aligns child shape inside group to world target", () => {
      const group: GroupShape = {
        id: "g1",
        type: "group",
        x: 200,
        y: 200,
        width: 300,
        height: 300,
        rotation: 0,
        zIndex: 10,
        opacity: 1,
      };

      const child: RectangleShape = {
        id: "c1",
        type: "rectangle",
        x: 50,
        y: 50,
        width: 50,
        height: 50,
        parentId: "g1",
        rotation: 0,
        zIndex: 11,
        opacity: 1,
        fill: "#ffffff",
        stroke: "#000000",
        strokeWidth: 1,
      };

      // World position of child: (250, 250)
      // r1 world position: (100, 100)
      useCanvasStore.setState({
        shapes: [r1, group, child],
        past: [],
        future: [],
      });

      // Align r1 and child to Left (minX is 100)
      // child target worldX is 100. Local x must be: 100 - group.x(200) = -100!
      useCanvasStore.getState().alignShapes(["r1", "c1"], "left");

      const state = useCanvasStore.getState();
      const updatedChild = state.shapes.find((s) => s.id === "c1");
      expect(updatedChild?.x).toBe(-100);
      expect(updatedChild?.parentId).toBe("g1");
    });
  });

  describe("Remote events & Undo Stack Isolation", () => {
    it("applyRemoteShapesAligned does not pollute local undo/redo history", () => {
      const alignedRemoteShapes: RectangleShape[] = [
        { ...r1, x: 50, version: 2 },
        { ...r2, x: 50, version: 2 },
      ];

      useCanvasStore.getState().applyRemoteShapesAligned(alignedRemoteShapes);

      const state = useCanvasStore.getState();
      expect(state.shapes.find((s) => s.id === "r1")?.x).toBe(50);
      expect(state.shapes.find((s) => s.id === "r2")?.x).toBe(50);
      // past and future must NOT change!
      expect(state.past.length).toBe(0);
      expect(state.future.length).toBe(0);
    });

    it("applyRemoteShapesDistributed does not pollute local undo/redo history", () => {
      const distributedRemoteShapes: RectangleShape[] = [
        { ...r1, x: 100, version: 2 },
        { ...r2, x: 220, version: 2 },
        { ...r3, x: 340, version: 2 },
      ];

      useCanvasStore.getState().applyRemoteShapesDistributed(distributedRemoteShapes);

      const state = useCanvasStore.getState();
      expect(state.shapes.find((s) => s.id === "r2")?.x).toBe(220);
      expect(state.past.length).toBe(0);
      expect(state.future.length).toBe(0);
    });
  });

  describe("Smart Guides State", () => {
    it("manages ephemeral smart guide state without affecting undo history", () => {
      expect(useCanvasStore.getState().smartGuides).toEqual([]);

      useCanvasStore.getState().setSmartGuides([
        {
          id: "g-test",
          orientation: "vertical",
          position: 100,
          start: 50,
          end: 250,
          kind: "edge",
        },
      ]);

      expect(useCanvasStore.getState().smartGuides.length).toBe(1);
      expect(useCanvasStore.getState().past.length).toBe(0);

      useCanvasStore.getState().clearSmartGuides();
      expect(useCanvasStore.getState().smartGuides).toEqual([]);
      expect(useCanvasStore.getState().past.length).toBe(0);
    });
  });
});
