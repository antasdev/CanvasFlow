import { describe, expect, it } from "vitest";
import type { Shape, RectangleShape, CircleShape, LineShape } from "@/features/canvas/types";
import { prepareExportScene, normalizeExportShape } from "../utils/export-geometry.utils";
import type { ExportOptions } from "../types/export.types";

describe("Export Geometry and Scene Preparation Utilities", () => {
  const createRect = (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    zIndex = 1,
    parentId?: string
  ): RectangleShape => ({
    id,
    type: "rectangle",
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    zIndex,
    parentId: parentId ?? null,
    fill: "#3b82f6",
    stroke: "#1d4ed8",
    strokeWidth: 2,
  });

  const createCircle = (
    id: string,
    x: number,
    y: number,
    width: number,
    height: number,
    zIndex = 2
  ): CircleShape => ({
    id,
    type: "circle",
    x,
    y,
    width,
    height,
    rotation: 0,
    opacity: 1,
    zIndex,
    fill: "#10b981",
    stroke: "#047857",
    strokeWidth: 2,
  });

  const createLine = (
    id: string,
    x: number,
    y: number,
    points: number[],
    zIndex = 3
  ): LineShape => ({
    id,
    type: "line",
    x,
    y,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    zIndex,
    points,
    stroke: "#000000",
    strokeWidth: 2,
  });

  it("normalizes a shape coordinate accurately given final bounds", () => {
    const rect = createRect("r1", 100, 200, 50, 50);
    const map = new Map<string, Shape>([[rect.id, rect]]);
    const finalBounds = { minX: 80, minY: 180 }; // padding of 20 applied

    const prepared = normalizeExportShape(rect, map, finalBounds);
    expect(prepared.worldX).toBe(100);
    expect(prepared.worldY).toBe(200);
    expect(prepared.normalizedX).toBe(20);
    expect(prepared.normalizedY).toBe(20);
  });

  it("normalizes shape points for lines and point-based shapes", () => {
    const line = createLine("l1", 50, 50, [0, 0, 100, 100]);
    const map = new Map<string, Shape>([[line.id, line]]);
    const finalBounds = { minX: 30, minY: 30 }; // minX=50 - 20 padding

    const prepared = normalizeExportShape(line, map, finalBounds);
    // Point 1: (0,0) + line origin (50,50) -> world (50,50) -> normalized (20, 20)
    // Point 2: (100,100) + line origin (50,50) -> world (150,150) -> normalized (120, 120)
    expect(prepared.normalizedPoints).toEqual([20, 20, 120, 120]);
  });

  it("prepares a full scene with padding, scale, and correct dimensions", () => {
    const r1 = createRect("r1", 100, 100, 200, 100);
    const c1 = createCircle("c1", 200, 150, 100, 100);
    const shapes = [r1, c1];

    const options: ExportOptions = {
      format: "png",
      scope: "canvas",
      scale: 2,
      padding: 10,
      background: "canvas",
    };

    const scene = prepareExportScene(shapes, options);

    // Content bounds:
    // r1: (100,100) to (300, 200)
    // c1: (200,150) to (300, 250)
    // Combined content bounds: minX=100, minY=100, maxX=300, maxY=250 -> width=200, height=150
    expect(scene.contentBounds.minX).toBe(100);
    expect(scene.contentBounds.minY).toBe(100);
    expect(scene.contentBounds.maxX).toBe(300);
    expect(scene.contentBounds.maxY).toBe(250);
    expect(scene.contentBounds.width).toBe(200);
    expect(scene.contentBounds.height).toBe(150);

    // Final bounds (with 10 padding):
    // minX=90, minY=90, maxX=310, maxY=260 -> width=220, height=170
    expect(scene.finalBounds.minX).toBe(90);
    expect(scene.finalBounds.minY).toBe(90);
    expect(scene.finalBounds.maxX).toBe(310);
    expect(scene.finalBounds.maxY).toBe(260);
    expect(scene.finalBounds.width).toBe(220);
    expect(scene.finalBounds.height).toBe(170);

    // Logical vs Pixel dimensions
    expect(scene.logicalDimensions).toEqual({ width: 220, height: 170 });
    expect(scene.pixelDimensions).toEqual({ width: 440, height: 340 }); // scale = 2

    // Shapes normalized
    expect(scene.shapes).toHaveLength(2);
    // r1 world (100, 100) -> normalizedX = 100 - 90 = 10, normalizedY = 100 - 90 = 10
    expect(scene.shapes[0].normalizedX).toBe(10);
    expect(scene.shapes[0].normalizedY).toBe(10);
  });

  it("demonstrates viewport independence for canvas scope", () => {
    const s1 = createRect("s1", 100, 100, 50, 50);
    const s2 = createRect("s2", 200, 200, 50, 50);
    const shapes = [s1, s2];

    const optionsA: ExportOptions = {
      format: "png",
      scope: "canvas",
      viewport: {
        zoom: 0.5,
        pan: { x: -1000, y: -500 },
        screenWidth: 1920,
        screenHeight: 1080,
      },
    };

    const optionsB: ExportOptions = {
      format: "png",
      scope: "canvas",
      viewport: {
        zoom: 2.0,
        pan: { x: 500, y: 300 },
        screenWidth: 1024,
        screenHeight: 768,
      },
    };

    const sceneA = prepareExportScene(shapes, optionsA);
    const sceneB = prepareExportScene(shapes, optionsB);

    // Content bounds and final bounds MUST BE IDENTICAL regardless of viewport pan/zoom
    expect(sceneA.contentBounds).toEqual(sceneB.contentBounds);
    expect(sceneA.finalBounds).toEqual(sceneB.finalBounds);
    expect(sceneA.logicalDimensions).toEqual(sceneB.logicalDimensions);
    expect(sceneA.shapes[0].normalizedX).toBe(sceneB.shapes[0].normalizedX);
    expect(sceneA.shapes[0].normalizedY).toBe(sceneB.shapes[0].normalizedY);
  });

  it("guarantees document immutability (input shapes array and objects are never mutated)", () => {
    const originalRect = createRect("imm-1", -100, -50, 80, 80);
    const originalShapes = [originalRect];

    // Deep clone snapshot before preparation
    const snapshotBefore = JSON.parse(JSON.stringify(originalShapes));

    const options: ExportOptions = {
      format: "png",
      scope: "canvas",
      padding: 15,
      scale: 1.5,
    };

    const scene = prepareExportScene(originalShapes, options);

    // Deep comparison after preparation
    expect(JSON.parse(JSON.stringify(originalShapes))).toEqual(snapshotBefore);
    expect(originalShapes).toHaveLength(1);
    expect(originalShapes[0].x).toBe(-100);
    expect(originalShapes[0].y).toBe(-50);
    expect(scene.shapes[0].normalizedX).toBe(15); // (-100 - (-115)) = 15
    expect(scene.shapes[0].normalizedY).toBe(15);
  });
});
