import { describe, expect, it } from "vitest";

import {
  screenToWorld,
  worldToScreen,
} from "./canvas.coordinates";

describe("canvas coordinates", () => {
  const transform = {
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
});