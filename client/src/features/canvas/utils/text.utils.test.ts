import { describe, it, expect } from "vitest";
import {
  isEmptyText,
  normalizeText,
  getKonvaFontStyle,
  estimateTextDimensions,
  normalizeTextStyle,
  createDefaultTextShape,
  DEFAULT_TEXT_STYLE,
} from "./text.utils";

describe("text.utils", () => {
  describe("isEmptyText", () => {
    it("identifies null and undefined as empty", () => {
      expect(isEmptyText(null)).toBe(true);
      expect(isEmptyText(undefined)).toBe(true);
    });

    it("identifies empty strings and whitespace-only strings as empty", () => {
      expect(isEmptyText("")).toBe(true);
      expect(isEmptyText("   ")).toBe(true);
      expect(isEmptyText("\n\t  \r\n")).toBe(true);
    });

    it("identifies non-empty text correctly", () => {
      expect(isEmptyText("Hello")).toBe(false);
      expect(isEmptyText("  Hello  ")).toBe(false);
      expect(isEmptyText("a")).toBe(false);
    });
  });

  describe("normalizeText", () => {
    it("converts CRLF to LF", () => {
      expect(normalizeText("line 1\r\nline 2\r\nline 3")).toBe("line 1\nline 2\nline 3");
    });

    it("converts CR to LF", () => {
      expect(normalizeText("line 1\rline 2")).toBe("line 1\nline 2");
    });

    it("leaves standard LF unchanged", () => {
      expect(normalizeText("line 1\nline 2")).toBe("line 1\nline 2");
    });
  });

  describe("getKonvaFontStyle", () => {
    it("returns normal when no bold or italic", () => {
      expect(getKonvaFontStyle("normal", "normal")).toBe("normal");
      expect(getKonvaFontStyle(400, "normal")).toBe("normal");
      expect(getKonvaFontStyle(undefined, undefined)).toBe("normal");
    });

    it("returns bold when only bold is active", () => {
      expect(getKonvaFontStyle("bold", "normal")).toBe("bold");
      expect(getKonvaFontStyle(700, "normal")).toBe("bold");
      expect(getKonvaFontStyle("700", "normal")).toBe("bold");
    });

    it("returns italic when only italic is active", () => {
      expect(getKonvaFontStyle("normal", "italic")).toBe("italic");
    });

    it("returns 'italic bold' when both bold and italic are active", () => {
      expect(getKonvaFontStyle("bold", "italic")).toBe("italic bold");
      expect(getKonvaFontStyle(700, "italic")).toBe("italic bold");
    });
  });

  describe("estimateTextDimensions", () => {
    it("calculates dimensions with sensible minimums", () => {
      const emptyDims = estimateTextDimensions("");
      expect(emptyDims.width).toBeGreaterThanOrEqual(60);
      expect(emptyDims.height).toBeGreaterThanOrEqual(36);
    });

    it("expands height with multiline text", () => {
      const singleLine = estimateTextDimensions("Hello World");
      const multiLine = estimateTextDimensions("Hello World\nSecond Line\nThird Line");

      expect(multiLine.height).toBeGreaterThan(singleLine.height);
    });

    it("expands width with longer text", () => {
      const shortText = estimateTextDimensions("Hi");
      const longText = estimateTextDimensions("This is a much longer paragraph of text to measure");

      expect(longText.width).toBeGreaterThan(shortText.width);
    });

    it("accounts for padding and fontSize", () => {
      const smallFont = estimateTextDimensions("Text", { fontSize: 12, padding: 4 });
      const bigFont = estimateTextDimensions("Text", { fontSize: 48, padding: 4 });

      expect(bigFont.width).toBeGreaterThan(smallFont.width);
      expect(bigFont.height).toBeGreaterThan(smallFont.height);
    });
  });

  describe("normalizeTextStyle", () => {
    it("returns default values when empty style provided", () => {
      const normalized = normalizeTextStyle({});
      expect(normalized.fontSize).toBe(DEFAULT_TEXT_STYLE.fontSize);
      expect(normalized.fontFamily).toBe(DEFAULT_TEXT_STYLE.fontFamily);
      expect(normalized.fontWeight).toBe(DEFAULT_TEXT_STYLE.fontWeight);
      expect(normalized.fontStyle).toBe(DEFAULT_TEXT_STYLE.fontStyle);
      expect(normalized.textDecoration).toBe(DEFAULT_TEXT_STYLE.textDecoration);
      expect(normalized.textAlign).toBe(DEFAULT_TEXT_STYLE.textAlign);
      expect(normalized.verticalAlign).toBe(DEFAULT_TEXT_STYLE.verticalAlign);
      expect(normalized.fill).toBe(DEFAULT_TEXT_STYLE.fill);
      expect(normalized.opacity).toBe(DEFAULT_TEXT_STYLE.opacity);
      expect(normalized.padding).toBe(DEFAULT_TEXT_STYLE.padding);
      expect(normalized.lineHeight).toBe(DEFAULT_TEXT_STYLE.lineHeight);
    });

    it("clamps fontSize within 8-200", () => {
      expect(normalizeTextStyle({ fontSize: 2 }).fontSize).toBe(8);
      expect(normalizeTextStyle({ fontSize: 500 }).fontSize).toBe(200);
      expect(normalizeTextStyle({ fontSize: 32 }).fontSize).toBe(32);
    });

    it("clamps padding within 0-100", () => {
      expect(normalizeTextStyle({ padding: -10 }).padding).toBe(0);
      expect(normalizeTextStyle({ padding: 150 }).padding).toBe(100);
    });

    it("clamps opacity within 0-1", () => {
      expect(normalizeTextStyle({ opacity: -0.5 }).opacity).toBe(0);
      expect(normalizeTextStyle({ opacity: 2 }).opacity).toBe(1);
    });

    it("normalizes textAlign and verticalAlign", () => {
      expect(normalizeTextStyle({ textAlign: "center" }).textAlign).toBe("center");
      expect(normalizeTextStyle({ textAlign: "right" }).textAlign).toBe("right");
      expect(normalizeTextStyle({ verticalAlign: "middle" }).verticalAlign).toBe("middle");
      expect(normalizeTextStyle({ verticalAlign: "bottom" }).verticalAlign).toBe("bottom");
    });
  });

  describe("createDefaultTextShape", () => {
    it("creates a well-formed TextShape object with defaults", () => {
      const shape = createDefaultTextShape("canvas-123", 100, 200, "Sample Text");
      expect(shape.type).toBe("text");
      expect(shape.x).toBe(100);
      expect(shape.y).toBe(200);
      expect(shape.text).toBe("Sample Text");
      expect(shape.width).toBeGreaterThan(0);
      expect(shape.height).toBeGreaterThan(0);
      expect(shape.fontSize).toBe(24);
      expect(shape.fontStyle).toBe("normal");
      expect(shape.textDecoration).toBe("none");
      expect(shape.textAlign).toBe("left");
    });
  });
});
