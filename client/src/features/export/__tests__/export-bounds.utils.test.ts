import { describe, expect, it } from "vitest";
import type { Shape, RectangleShape, LineShape } from "@/features/canvas/types";
import {
  calculateShapeWorldBounds,
  calculateContentBounds,
  applyExportPadding,
} from "../utils/export-bounds.utils";
import { ExportError } from "../utils/export-validation.utils";

describe("Export Bounds Utilities", () => {
  const createRect = (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    rotation: number = 0,
    parentId?: string
  ): RectangleShape => ({
    id,
    type: "rectangle",
    x,
    y,
    width,
    height,
    rotation,
    opacity: 1,
    zIndex: 1,
    parentId: parentId ?? null,
    fill: "#ff0000",
    stroke: "#000000",
    strokeWidth: 2,
  });

  const createLine = (
    id: string,
    x: number,
    y: number,
    points: number[],
    strokeWidth = 2
  ): LineShape => ({
    id,
    type: "line",
    x,
    y,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    points,
    stroke: "#000000",
    strokeWidth,
  });

  it("computes bounds for an unrotated single shape", () => {
    const rect = createRect("r1", 100, 200, 50, 60);
    const map = new Map<string, Shape>([[rect.id, rect]]);

    const bounds = calculateShapeWorldBounds(rect, map);
    expect(bounds).toEqual({
      minX: 100,
      minY: 200,
      maxX: 150,
      maxY: 260,
      width: 50,
      height: 60,
    });
  });

  it("computes bounds for rotated shapes accurately", () => {
    // 100x100 box at (0, 0) rotated by 90 degrees around top-left
    const rect = createRect("r2", 0, 0, 100, 100, 90);
    const map = new Map<string, Shape>([[rect.id, rect]]);

    const bounds = calculateShapeWorldBounds(rect, map);
    // Rotating around (0,0) by 90 deg:
    // (0,0) -> (0,0)
    // (100,0) -> (0, 100)
    // (100,100) -> (-100, 100)
    // (0,100) -> (-100, 0)
    expect(Math.round(bounds.minX)).toBe(-100);
    expect(Math.round(bounds.minY)).toBe(0);
    expect(Math.round(bounds.maxX)).toBe(0);
    expect(Math.round(bounds.maxY)).toBe(100);
    expect(Math.round(bounds.width)).toBe(100);
    expect(Math.round(bounds.height)).toBe(100);
  });

  it("computes bounds for point-based shapes (lines/arrows/connectors/freehand)", () => {
    // Line at (50, 50) with points [0, 0, 100, 200]
    const line = createLine("l1", 50, 50, [0, 0, 100, 200], 4);
    const map = new Map<string, Shape>([[line.id, line]]);

    const bounds = calculateShapeWorldBounds(line, map);
    // strokeWidth 4 -> halfStroke is 2
    // world coords: (50, 50) to (150, 250)
    expect(bounds.minX).toBe(48);
    expect(bounds.minY).toBe(48);
    expect(bounds.maxX).toBe(152);
    expect(bounds.maxY).toBe(252);
    expect(bounds.width).toBe(104);
    expect(bounds.height).toBe(204);
  });

  it("handles negative and mixed coordinates correctly", () => {
    const s1 = createRect("s1", -500, -300, 100, 100);
    const s2 = createRect("s2", 200, 400, 50, 50);
    const map = new Map<string, Shape>([
      [s1.id, s1],
      [s2.id, s2],
    ]);

    const bounds = calculateContentBounds([s1, s2], map);
    expect(bounds.minX).toBe(-500);
    expect(bounds.minY).toBe(-300);
    expect(bounds.maxX).toBe(250);
    expect(bounds.maxY).toBe(450);
    expect(bounds.width).toBe(750);
    expect(bounds.height).toBe(750);
  });

  it("resolves nested group hierarchy for child shapes", () => {
    const group: Shape = {
      id: "g1",
      type: "group",
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
    };
    const child = createRect("c1", 20, 30, 40, 50, 0, "g1");

    const map = new Map<string, Shape>([
      [group.id, group],
      [child.id, child],
    ]);

    const childBounds = calculateShapeWorldBounds(child, map);
    // local (20, 30) inside group at (100, 100) -> world (120, 130)
    expect(childBounds.minX).toBe(120);
    expect(childBounds.minY).toBe(130);
    expect(childBounds.maxX).toBe(160);
    expect(childBounds.maxY).toBe(180);
  });

  it("throws EMPTY_CANVAS when calculating content bounds with no shapes", () => {
    const map = new Map<string, Shape>();
    expect(() => calculateContentBounds([], map)).toThrowError(ExportError);
    expect(() => calculateContentBounds([], map)).toThrow("No exportable shapes found");
  });

  it("applies uniform padding correctly without double-counting", () => {
    const contentBounds = {
      minX: 100,
      minY: 100,
      maxX: 200,
      maxY: 300,
      width: 100,
      height: 200,
    };

    const padded = applyExportPadding(contentBounds, 25);
    expect(padded.minX).toBe(75);
    expect(padded.minY).toBe(75);
    expect(padded.maxX).toBe(225);
    expect(padded.maxY).toBe(325);
    expect(padded.width).toBe(150);
    expect(padded.height).toBe(250);
  });
});
