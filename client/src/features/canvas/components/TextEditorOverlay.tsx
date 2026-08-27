import React, { useEffect, useRef, useState } from "react";
import type { TextShape, StickyNoteShape } from "../types";
import { socketClientService } from "@/services/socket";
import {
  DEFAULT_TEXT_STYLE,
  estimateTextDimensions,
  isEmptyText,
  normalizeTextStyle,
} from "../utils/text.utils";

export type TextEditorOverlayProps = {
  shape?: TextShape | StickyNoteShape | null;
  worldPosition?: { x: number; y: number } | null;
  initialText?: string;
  pan: { x: number; y: number };
  zoom: number;
  boardId?: string;
  onCommit: (text: string) => void;
  onDiscard: () => void;
};

export default function TextEditorOverlay({
  shape,
  worldPosition,
  initialText = "",
  pan,
  zoom,
  boardId,
  onCommit,
  onDiscard,
}: TextEditorOverlayProps): React.JSX.Element {
  const [text, setText] = useState<string>(() => {
    if (shape && "text" in shape) {
      return shape.text || "";
    }
    return initialText;
  });

  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isFinishedRef = useRef<boolean>(false);
  const isComposingRef = useRef<boolean>(false);

  const isSticky = shape?.type === "sticky_note";
  const isExistingShape = Boolean(shape?.id);

  // Auto-focus and select all text on mount
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.focus();
      textarea.select();
    }
  }, []);

  // Heartbeat: refresh soft-lock every 1.5s while editing an existing shape
  useEffect(() => {
    if (!boardId || !shape?.id) {
      return;
    }

    const interval = setInterval(() => {
      if (isFinishedRef.current) {
        return;
      }
      socketClientService.refreshShapeLock(boardId, shape.id).catch(() => {});
    }, 1500);

    return (): void => {
      clearInterval(interval);
    };
  }, [boardId, shape?.id]);

  const handleFinish = (shouldCommit: boolean): void => {
    if (isFinishedRef.current) {
      return;
    }

    if (isComposingRef.current) {
      return;
    }

    isFinishedRef.current = true;

    if (shape?.id && boardId) {
      socketClientService.unlockShape(boardId, shape.id).catch(() => {});
    }

    if (shouldCommit) {
      // If this is a new text creation and text is blank, discard cleanly
      if (!isExistingShape && isEmptyText(text)) {
        onDiscard();
        return;
      }
      onCommit(text);
    } else {
      onDiscard();
    }
  };

  // Resolve world position and styling
  const worldX = shape ? shape.x : worldPosition?.x ?? 0;
  const worldY = shape ? shape.y : worldPosition?.y ?? 0;
  const rotation = shape?.rotation ?? 0;

  const styleConfig = isSticky
    ? {
        fontSize: (shape as StickyNoteShape).fontSize || 20,
        fontFamily: "Inter, sans-serif",
        fontWeight: "normal",
        fontStyle: "normal" as const,
        textDecoration: "none" as const,
        textAlign: "left" as const,
        verticalAlign: "top" as const,
        fill: (shape as StickyNoteShape).textColor || "#1f2937",
        backgroundColor: (shape as StickyNoteShape).backgroundColor || "#fef08a",
        opacity: shape?.opacity ?? 1,
        padding: 8,
        lineHeight: 1.3,
      }
    : shape && shape.type === "text"
    ? {
        ...normalizeTextStyle(shape),
        backgroundColor: "transparent",
      }
    : {
        ...DEFAULT_TEXT_STYLE,
        backgroundColor: "transparent",
      };

  // Screen coordinates
  const left = worldX * zoom + pan.x;
  const top = worldY * zoom + pan.y;

  // Dynamic dimension calculation with zoom scaling
  const minWidth = shape ? Math.max(60, shape.width) : 160;
  const minHeight = shape ? Math.max(36, shape.height) : 40;
  const estimatedDims = estimateTextDimensions(text || "Type something...", {
    fontSize: styleConfig.fontSize,
    lineHeight: styleConfig.lineHeight,
    padding: styleConfig.padding,
    minWidth,
    minHeight,
  });

  const width = Math.max(minWidth * zoom, estimatedDims.width * zoom);
  const height = Math.max(minHeight * zoom, estimatedDims.height * zoom);
  const screenFontSize = Math.max(12, styleConfig.fontSize * zoom);

  return (
    <div
      className="absolute pointer-events-auto"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        transform: rotation ? `rotate(${rotation}deg)` : undefined,
        transformOrigin: "top left",
        zIndex: 50,
      }}
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => handleFinish(true)}
        onCompositionStart={() => {
          isComposingRef.current = true;
        }}
        onCompositionEnd={() => {
          isComposingRef.current = false;
        }}
        onKeyDown={(e) => {
          // Keyboard Isolation: Stop canvas shortcut interception (e.g. Delete, Backspace, Ctrl+A)
          e.stopPropagation();

          if (isComposingRef.current) {
            return;
          }

          if (e.key === "Escape") {
            e.preventDefault();
            handleFinish(false);
          } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleFinish(true);
          }
        }}
        className={`w-full h-full resize-none border-2 border-blue-500 rounded outline-none shadow-xl ${
          isSticky ? "shadow-md" : "bg-white/95"
        }`}
        style={{
          fontSize: `${screenFontSize}px`,
          fontFamily: styleConfig.fontFamily,
          fontWeight: styleConfig.fontWeight,
          fontStyle: styleConfig.fontStyle,
          textDecoration: styleConfig.textDecoration,
          textAlign: styleConfig.textAlign,
          lineHeight: styleConfig.lineHeight,
          color: styleConfig.fill,
          backgroundColor: styleConfig.backgroundColor,
          padding: `${styleConfig.padding * zoom}px`,
          boxSizing: "border-box",
        }}
        placeholder="Type something..."
      />
    </div>
  );
}
