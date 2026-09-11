import { describe, expect, it } from "vitest";
import type { Shape, RectangleShape } from "@/features/canvas/types";
import {
  filterShapesForExport,
  sortShapesForExport,
} from "../utils/export-order.utils";
import type { ExportOptions } from "../types/export.types";

describe("Export Order and Filter Utilities", () => {
  const createRect = (
    id: string,
    x: number,
    y: number,
    zIndex: number,
    parentId?: string
  ): RectangleShape => ({
    id,
    type: "rectangle",
    x,
    y,
    width: 50,
    height: 50,
    rotation: 0,
    opacity: 1,
    zIndex,
    parentId: parentId ?? null,
    fill: "#ff0000",
    stroke: "#000000",
    strokeWidth: 2,
  });

  it("sorts shapes deterministically by zIndex ascending", () => {
    const s1 = createRect("s1", 0, 0, 10);
    const s2 = createRect("s2", 0, 0, 2);
    const s3 = createRect("s3", 0, 0, 5);

    const sorted = sortShapesForExport([s1, s2, s3]);
    expect(sorted.map((s) => s.id)).toEqual(["s2", "s3", "s1"]);
  });

  it("breaks ties deterministically using input document index when zIndex is equal", () => {
    const s1 = createRect("first", 0, 0, 5);
    const s2 = createRect("second", 0, 0, 5);
    const s3 = createRect("third", 0, 0, 5);

    const sorted = sortShapesForExport([s1, s2, s3]);
    expect(sorted.map((s) => s.id)).toEqual(["first", "second", "third"]);
  });

  it("filters shapes for canvas scope returning all canvas shapes", () => {
    const s1 = createRect("s1", 0, 0, 1);
    const s2 = createRect("s2", 10, 10, 2);

    const map = new Map<string, Shape>([
      [s1.id, s1],
      [s2.id, s2],
    ]);
    const options: ExportOptions = {
      format: "png",
      scope: "canvas",
    };

    const filtered = filterShapesForExport([s1, s2], options, map);
    expect(filtered).toHaveLength(2);
    expect(filtered.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("filters selection scope and includes descendants when a group is selected", () => {
    const group: Shape = {
      id: "group-1",
      type: "group",
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
    };
    const child1 = createRect("child-1", 10, 10, 2, "group-1");
    const child2 = createRect("child-2", 20, 20, 3, "group-1");
    const standalone = createRect("other", 100, 100, 4);

    const shapes = [group, child1, child2, standalone];
    const map = new Map<string, Shape>(shapes.map((s) => [s.id, s]));

    const options: ExportOptions = {
      format: "png",
      scope: "selection",
      selectedShapeIds: ["group-1"],
    };

    const filtered = filterShapesForExport(shapes, options, map);
    const ids = filtered.map((s) => s.id);
    expect(ids).toContain("group-1");
    expect(ids).toContain("child-1");
    expect(ids).toContain("child-2");
    expect(ids).not.toContain("other");
  });

  it("filters viewport scope by intersecting world viewport rectangle", () => {
    // Viewport: screen 800x600, zoom=1, pan=(0,0) -> world (0,0) to (800,600)
    const inside = createRect("inside", 100, 100, 1);
    const outside = createRect("outside", 2000, 2000, 2);

    const shapes = [inside, outside];
    const map = new Map<string, Shape>(shapes.map((s) => [s.id, s]));

    const options: ExportOptions = {
      format: "png",
      scope: "viewport",
      viewport: {
        zoom: 1,
        pan: { x: 0, y: 0 },
        screenWidth: 800,
        screenHeight: 600,
      },
    };

    const filtered = filterShapesForExport(shapes, options, map);
    expect(filtered.map((s) => s.id)).toEqual(["inside"]);
  });
});
