import type {
  TextFontStyle,
  TextDecoration,
  TextAlign,
  TextVerticalAlign,
  TextShape,
} from "../types";

export type TextStyleConfig = {
  fontSize: number;
  fontFamily: string;
  fontWeight: string | number;
  fontStyle: TextFontStyle;
  textDecoration: TextDecoration;
  textAlign: TextAlign;
  verticalAlign: TextVerticalAlign;
  fill: string;
  opacity: number;
  padding: number;
  lineHeight: number;
};

export const DEFAULT_TEXT_STYLE: Readonly<TextStyleConfig> = {
  fontSize: 24,
  fontFamily: "Inter",
  fontWeight: "normal",
  fontStyle: "normal",
  textDecoration: "none",
  textAlign: "left",
  verticalAlign: "top",
  fill: "#1f2937",
  opacity: 1,
  padding: 4,
  lineHeight: 1.2,
};

export const AVAILABLE_FONT_FAMILIES = [
  "Inter",
  "Roboto",
  "Arial",
  "Courier New",
  "Georgia",
  "Comic Sans MS",
] as const;

export const AVAILABLE_FONT_SIZES = [12, 16, 20, 24, 32, 48, 64] as const;

/**
 * Checks if a string is considered empty after trimming.
 */
export function isEmptyText(text: string | null | undefined): boolean {
  if (!text) return true;
  return text.trim().length === 0;
}

/**
 * Normalizes text content: removes carriage returns (\r\n -> \n) and trailing linebreaks if needed.
 */
export function normalizeText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

/**
 * Constructs the composite fontStyle string expected by Konva.Text.
 * In Konva, bold and italic are combined into fontStyle (e.g. "bold", "italic", "bold italic", or "normal").
 */
export function getKonvaFontStyle(
  fontWeight: string | number | undefined,
  fontStyle: TextFontStyle | undefined
): string {
  const isBold = fontWeight === "bold" || fontWeight === 700 || fontWeight === "700";
  const isItalic = fontStyle === "italic";

  if (isBold && isItalic) return "italic bold";
  if (isBold) return "bold";
  if (isItalic) return "italic";
  return "normal";
}

/**
 * Estimates bounding dimensions of text in world coordinates purely mathematically,
 * ensuring zero DOM dependency so it runs identically in Node, Vitest, and browser environments.
 */
export function estimateTextDimensions(
  text: string,
  options?: {
    fontSize?: number;
    lineHeight?: number;
    padding?: number;
    minWidth?: number;
    minHeight?: number;
  }
): { width: number; height: number } {
  const fontSize = options?.fontSize ?? DEFAULT_TEXT_STYLE.fontSize;
  const lineHeight = options?.lineHeight ?? DEFAULT_TEXT_STYLE.lineHeight;
  const padding = options?.padding ?? DEFAULT_TEXT_STYLE.padding;
  const minWidth = options?.minWidth ?? 60;
  const minHeight = options?.minHeight ?? 36;

  const lines = normalizeText(text || " ").split("\n");
  const lineCount = Math.max(1, lines.length);

  // Approximate character width for proportional sans-serif fonts (~0.6 of font size)
  const maxCharsPerLine = Math.max(
    ...lines.map((l) => l.length),
    1
  );
  const approxCharWidth = fontSize * 0.6;
  const estimatedContentWidth = maxCharsPerLine * approxCharWidth;
  const estimatedContentHeight = lineCount * fontSize * lineHeight;

  const totalWidth = Math.ceil(estimatedContentWidth + padding * 2);
  const totalHeight = Math.ceil(estimatedContentHeight + padding * 2);

  return {
    width: Math.max(minWidth, totalWidth),
    height: Math.max(minHeight, totalHeight),
  };
}

/**
 * Normalizes partial style inputs against DEFAULT_TEXT_STYLE with boundary limits.
 */
export function normalizeTextStyle(
  style?: Partial<TextStyleConfig>
): TextStyleConfig {
  const fontSize =
    typeof style?.fontSize === "number"
      ? Math.max(8, Math.min(200, style.fontSize))
      : DEFAULT_TEXT_STYLE.fontSize;

  const padding =
    typeof style?.padding === "number"
      ? Math.max(0, Math.min(100, style.padding))
      : DEFAULT_TEXT_STYLE.padding;

  const lineHeight =
    typeof style?.lineHeight === "number"
      ? Math.max(0.5, Math.min(5, style.lineHeight))
      : DEFAULT_TEXT_STYLE.lineHeight;

  const opacity =
    typeof style?.opacity === "number"
      ? Math.max(0, Math.min(1, style.opacity))
      : DEFAULT_TEXT_STYLE.opacity;

  return {
    fontSize,
    fontFamily: style?.fontFamily?.trim() || DEFAULT_TEXT_STYLE.fontFamily,
    fontWeight: style?.fontWeight ?? DEFAULT_TEXT_STYLE.fontWeight,
    fontStyle: style?.fontStyle === "italic" ? "italic" : "normal",
    textDecoration: style?.textDecoration === "underline" ? "underline" : "none",
    textAlign:
      style?.textAlign === "center" || style?.textAlign === "right"
        ? style.textAlign
        : "left",
    verticalAlign:
      style?.verticalAlign === "middle" || style?.verticalAlign === "bottom"
        ? style.verticalAlign
        : "top",
    fill: style?.fill || DEFAULT_TEXT_STYLE.fill,
    opacity,
    padding,
    lineHeight,
  };
}

/**
 * Creates default properties for a new TextShape at (x, y).
 */
export function createDefaultTextShape(
  _canvasId?: string,
  x: number = 0,
  y: number = 0,
  initialText: string = ""
): Omit<TextShape, "id"> {
  const dimensions = estimateTextDimensions(initialText || "Type something...");

  return {
    type: "text",
    x,
    y,
    width: dimensions.width,
    height: dimensions.height,
    rotation: 0,
    zIndex: 1,
    opacity: DEFAULT_TEXT_STYLE.opacity,
    text: initialText,
    fontSize: DEFAULT_TEXT_STYLE.fontSize,
    fontFamily: DEFAULT_TEXT_STYLE.fontFamily,
    fontWeight: DEFAULT_TEXT_STYLE.fontWeight,
    fontStyle: DEFAULT_TEXT_STYLE.fontStyle,
    textDecoration: DEFAULT_TEXT_STYLE.textDecoration,
    textAlign: DEFAULT_TEXT_STYLE.textAlign,
    verticalAlign: DEFAULT_TEXT_STYLE.verticalAlign,
    fill: DEFAULT_TEXT_STYLE.fill,
    padding: DEFAULT_TEXT_STYLE.padding,
    lineHeight: DEFAULT_TEXT_STYLE.lineHeight,
  };
}
