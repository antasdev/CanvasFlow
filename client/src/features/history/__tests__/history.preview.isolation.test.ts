import { beforeEach, describe, expect, it } from "vitest";

import { useCanvasStore } from "@/features/canvas/store";
import type { RectangleShape, Shape } from "@/features/canvas/types";
import { getShapeWorldAnchorPoint } from "@/features/canvas/utils/anchor.utils";

import type { VersionCanvasSnapshot } from "../types/history.types";
import { mapVersionShapeSnapshotToShape } from "../utils/history-shape.mapper";

describe("Slice 40 — Historical Preview Isolation & Read-Only Invariants", () => {
  const liveShape1: RectangleShape = {
    id: "live-shape-1",
    type: "rectangle",
    x: 50,
    y: 50,
    width: 200,
    height: 100,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    fill: "#ef4444",
    stroke: "#991b1b",
    strokeWidth: 2,
    version: 1,
  };

  const historicalCanvasSnapshot: VersionCanvasSnapshot = {
    canvasId: "c-hist-1",
    name: "Historical Canvas Page",
    order: 0,
    backgroundColor: "#ffffff",
    shapes: [
      {
        id: "hist-shape-1",
        canvasId: "c-hist-1",
        type: "rectangle",
        x: 500,
        y: 600,
        width: 150,
        height: 150,
        zIndex: 1,
        style: { fill: "#3b82f6" },
        version: 1,
      },
      {
        id: "hist-shape-2",
        canvasId: "c-hist-1",
        type: "circle",
        x: 800,
        y: 600,
        width: 120,
        height: 120,
        zIndex: 2,
        style: { fill: "#10b981" },
        version: 1,
      },
      {
        id: "hist-conn-1",
        canvasId: "c-hist-1",
        type: "connector",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        zIndex: 3,
        connector: {
          sourceShapeId: "hist-shape-1",
          sourceAnchor: "right",
          targetShapeId: "hist-shape-2",
          targetAnchor: "left",
          routing: "straight",
        },
        version: 1,
      },
    ],
  };

  beforeEach(() => {
    // Reset live canvas store to State A
    useCanvasStore.setState({
      shapes: [liveShape1],
      selectedShapeIds: ["live-shape-1"],
      zoom: 1.5,
      pan: { x: 120, y: 80 },
    });
  });

  it("guarantees preview does NOT mutate live canvas shapes or selection", () => {
    // Before preview
    const liveShapesBefore = useCanvasStore.getState().shapes;
    const liveSelectionBefore = useCanvasStore.getState().selectedShapeIds;
    const liveZoomBefore = useCanvasStore.getState().zoom;
    const livePanBefore = useCanvasStore.getState().pan;

    expect(liveShapesBefore).toHaveLength(1);
    expect(liveShapesBefore[0].id).toBe("live-shape-1");
    expect(liveSelectionBefore).toEqual(["live-shape-1"]);
    expect(liveZoomBefore).toBe(1.5);
    expect(livePanBefore).toEqual({ x: 120, y: 80 });

    // Render / Map historical snapshot projection
    const historicalShapes: Shape[] = historicalCanvasSnapshot.shapes.map(
      (s) => mapVersionShapeSnapshotToShape(s)
    );

    expect(historicalShapes).toHaveLength(3);
    expect(historicalShapes.map((s) => s.id)).toEqual([
      "hist-shape-1",
      "hist-shape-2",
      "hist-conn-1",
    ]);

    // Verify live canvas store remains completely untouched (State A unchanged)
    const liveShapesAfter = useCanvasStore.getState().shapes;
    const liveSelectionAfter = useCanvasStore.getState().selectedShapeIds;
    const liveZoomAfter = useCanvasStore.getState().zoom;
    const livePanAfter = useCanvasStore.getState().pan;

    expect(liveShapesAfter).toEqual(liveShapesBefore);
    expect(liveSelectionAfter).toEqual(liveSelectionBefore);
    expect(liveZoomAfter).toBe(liveZoomBefore);
    expect(livePanAfter).toEqual(livePanBefore);
  });

  it("resolves historical connector anchors strictly against historical snapshot shapes", () => {
    const historicalShapes: Shape[] = historicalCanvasSnapshot.shapes.map(
      (s) => mapVersionShapeSnapshotToShape(s)
    );

    const sourceShape = historicalShapes.find((s) => s.id === "hist-shape-1");
    const targetShape = historicalShapes.find((s) => s.id === "hist-shape-2");

    expect(sourceShape).toBeDefined();
    expect(targetShape).toBeDefined();

    // Calculate anchor point using pure math against historical shape
    const sourceRightAnchor = getShapeWorldAnchorPoint(
      sourceShape!,
      historicalShapes,
      "right"
    );
    const targetLeftAnchor = getShapeWorldAnchorPoint(
      targetShape!,
      historicalShapes,
      "left"
    );

    // hist-shape-1: x=500, width=150, y=600, height=150 -> right anchor = (500 + 150, 600 + 75) = (650, 675)
    expect(sourceRightAnchor).toEqual({ x: 650, y: 675 });
    // hist-shape-2: x=800, width=120, y=600, height=120 -> left anchor = (800, 600 + 60) = (800, 660)
    expect(targetLeftAnchor).toEqual({ x: 800, y: 660 });

    // Ensure live shapes in useCanvasStore were not involved in calculation
    const liveStoreState = useCanvasStore.getState();
    expect(liveStoreState.shapes).not.toContain(sourceShape);
    expect(liveStoreState.shapes).not.toContain(targetShape);
  });

  it("preserves historical group relationships without contaminating live state", () => {
    const groupSnapshot: VersionCanvasSnapshot = {
      canvasId: "c-hist-group",
      name: "Group Snapshot",
      order: 0,
      backgroundColor: "#ffffff",
      shapes: [
        {
          id: "hist-grp-1",
          canvasId: "c-hist-group",
          type: "group",
          x: 100,
          y: 100,
          width: 300,
          height: 200,
          zIndex: 1,
          version: 1,
        },
        {
          id: "hist-child-1",
          canvasId: "c-hist-group",
          type: "rectangle",
          x: 20,
          y: 20,
          width: 80,
          height: 80,
          parentId: "hist-grp-1",
          zIndex: 2,
          version: 1,
        },
      ],
    };

    const mapped = groupSnapshot.shapes.map((s) => mapVersionShapeSnapshotToShape(s));
    const group = mapped.find((s) => s.id === "hist-grp-1");
    const child = mapped.find((s) => s.id === "hist-child-1");

    expect(group?.type).toBe("group");
    expect(child?.parentId).toBe("hist-grp-1");

    // Children in group are resolved from mapped snapshot array
    const groupChildren = mapped.filter((s) => s.parentId === group?.id);
    expect(groupChildren).toHaveLength(1);
    expect(groupChildren[0].id).toBe("hist-child-1");

    // Live store has 0 groups and 0 knowledge of hist-grp-1
    expect(useCanvasStore.getState().shapes.find((s) => s.id === "hist-grp-1")).toBeUndefined();
  });
});
