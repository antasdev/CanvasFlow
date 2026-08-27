import { describe, it, expect } from "vitest";
import {
  getKonvaDash,
  getKonvaStyleProps,
  getMixedStyleValue,
  getShapeStyle,
  DEFAULT_SHADOW,
} from "./shape-style.utils";
import type { RectangleShape, LineShape, TextShape, StickyNoteShape } from "../types/shape.types";

describe("Shape Style Utilities", () => {
  it("resolves Konva dash patterns properly", () => {
    expect(getKonvaDash(undefined)).toBeUndefined();
    expect(getKonvaDash("solid")).toBeUndefined();
    expect(getKonvaDash("dashed")).toEqual([10, 6]);
    expect(getKonvaDash("dotted")).toEqual([3, 5]);
  });

  it("extracts Konva style props from a styled shape", () => {
    const rect: RectangleShape = {
      id: "rect-1",
      type: "rectangle",
      x: 10,
      y: 20,
      width: 100,
      height: 80,
      rotation: 0,
      zIndex: 1,
      opacity: 0.9,
      fill: "#3b82f6",
      stroke: "#1d4ed8",
      strokeWidth: 4,
      strokeStyle: "dashed",
      shadow: {
        enabled: true,
        color: "#111827",
        blur: 20,
        offsetX: 4,
        offsetY: 6,
        opacity: 0.4,
      },
    };

    const props = getKonvaStyleProps(rect);
    expect(props.fill).toBe("#3b82f6");
    expect(props.stroke).toBe("#1d4ed8");
    expect(props.strokeWidth).toBe(4);
    expect(props.dash).toEqual([10, 6]);
    expect(props.opacity).toBe(0.9);
    expect(props.shadowEnabled).toBe(true);
    expect(props.shadowColor).toBe("#111827");
    expect(props.shadowBlur).toBe(20);
    expect(props.shadowOffset).toEqual({ x: 4, y: 6 });
    expect(props.shadowOpacity).toBe(0.4);
  });

  it("handles shapes with missing shadow gracefully with defaults", () => {
    const line: LineShape = {
      id: "line-1",
      type: "line",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: 1,
      opacity: 1,
      points: [0, 0, 100, 100],
      stroke: "#000000",
      strokeWidth: 2,
    };

    const props = getKonvaStyleProps(line);
    expect(props.shadowEnabled).toBe(false);
    expect(props.shadowBlur).toBe(DEFAULT_SHADOW.blur);
  });

  it("determines mixed vs uniform values across multiple shapes", () => {
    const rectA: RectangleShape = {
      id: "1",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      rotation: 0,
      zIndex: 1,
      opacity: 1,
      fill: "#ff0000",
      stroke: "#000000",
      strokeWidth: 2,
    };
    const rectB: RectangleShape = {
      id: "2",
      type: "rectangle",
      x: 20,
      y: 20,
      width: 10,
      height: 10,
      rotation: 0,
      zIndex: 2,
      opacity: 1,
      fill: "#ff0000",
      stroke: "#000000",
      strokeWidth: 2,
    };
    const rectC: RectangleShape = {
      id: "3",
      type: "rectangle",
      x: 40,
      y: 40,
      width: 10,
      height: 10,
      rotation: 0,
      zIndex: 3,
      opacity: 1,
      fill: "#00ff00",
      stroke: "#000000",
      strokeWidth: 4,
    };

    // Homogeneous fill between A and B
    const uniformFill = getMixedStyleValue([rectA, rectB], (s) => (s as RectangleShape).fill);
    expect(uniformFill.isMixed).toBe(false);
    expect(uniformFill.value).toBe("#ff0000");

    // Heterogeneous fill between A and C
    const mixedFill = getMixedStyleValue([rectA, rectC], (s) => (s as RectangleShape).fill);
    expect(mixedFill.isMixed).toBe(true);
    expect(mixedFill.value).toBeUndefined();

    // Homogeneous stroke between A, B, C
    const uniformStroke = getMixedStyleValue([rectA, rectB, rectC], (s) => (s as RectangleShape).stroke);
    expect(uniformStroke.isMixed).toBe(false);
    expect(uniformStroke.value).toBe("#000000");
  });

  it("extracts ShapeStyle cleanly from discriminated Shape union", () => {
    const rectangle: RectangleShape = {
      id: "r1",
      type: "rectangle",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: 0,
      opacity: 0.9,
      fill: "#ff0000",
      stroke: "#000000",
      strokeWidth: 4,
      strokeStyle: "dashed",
      shadow: { enabled: true, color: "#111111", blur: 8, offsetX: 2, offsetY: 4, opacity: 0.5 },
    };

    const rectStyle = getShapeStyle(rectangle);
    expect(rectStyle.fill).toBe("#ff0000");
    expect(rectStyle.stroke).toBe("#000000");
    expect(rectStyle.strokeWidth).toBe(4);
    expect(rectStyle.strokeStyle).toBe("dashed");
    expect(rectStyle.opacity).toBe(0.9);
    expect(rectStyle.shadow?.enabled).toBe(true);

    const line: LineShape = {
      id: "l1",
      type: "line",
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: 0,
      opacity: 1,
      points: [0, 0, 100, 100],
      stroke: "#3b82f6",
      strokeWidth: 2,
      strokeStyle: "dotted",
    };

    const lineStyle = getShapeStyle(line);
    expect(lineStyle.stroke).toBe("#3b82f6");
    expect(lineStyle.strokeWidth).toBe(2);
    expect(lineStyle.strokeStyle).toBe("dotted");
    expect(lineStyle.fill).toBeUndefined();

    const text: TextShape = {
      id: "t1",
      type: "text",
      x: 0,
      y: 0,
      width: 100,
      height: 40,
      rotation: 0,
      zIndex: 0,
      opacity: 1,
      text: "Sample",
      fontSize: 18,
      fontFamily: "Inter",
      fontWeight: "bold",
      fontStyle: "normal",
      textDecoration: "none",
      textAlign: "center",
      verticalAlign: "middle",
      fill: "#1f2937",
      padding: 4,
      lineHeight: 1.2,
    };

    const textStyle = getShapeStyle(text);
    expect(textStyle.fill).toBe("#1f2937");
    expect(textStyle.fontSize).toBe(18);
    expect(textStyle.fontFamily).toBe("Inter");

    const note: StickyNoteShape = {
      id: "s1",
      type: "sticky_note",
      x: 0,
      y: 0,
      width: 120,
      height: 120,
      rotation: 0,
      zIndex: 0,
      opacity: 1,
      text: "Note",
      fontSize: 16,
      backgroundColor: "#fef08a",
      textColor: "#000000",
    };

    const noteStyle = getShapeStyle(note);
    expect(noteStyle.backgroundColor).toBe("#fef08a");
    expect(noteStyle.textColor).toBe("#000000");
  });
});
