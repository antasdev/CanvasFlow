import { describe, it, expect } from "vitest";

import { calculateInfiniteGridLines } from "./grid.utils";

describe("calculateInfiniteGridLines", () => {
  it("returns empty lines when dimensions are non-positive", () => {
    expect(calculateInfiniteGridLines({ width: 0, height: 600 }).lines).toHaveLength(0);
    expect(calculateInfiniteGridLines({ width: 800, height: -10 }).lines).toHaveLength(0);
    expect(calculateInfiniteGridLines({ width: 800, height: 600, gridSize: 0 }).lines).toHaveLength(0);
  });

  it("generates correct grid lines at default zoom (1.0) and zero pan", () => {
    const result = calculateInfiniteGridLines({
      width: 400,
      height: 200,
      pan: { x: 0, y: 0 },
      zoom: 1,
      gridSize: 40,
    });

    expect(result.step).toBe(40);
    expect(result.strokeWidth).toBe(1);

    const vertical = result.lines.filter((l) => l.isVertical);
    const horizontal = result.lines.filter((l) => !l.isVertical);

    // Vertical lines from 0 to 400 with step 40 => 0, 40, 80, 120, 160, 200, 240, 280, 320, 360, 400 => 11 lines
    expect(vertical).toHaveLength(11);
    expect(vertical[0].points).toEqual([0, 0, 0, 200]);
    expect(vertical[10].points).toEqual([400, 0, 400, 200]);

    // Horizontal lines from 0 to 200 with step 40 => 0, 40, 80, 120, 160, 200 => 6 lines
    expect(horizontal).toHaveLength(6);
    expect(horizontal[0].points).toEqual([0, 0, 400, 0]);
    expect(horizontal[5].points).toEqual([0, 200, 400, 200]);
  });

  it("handles negative world coordinates when canvas is panned positively", () => {
    const result = calculateInfiniteGridLines({
      width: 400,
      height: 200,
      pan: { x: 80, y: 40 }, // Viewport sees world x in [-80, 320], world y in [-40, 160]
      zoom: 1,
      gridSize: 40,
    });

    const vertical = result.lines.filter((l) => l.isVertical);
    expect(vertical[0].points[0]).toBe(-80);
    expect(vertical[vertical.length - 1].points[0]).toBe(320);

    const horizontal = result.lines.filter((l) => !l.isVertical);
    expect(horizontal[0].points[1]).toBe(-40);
    expect(horizontal[horizontal.length - 1].points[1]).toBe(160);
  });

  it("handles large positive coordinates without distortion", () => {
    const result = calculateInfiniteGridLines({
      width: 400,
      height: 200,
      pan: { x: -5000, y: -2000 },
      zoom: 1,
      gridSize: 40,
    });

    const vertical = result.lines.filter((l) => l.isVertical);
    expect(vertical[0].points[0]).toBe(5000);
    expect(vertical[vertical.length - 1].points[0]).toBe(5400);
  });

  it("adaptively doubles grid step at medium zoom out (< 0.7)", () => {
    const result = calculateInfiniteGridLines({
      width: 800,
      height: 600,
      zoom: 0.5,
      gridSize: 40,
    });

    expect(result.step).toBe(80);
    expect(result.strokeWidth).toBe(2); // 1 / 0.5 = 2 screen-constant width
  });

  it("adaptively quadruples grid step at low zoom (< 0.35)", () => {
    const result = calculateInfiniteGridLines({
      width: 800,
      height: 600,
      zoom: 0.2,
      gridSize: 40,
    });

    expect(result.step).toBe(160);
    expect(result.strokeWidth).toBe(5); // 1 / 0.2 = 5
  });

  it("maintains screen-constant strokeWidth when zoomed in (> 1.0)", () => {
    const result = calculateInfiniteGridLines({
      width: 800,
      height: 600,
      zoom: 2.0,
      gridSize: 40,
    });

    expect(result.step).toBe(40);
    expect(result.strokeWidth).toBe(0.5); // 1 / 2 = 0.5
  });

  it("enforces maxLinesPerAxis to prevent runaway rendering under extreme inputs", () => {
    const result = calculateInfiniteGridLines({
      width: 100000,
      height: 100000,
      zoom: 1,
      gridSize: 10,
      maxLinesPerAxis: 20,
    });

    const vertical = result.lines.filter((l) => l.isVertical);
    const horizontal = result.lines.filter((l) => !l.isVertical);

    expect(vertical.length).toBeLessThanOrEqual(20);
    expect(horizontal.length).toBeLessThanOrEqual(20);
  });
});
