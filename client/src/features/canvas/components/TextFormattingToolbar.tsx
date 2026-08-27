import React from "react";
import {
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
} from "lucide-react";
import { toast } from "sonner";
import { socketClientService } from "@/services/socket";
import type { TextShape, TextFontStyle, TextDecoration, TextAlign } from "../types";
import {
  AVAILABLE_FONT_FAMILIES,
  AVAILABLE_FONT_SIZES,
} from "../utils/text.utils";

export type TextFormattingToolbarProps = {
  shape: TextShape;
  pan: { x: number; y: number };
  zoom: number;
  canEditCanvas?: boolean;
  onUpdateFormatting: (shapeId: string, formatting: Partial<TextShape>) => void;
};

export default function TextFormattingToolbar({
  shape,
  pan,
  zoom,
  canEditCanvas = true,
  onUpdateFormatting,
}: TextFormattingToolbarProps): React.JSX.Element | null {
  if (!canEditCanvas) {
    return null;
  }

  // Floating placement: positioned slightly above the text shape
  const left = Math.max(16, shape.x * zoom + pan.x);
  const top = Math.max(16, shape.y * zoom + pan.y - 48);

  const applyFormattingChange = async (
    updates: Partial<TextShape>
  ): Promise<void> => {
    // 1. Optimistically update local Zustand store and record an undo entry
    onUpdateFormatting(shape.id, updates);

    // 2. Persist durable mutation to backend with OCC
    try {
      await socketClientService.updateShape(
        shape.id,
        {
          style: {
            ...updates,
          },
        },
        shape.version
      );
    } catch (err) {
      toast.error(
        err instanceof Error
          ? err.message
          : "Failed to persist formatting change."
      );
    }
  };

  const isBold =
    shape.fontWeight === "bold" ||
    shape.fontWeight === 700 ||
    shape.fontWeight === "700";
  const isItalic = shape.fontStyle === "italic";
  const isUnderline = shape.textDecoration === "underline";

  return (
    <div
      className="absolute z-30 flex items-center gap-1 rounded-lg border border-gray-200 bg-white/95 px-2 py-1.5 shadow-lg backdrop-blur-sm transition-all"
      style={{
        left: `${left}px`,
        top: `${top}px`,
      }}
      onMouseDown={(e) => {
        // Prevent clearing shape selection when clicking toolbar
        e.stopPropagation();
      }}
    >
      {/* Font Family Selector */}
      <select
        value={shape.fontFamily || "Inter"}
        onChange={(e) => applyFormattingChange({ fontFamily: e.target.value })}
        className="h-8 rounded border border-gray-200 bg-white px-2 text-xs font-medium text-gray-700 outline-none hover:border-gray-300 focus:border-blue-500"
        title="Font Family"
      >
        {AVAILABLE_FONT_FAMILIES.map((font) => (
          <option key={font} value={font}>
            {font}
          </option>
        ))}
      </select>

      {/* Font Size Selector */}
      <select
        value={shape.fontSize || 24}
        onChange={(e) =>
          applyFormattingChange({ fontSize: Number(e.target.value) })
        }
        className="h-8 rounded border border-gray-200 bg-white px-1.5 text-xs font-medium text-gray-700 outline-none hover:border-gray-300 focus:border-blue-500"
        title="Font Size"
      >
        {AVAILABLE_FONT_SIZES.map((size) => (
          <option key={size} value={size}>
            {size}px
          </option>
        ))}
      </select>

      <div className="mx-1 h-5 w-px bg-gray-200" />

      {/* Bold Toggle */}
      <button
        type="button"
        onClick={() =>
          applyFormattingChange({
            fontWeight: isBold ? "normal" : "bold",
          })
        }
        className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
          isBold
            ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
            : "text-gray-600 hover:bg-gray-100"
        }`}
        title="Bold"
      >
        <Bold className="h-4 w-4" />
      </button>

      {/* Italic Toggle */}
      <button
        type="button"
        onClick={() =>
          applyFormattingChange({
            fontStyle: (isItalic ? "normal" : "italic") as TextFontStyle,
          })
        }
        className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
          isItalic
            ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
            : "text-gray-600 hover:bg-gray-100"
        }`}
        title="Italic"
      >
        <Italic className="h-4 w-4" />
      </button>

      {/* Underline Toggle */}
      <button
        type="button"
        onClick={() =>
          applyFormattingChange({
            textDecoration: (isUnderline ? "none" : "underline") as TextDecoration,
          })
        }
        className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
          isUnderline
            ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
            : "text-gray-600 hover:bg-gray-100"
        }`}
        title="Underline"
      >
        <Underline className="h-4 w-4" />
      </button>

      <div className="mx-1 h-5 w-px bg-gray-200" />

      {/* Alignment Buttons */}
      <button
        type="button"
        onClick={() =>
          applyFormattingChange({ textAlign: "left" as TextAlign })
        }
        className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
          (shape.textAlign || "left") === "left"
            ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
            : "text-gray-600 hover:bg-gray-100"
        }`}
        title="Align Left"
      >
        <AlignLeft className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() =>
          applyFormattingChange({ textAlign: "center" as TextAlign })
        }
        className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
          shape.textAlign === "center"
            ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
            : "text-gray-600 hover:bg-gray-100"
        }`}
        title="Align Center"
      >
        <AlignCenter className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() =>
          applyFormattingChange({ textAlign: "right" as TextAlign })
        }
        className={`flex h-8 w-8 items-center justify-center rounded transition-colors ${
          shape.textAlign === "right"
            ? "bg-blue-100 text-blue-700 hover:bg-blue-200"
            : "text-gray-600 hover:bg-gray-100"
        }`}
        title="Align Right"
      >
        <AlignRight className="h-4 w-4" />
      </button>

      <div className="mx-1 h-5 w-px bg-gray-200" />

      {/* Color Picker */}
      <label
        className="relative flex h-8 w-8 cursor-pointer items-center justify-center rounded hover:bg-gray-100"
        title="Text Color"
      >
        <span
          className="h-4 w-4 rounded-full border border-gray-300 shadow-sm"
          style={{ backgroundColor: shape.fill || "#1f2937" }}
        />
        <input
          type="color"
          value={shape.fill || "#1f2937"}
          onChange={(e) => applyFormattingChange({ fill: e.target.value })}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </label>
    </div>
  );
}
