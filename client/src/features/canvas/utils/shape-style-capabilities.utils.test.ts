import { describe, it, expect } from "vitest";
import {
  getShapeStyleCapabilities,
  getMultiShapeCapabilities,
  isShapeCompatibleWithProperty,
} from "./shape-style-capabilities.utils";

describe("Shape Style Capabilities Utilities", () => {
  it("correctly identifies filled shape capabilities", () => {
    const types = ["rectangle", "circle", "ellipse", "triangle", "polygon", "star"] as const;
    for (const type of types) {
      const caps = getShapeStyleCapabilities(type);
      expect(caps.canFill).toBe(true);
      expect(caps.canStroke).toBe(true);
      expect(caps.canStrokeWidth).toBe(true);
      expect(caps.canStrokeStyle).toBe(true);
      expect(caps.canOpacity).toBe(true);
      expect(caps.canShadow).toBe(true);
    }
  });

  it("correctly identifies vector shape capabilities (no fill)", () => {
    const types = ["line", "arrow", "connector", "freehand"] as const;
    for (const type of types) {
      const caps = getShapeStyleCapabilities(type);
      expect(caps.canFill).toBe(false);
      expect(caps.canStroke).toBe(true);
      expect(caps.canStrokeWidth).toBe(true);
      expect(caps.canStrokeStyle).toBe(true);
      expect(caps.canOpacity).toBe(true);
      expect(caps.canShadow).toBe(true);
    }
  });

  it("correctly identifies text and sticky note capabilities", () => {
    const textCaps = getShapeStyleCapabilities("text");
    expect(textCaps.canFill).toBe(true);
    expect(textCaps.canStroke).toBe(false);
    expect(textCaps.canStrokeWidth).toBe(false);
    expect(textCaps.canStrokeStyle).toBe(false);
    expect(textCaps.canOpacity).toBe(true);
    expect(textCaps.canShadow).toBe(true);

    const stickyCaps = getShapeStyleCapabilities("sticky_note");
    expect(stickyCaps.canFill).toBe(true);
    expect(stickyCaps.canStroke).toBe(false);
    expect(stickyCaps.canStrokeWidth).toBe(false);
    expect(stickyCaps.canStrokeStyle).toBe(false);
    expect(stickyCaps.canOpacity).toBe(true);
    expect(stickyCaps.canShadow).toBe(true);
  });

  it("aggregates multi-shape capabilities across heterogeneous selections", () => {
    // Rectangle + Line
    const mixed = getMultiShapeCapabilities([{ type: "rectangle" }, { type: "line" }]);
    expect(mixed.canFill).toBe(true); // Rectangle can fill
    expect(mixed.canStroke).toBe(true); // Both can stroke
    expect(mixed.canStrokeWidth).toBe(true);
    expect(mixed.canStrokeStyle).toBe(true);
    expect(mixed.canOpacity).toBe(true);
    expect(mixed.canShadow).toBe(true);

    // Only Lines
    const linesOnly = getMultiShapeCapabilities([{ type: "line" }, { type: "arrow" }]);
    expect(linesOnly.canFill).toBe(false);
    expect(linesOnly.canStroke).toBe(true);

    // Empty shapes
    const empty = getMultiShapeCapabilities([]);
    expect(empty.canFill).toBe(false);
    expect(empty.canStroke).toBe(false);
  });

  it("tests property compatibility per shape type", () => {
    expect(isShapeCompatibleWithProperty("rectangle", "fill")).toBe(true);
    expect(isShapeCompatibleWithProperty("line", "fill")).toBe(false);
    expect(isShapeCompatibleWithProperty("line", "stroke")).toBe(true);
    expect(isShapeCompatibleWithProperty("text", "stroke")).toBe(false);
    expect(isShapeCompatibleWithProperty("text", "fill")).toBe(true);
    expect(isShapeCompatibleWithProperty("freehand", "shadow")).toBe(true);
  });
});
