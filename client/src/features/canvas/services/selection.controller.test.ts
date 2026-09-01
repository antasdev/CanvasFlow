import { describe, expect, it, beforeEach, vi } from "vitest";

import type { RectangleShape, GroupShape, Shape } from "../types";

import { SelectionController } from "./selection.controller";

describe("SelectionController", () => {
  const rect1: RectangleShape = {
    id: "rect-1",
    type: "rectangle",
    x: 100,
    y: 100,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
  };

  const rect2: RectangleShape = {
    id: "rect-2",
    type: "rectangle",
    x: 300,
    y: 100,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    zIndex: 2,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
  };

  const groupA: GroupShape = {
    id: "group-a",
    type: "group",
    x: 500,
    y: 100,
    width: 200,
    height: 200,
    rotation: 0,
    opacity: 1,
    zIndex: 3,
  };

  const childA: RectangleShape = {
    id: "child-a",
    type: "rectangle",
    parentId: "group-a",
    x: 510,
    y: 110,
    width: 50,
    height: 50,
    rotation: 0,
    opacity: 1,
    zIndex: 4,
    fill: "#ffffff",
    stroke: "#000000",
    strokeWidth: 1,
  };

  let shapes: Shape[];
  let selectedShapeIds: string[];
  let editingGroupId: string | null;
  let activeTool: string;
  let onActivityMock: (activity: string) => void;
  let clearSelectionMock: () => void;
  let exitGroupMock: () => void;

  const createController = () =>
    new SelectionController({
      getShapes: () => shapes,
      getSelectedShapeIds: () => selectedShapeIds,
      getEditingGroupId: () => editingGroupId,
      getActiveTool: () => activeTool,
      setSelectedShapeIds: (ids) => {
        selectedShapeIds = ids;
      },
      clearSelection: () => {
        selectedShapeIds = [];
        clearSelectionMock();
      },
      exitGroup: () => {
        editingGroupId = null;
        exitGroupMock();
      },
      onActivity: onActivityMock,
    });

  beforeEach(() => {
    shapes = [rect1, rect2, groupA, childA];
    selectedShapeIds = [];
    editingGroupId = null;
    activeTool = "select";
    onActivityMock = vi.fn();
    clearSelectionMock = vi.fn();
    exitGroupMock = vi.fn();
  });

  it("starts in idle state", () => {
    const controller = createController();
    expect(controller.getMarquee()).toBeNull();
    expect(controller.getLasso()).toBeNull();
    expect(controller.isSelecting()).toBe(false);
  });

  it("handles left-to-right marquee (containment mode)", () => {
    const controller = createController();

    const started = controller.startSelection({ x: 50, y: 50 }, "replace");
    expect(started).toBe(true);
    expect(controller.getMarquee()?.startX).toBe(50);
    expect(controller.getMarquee()?.direction).toBe("left-to-right");
    expect(controller.getMarquee()?.matchMode).toBe("containment");

    // Drag to enclose rect-1 completely (50,50 to 250,250 covers rect-1 at 100,100,100,100)
    controller.updateSelection({ x: 250, y: 250 });
    expect(controller.getMarquee()?.currentX).toBe(250);
    expect(controller.getMarquee()?.matchMode).toBe("containment");

    controller.endSelection();
    expect(controller.getMarquee()).toBeNull();
    expect(selectedShapeIds).toEqual(["rect-1"]);
  });

  it("handles right-to-left marquee (intersection mode)", () => {
    const controller = createController();

    // Start on right, drag left to touch rect-1 partially
    controller.startSelection({ x: 150, y: 150 }, "replace");
    controller.updateSelection({ x: 50, y: 50 });

    expect(controller.getMarquee()?.direction).toBe("right-to-left");
    expect(controller.getMarquee()?.matchMode).toBe("intersection");

    controller.endSelection();
    // In intersection mode, touching rect-1 selects it
    expect(selectedShapeIds).toEqual(["rect-1"]);
  });

  it("preserves group hierarchy invariant (resolves child hit to root group)", () => {
    const controller = createController();

    // Drag marquee over child-a at (510, 110)
    controller.startSelection({ x: 450, y: 50 }, "replace");
    controller.updateSelection({ x: 750, y: 350 });
    controller.endSelection();

    // Must select group-a, and NEVER both group-a and child-a
    expect(selectedShapeIds).toContain("group-a");
    expect(selectedShapeIds).not.toContain("child-a");
  });

  it("supports Shift additive selection", () => {
    selectedShapeIds = ["rect-1"];
    const controller = createController();

    controller.startSelection({ x: 280, y: 80 }, "add");
    controller.updateSelection({ x: 420, y: 220 });
    controller.endSelection();

    expect(selectedShapeIds.sort()).toEqual(["rect-1", "rect-2"].sort());
  });

  it("supports Ctrl/Cmd toggle selection", () => {
    selectedShapeIds = ["rect-1", "rect-2"];
    const controller = createController();

    controller.startSelection({ x: 50, y: 50 }, "toggle");
    controller.updateSelection({ x: 250, y: 250 });
    controller.endSelection();

    // Toggling rect-1 removes it, leaving rect-2
    expect(selectedShapeIds).toEqual(["rect-2"]);
  });

  it("clears selection and exits editing group on empty canvas click (< 3px)", () => {
    selectedShapeIds = ["rect-1"];
    editingGroupId = "group-a";

    const controller = createController();
    controller.startSelection({ x: 10, y: 10 }, "replace");
    // No movement or tiny movement (< 3px)
    controller.updateSelection({ x: 11, y: 11 });
    controller.endSelection();

    expect(selectedShapeIds).toEqual([]);
    expect(clearSelectionMock).toHaveBeenCalled();
    expect(exitGroupMock).toHaveBeenCalled();
  });

  it("supports Lasso selection tool", () => {
    activeTool = "lasso";
    const controller = createController();

    const started = controller.startSelection({ x: 50, y: 50 }, "replace");
    expect(started).toBe(true);
    expect(controller.getLasso()).toBeDefined();

    // Draw lasso polygon around rect-1
    controller.updateSelection({ x: 250, y: 50 });
    controller.updateSelection({ x: 250, y: 250 });
    controller.updateSelection({ x: 50, y: 250 });

    expect(controller.getLasso()?.points.length).toBeGreaterThanOrEqual(4);

    controller.endSelection();
    expect(controller.getLasso()).toBeNull();
    expect(selectedShapeIds).toEqual(["rect-1"]);
  });

  it("discards degenerate lasso (< 3 points)", () => {
    activeTool = "lasso";
    selectedShapeIds = ["rect-1"];
    const controller = createController();

    controller.startSelection({ x: 50, y: 50 }, "replace");
    // Only 1 point
    controller.endSelection();

    // Did not alter selection
    expect(selectedShapeIds).toEqual(["rect-1"]);
  });

  it("handles direct shape clicks with modifiers", () => {
    const controller = createController();

    // Normal click
    controller.handleShapeClick("rect-1", "replace");
    expect(selectedShapeIds).toEqual(["rect-1"]);

    // Shift click (add)
    controller.handleShapeClick("rect-2", "add");
    expect(selectedShapeIds.sort()).toEqual(["rect-1", "rect-2"].sort());

    // Toggle click
    controller.handleShapeClick("rect-1", "toggle");
    expect(selectedShapeIds).toEqual(["rect-2"]);

    // Click on child-a resolves to group-a
    controller.handleShapeClick("child-a", "replace");
    expect(selectedShapeIds).toEqual(["group-a"]);
  });
});
