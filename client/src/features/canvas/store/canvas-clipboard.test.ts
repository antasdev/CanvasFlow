import { describe, it, expect, beforeEach } from "vitest";

import type { RectangleShape, GroupShape } from "../types";

import { useCanvasStore } from "./canvas.store";

function createRect(id: string, x: number, y: number, parentId: string | null = null): RectangleShape {
  return {
    id,
    type: "rectangle",
    x,
    y,
    width: 100,
    height: 80,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    fill: "#3b82f6",
    stroke: "#1d4ed8",
    strokeWidth: 2,
    parentId,
  };
}

function createGroup(id: string, x: number, y: number): GroupShape {
  return {
    id,
    type: "group",
    x,
    y,
    width: 200,
    height: 200,
    rotation: 0,
    opacity: 1,
    zIndex: 2,
  };
}

describe("canvas.store - clipboard & paste actions", () => {
  beforeEach(() => {
    useCanvasStore.setState({
      shapes: [],
      selectedShapeIds: [],
      past: [],
      future: [],
    });
  });

  it("pasteClonedShapes pushes exactly one snapshot to past and selects root IDs", () => {
    const original = createRect("r1", 10, 10);
    useCanvasStore.setState({ shapes: [original], selectedShapeIds: ["r1"] });

    const cloned1 = createRect("cloned_r1", 30, 30);
    const cloned2 = createRect("cloned_r2", 50, 50);

    useCanvasStore.getState().pasteClonedShapes([cloned1, cloned2], ["cloned_r1", "cloned_r2"]);

    const state = useCanvasStore.getState();
    expect(state.shapes).toHaveLength(3);
    expect(state.past).toHaveLength(1);
    expect(state.past[0]).toHaveLength(1);
    expect(state.past[0][0].id).toBe("r1");
    expect(state.future).toHaveLength(0);
    expect(state.selectedShapeIds).toEqual(["cloned_r1", "cloned_r2"]);
  });

  it("single undo removes all pasted shapes at once", () => {
    const original = createRect("r1", 10, 10);
    useCanvasStore.setState({ shapes: [original] });

    const cloned = createRect("cloned_1", 30, 30);
    useCanvasStore.getState().pasteClonedShapes([cloned], ["cloned_1"]);

    expect(useCanvasStore.getState().shapes).toHaveLength(2);

    // 1 undo restores pre-paste state
    useCanvasStore.getState().undo();
    const state = useCanvasStore.getState();
    expect(state.shapes).toHaveLength(1);
    expect(state.shapes[0].id).toBe("r1");
    expect(state.future).toHaveLength(1);

    // 1 redo restores pasted shapes
    useCanvasStore.getState().redo();
    expect(useCanvasStore.getState().shapes).toHaveLength(2);
  });

  it("reconciles temporary optimistic IDs with authoritative server IDs", () => {
    const tempRect = createRect("temp_1", 30, 30);
    useCanvasStore.setState({
      shapes: [tempRect],
      selectedShapeIds: ["temp_1"],
    });

    const authoritativeShape = {
      ...tempRect,
      id: "auth_mongo_id_1",
      version: 1,
    };

    useCanvasStore.getState().reconcileAuthoritativePastedShapes(
      { temp_1: "auth_mongo_id_1" },
      [authoritativeShape]
    );

    const state = useCanvasStore.getState();
    expect(state.shapes[0].id).toBe("auth_mongo_id_1");
    expect(state.selectedShapeIds).toEqual(["auth_mongo_id_1"]);
  });

  it("rollbackOptimisticPaste cleans up temporary shapes and restores past", () => {
    const original = createRect("r1", 10, 10);
    useCanvasStore.setState({ shapes: [original] });

    const tempShape = createRect("temp_1", 30, 30);
    useCanvasStore.getState().pasteClonedShapes([tempShape], ["temp_1"]);
    expect(useCanvasStore.getState().shapes).toHaveLength(2);
    expect(useCanvasStore.getState().past).toHaveLength(1);

    useCanvasStore.getState().rollbackOptimisticPaste(["temp_1"]);
    const state = useCanvasStore.getState();
    expect(state.shapes).toHaveLength(1);
    expect(state.shapes[0].id).toBe("r1");
    expect(state.past).toHaveLength(0);
  });

  it("applyRemoteShapesPasted creates zero undo history pollution", () => {
    const local1 = createRect("r1", 10, 10);
    useCanvasStore.setState({
      shapes: [local1],
      past: [],
      future: [],
    });

    const remoteShape = createRect("remote_1", 200, 200);
    useCanvasStore.getState().applyRemoteShapesPasted([remoteShape]);

    const state = useCanvasStore.getState();
    expect(state.shapes).toHaveLength(2);
    expect(state.past).toHaveLength(0); // Untouched!
    expect(state.future).toHaveLength(0); // Untouched!
  });

  it("nested group paste preserves hierarchy and selects root group ID", () => {
    const group = createGroup("new_g1", 50, 50);
    const child = createRect("new_c1", 10, 10, "new_g1");

    useCanvasStore.getState().pasteClonedShapes([group, child], ["new_g1"]);

    const state = useCanvasStore.getState();
    expect(state.shapes).toHaveLength(2);
    expect(state.selectedShapeIds).toEqual(["new_g1"]); // Root group selected, not child
    expect(state.shapes.find((s) => s.id === "new_c1")?.parentId).toBe("new_g1");
  });
});
