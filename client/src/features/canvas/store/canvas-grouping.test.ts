import { beforeEach, describe, expect, it } from "vitest";
import { useCanvasStore } from "./canvas.store";
import type { RectangleShape, GroupShape } from "../types";

describe("canvas store grouping & ungrouping", () => {
  const rect1: RectangleShape = {
    id: "r1",
    type: "rectangle",
    x: 100,
    y: 100,
    width: 50,
    height: 50,
    rotation: 0,
    zIndex: 1,
    opacity: 1,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
  };

  const rect2: RectangleShape = {
    id: "r2",
    type: "rectangle",
    x: 200,
    y: 200,
    width: 60,
    height: 40,
    rotation: 0,
    zIndex: 2,
    opacity: 1,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
  };

  beforeEach(() => {
    useCanvasStore.getState().resetCanvas();
    useCanvasStore.getState().addShape(rect1);
    useCanvasStore.getState().addShape(rect2);
    // Clear initial history from addShape setup
    useCanvasStore.setState({ past: [], future: [] });
  });

  describe("groupShapes", () => {
    it("groups shapes, converts child coordinates to local space, and records exactly one undo snapshot", () => {
      const pastBefore = useCanvasStore.getState().past.length;
      const group = useCanvasStore.getState().groupShapes(["r1", "r2"], "group-1");

      expect(group).not.toBeNull();
      expect(group!.id).toBe("group-1");
      expect(group!.type).toBe("group");
      expect(group!.x).toBe(100);
      expect(group!.y).toBe(100);
      expect(group!.width).toBe(160); // 200 + 60 - 100
      expect(group!.height).toBe(140); // 200 + 40 - 100

      // Verify children in store
      const shapes = useCanvasStore.getState().shapes;
      const child1 = shapes.find((s) => s.id === "r1")!;
      const child2 = shapes.find((s) => s.id === "r2")!;

      expect(child1.parentId).toBe("group-1");
      expect(child1.x).toBe(0); // 100 - 100
      expect(child1.y).toBe(0); // 100 - 100

      expect(child2.parentId).toBe("group-1");
      expect(child2.x).toBe(100); // 200 - 100
      expect(child2.y).toBe(100); // 200 - 100

      // Exactly ONE undo snapshot recorded
      expect(useCanvasStore.getState().past.length).toBe(pastBefore + 1);
      // Group selected
      expect(useCanvasStore.getState().selectedShapeIds).toEqual(["group-1"]);
    });

    it("rejects grouping if fewer than 2 shapes are selected", () => {
      const group = useCanvasStore.getState().groupShapes(["r1"]);
      expect(group).toBeNull();
    });

    it("rejects grouping if shapes have different parent containers", () => {
      // Put r1 inside g1
      useCanvasStore.setState((state) => ({
        shapes: state.shapes.map((s) => (s.id === "r1" ? { ...s, parentId: "g1" } : s)),
      }));

      const group = useCanvasStore.getState().groupShapes(["r1", "r2"]);
      expect(group).toBeNull();
    });
  });

  describe("ungroupShapes", () => {
    it("restores children to world coordinates, removes group, and records exactly one undo snapshot", () => {
      const group = useCanvasStore.getState().groupShapes(["r1", "r2"], "group-1")!;
      const pastBefore = useCanvasStore.getState().past.length;

      useCanvasStore.getState().ungroupShapes(group.id);

      const shapes = useCanvasStore.getState().shapes;
      expect(shapes.find((s) => s.id === "group-1")).toBeUndefined();

      const restored1 = shapes.find((s) => s.id === "r1")!;
      const restored2 = shapes.find((s) => s.id === "r2")!;

      expect(restored1.parentId).toBeFalsy();
      expect(restored1.x).toBe(100);
      expect(restored1.y).toBe(100);

      expect(restored2.parentId).toBeFalsy();
      expect(restored2.x).toBe(200);
      expect(restored2.y).toBe(200);

      // Exactly ONE undo snapshot recorded
      expect(useCanvasStore.getState().past.length).toBe(pastBefore + 1);
      // Children selected
      expect(useCanvasStore.getState().selectedShapeIds.sort()).toEqual(["r1", "r2"].sort());
    });

    it("clears editingGroupId if ungrouping currently edited group", () => {
      const group = useCanvasStore.getState().groupShapes(["r1", "r2"], "group-1")!;
      useCanvasStore.getState().enterGroup(group.id);
      expect(useCanvasStore.getState().editingGroupId).toBe("group-1");

      useCanvasStore.getState().ungroupShapes(group.id);
      expect(useCanvasStore.getState().editingGroupId).toBeNull();
    });
  });

  describe("enterGroup and exitGroup", () => {
    it("manages editingGroupId and clears on exit", () => {
      useCanvasStore.getState().enterGroup("g-test");
      expect(useCanvasStore.getState().editingGroupId).toBe("g-test");

      useCanvasStore.getState().exitGroup();
      expect(useCanvasStore.getState().editingGroupId).toBeNull();
    });
  });

  describe("single-step atomic undo / redo", () => {
    it("single undo restores pre-group state and single redo restores grouped state", () => {
      useCanvasStore.getState().groupShapes(["r1", "r2"], "group-1");
      expect(useCanvasStore.getState().shapes.find((s) => s.id === "group-1")).toBeDefined();

      // Undo grouping in exactly 1 step
      useCanvasStore.getState().undo();
      expect(useCanvasStore.getState().shapes.find((s) => s.id === "group-1")).toBeUndefined();
      const r1 = useCanvasStore.getState().shapes.find((s) => s.id === "r1")!;
      expect(r1.parentId).toBeUndefined();
      expect(r1.x).toBe(100);
      expect(r1.y).toBe(100);

      // Redo grouping in exactly 1 step
      useCanvasStore.getState().redo();
      expect(useCanvasStore.getState().shapes.find((s) => s.id === "group-1")).toBeDefined();
      const r1Redone = useCanvasStore.getState().shapes.find((s) => s.id === "r1")!;
      expect(r1Redone.parentId).toBe("group-1");
      expect(r1Redone.x).toBe(0);
    });

    it("single undo restores group after ungrouping and single redo re-ungroups", () => {
      const group = useCanvasStore.getState().groupShapes(["r1", "r2"], "group-1")!;
      useCanvasStore.getState().ungroupShapes(group.id);
      expect(useCanvasStore.getState().shapes.find((s) => s.id === "group-1")).toBeUndefined();

      // Undo ungrouping in exactly 1 step
      useCanvasStore.getState().undo();
      expect(useCanvasStore.getState().shapes.find((s) => s.id === "group-1")).toBeDefined();
      const r1 = useCanvasStore.getState().shapes.find((s) => s.id === "r1")!;
      expect(r1.parentId).toBe("group-1");

      // Redo ungrouping in exactly 1 step
      useCanvasStore.getState().redo();
      expect(useCanvasStore.getState().shapes.find((s) => s.id === "group-1")).toBeUndefined();
      const r1Redone = useCanvasStore.getState().shapes.find((s) => s.id === "r1")!;
      expect(r1Redone.parentId).toBeFalsy();
    });
  });

  describe("zero undo pollution from remote events", () => {
    it("applyRemoteShapeGrouped does not modify past or future history stacks", () => {
      const pastLenBefore = useCanvasStore.getState().past.length;
      const futureLenBefore = useCanvasStore.getState().future.length;

      const remoteGroup: GroupShape = {
        id: "remote-group",
        type: "group",
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        rotation: 0,
        zIndex: 3,
        opacity: 1,
      };

      const updatedChild: RectangleShape = {
        ...rect1,
        parentId: "remote-group",
        x: 10,
        y: 10,
      };

      useCanvasStore.getState().applyRemoteShapeGrouped(remoteGroup, [updatedChild]);

      expect(useCanvasStore.getState().past.length).toBe(pastLenBefore);
      expect(useCanvasStore.getState().future.length).toBe(futureLenBefore);
      expect(useCanvasStore.getState().shapes.find((s) => s.id === "remote-group")).toBeDefined();
    });

    it("applyRemoteShapeUngrouped does not modify past or future history stacks", () => {
      const pastLenBefore = useCanvasStore.getState().past.length;
      const futureLenBefore = useCanvasStore.getState().future.length;

      useCanvasStore.getState().applyRemoteShapeUngrouped("group-1", [rect1, rect2]);

      expect(useCanvasStore.getState().past.length).toBe(pastLenBefore);
      expect(useCanvasStore.getState().future.length).toBe(futureLenBefore);
    });
  });

  describe("cascade deletion", () => {
    it("deleteShape on a group deletes all descendant shapes", () => {
      useCanvasStore.getState().groupShapes(["r1", "r2"], "group-1");
      expect(useCanvasStore.getState().shapes).toHaveLength(3); // group + 2 children

      useCanvasStore.getState().deleteShape("group-1");

      const remaining = useCanvasStore.getState().shapes;
      expect(remaining).toHaveLength(0);
    });
  });
});
