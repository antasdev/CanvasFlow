import { describe, expect, it } from "vitest";

import {
  screenToWorld,
  worldToScreen,
  type CanvasTransform,
} from "./canvas.coordinates";

describe("canvas coordinates", () => {
  const transform: CanvasTransform = {
    zoom: 2,
    pan: {
      x: 100,
      y: 50,
    },
  };

  it("converts screen coordinates to world coordinates", () => {
    const result = screenToWorld(
      {
        x: 500,
        y: 300,
      },
      transform,
    );

    expect(result).toEqual({
      x: 200,
      y: 125,
    });
  });

  it("converts world coordinates to screen coordinates", () => {
    const result = worldToScreen(
      {
        x: 200,
        y: 125,
      },
      transform,
    );

    expect(result).toEqual({
      x: 500,
      y: 300,
    });
  });

  it("round trips screen coordinates", () => {
    const screenPoint = {
      x: 750,
      y: 420,
    };

    const worldPoint = screenToWorld(
      screenPoint,
      transform,
    );

    const result = worldToScreen(
      worldPoint,
      transform,
    );

    expect(result).toEqual(screenPoint);
  });

  it("round trips arbitrary screen coordinates across various zoom levels and pans", () => {
    const testCases: { screen: { x: number; y: number }; vp: CanvasTransform }[] = [
      { screen: { x: 100, y: 100 }, vp: { zoom: 0.2, pan: { x: 0, y: 0 } } },
      { screen: { x: 1920, y: 1080 }, vp: { zoom: 1.0, pan: { x: -450, y: -250 } } },
      { screen: { x: 345.67, y: 890.12 }, vp: { zoom: 1.75, pan: { x: 123.45, y: -67.89 } } },
      { screen: { x: 0, y: 0 }, vp: { zoom: 3.0, pan: { x: 1000, y: 1000 } } },
      { screen: { x: 640, y: 480 }, vp: { zoom: 0.3333, pan: { x: -1200, y: 400 } } },
    ];

    for (const { screen, vp } of testCases) {
      const world = screenToWorld(screen, vp);
      const roundTripScreen = worldToScreen(world, vp);

      expect(roundTripScreen.x).toBeCloseTo(screen.x, 5);
      expect(roundTripScreen.y).toBeCloseTo(screen.y, 5);
    }
  });

  it("proves world coordinates remain stable during zoom transformations", () => {
    // A comment pinned at world coordinate (300, 400)
    const worldAnchor = { x: 300, y: 400 };

    const vp1: CanvasTransform = { zoom: 1.0, pan: { x: 0, y: 0 } };
    const vp2: CanvasTransform = { zoom: 2.0, pan: { x: -300, y: -400 } };
    const vp3: CanvasTransform = { zoom: 0.5, pan: { x: 150, y: 200 } };

    // Screen positions change based on viewport
    const screen1 = worldToScreen(worldAnchor, vp1);
    const screen2 = worldToScreen(worldAnchor, vp2);
    const screen3 = worldToScreen(worldAnchor, vp3);

    expect(screen1).toEqual({ x: 300, y: 400 });
    expect(screen2).toEqual({ x: 300, y: 400 });
    expect(screen3).toEqual({ x: 300, y: 400 });

    // Converting each screen position back with its respective viewport yields the exact same world coordinate
    expect(screenToWorld(screen1, vp1)).toEqual(worldAnchor);
    expect(screenToWorld(screen2, vp2)).toEqual(worldAnchor);
    expect(screenToWorld(screen3, vp3)).toEqual(worldAnchor);
  });

  it("proves world coordinates remain stable during pan transformations", () => {
    const worldAnchor = { x: 150, y: 250 };

    const initialVp: CanvasTransform = { zoom: 1.0, pan: { x: 0, y: 0 } };
    const pannedVp: CanvasTransform = { zoom: 1.0, pan: { x: 100, y: -50 } };

    const initialScreen = worldToScreen(worldAnchor, initialVp);
    const pannedScreen = worldToScreen(worldAnchor, pannedVp);

    expect(initialScreen).toEqual({ x: 150, y: 250 });
    expect(pannedScreen).toEqual({ x: 250, y: 200 });

    // World coordinate is invariant under pan
    expect(screenToWorld(pannedScreen, pannedVp)).toEqual(worldAnchor);
  });
});