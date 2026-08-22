import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { socketClientService } from "@/services/socket";
import type { TextShape, StickyNoteShape } from "../types";

type InlineTextEditorProps = {
  shape: TextShape | StickyNoteShape;
  pan: { x: number; y: number };
  zoom: number;
  boardId?: string;
  onCommit: (shapeId: string, text: string) => void;
  onClose: () => void;
};

export default function InlineTextEditor({
  shape,
  pan,
  zoom,
  boardId,
  onCommit,
  onClose,
}: InlineTextEditorProps): React.JSX.Element {
  const [text, setText] = useState(shape.text);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const isFinishedRef = useRef(false);

  // Calculate screen coordinates from world coordinates + viewport
  const left = shape.x * zoom + pan.x;
  const top = shape.y * zoom + pan.y;
  const width = Math.max(60, shape.width * zoom);
  const height = Math.max(36, shape.height * zoom);
  const fontSize = Math.max(12, shape.fontSize * zoom);

  // Auto-focus and select text on mount
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.focus();
      textarea.select();
    }
  }, []);

  // Heartbeat: refresh soft-lock every 1.5s while editing is active
  useEffect(() => {
    if (!boardId) {
      return;
    }

    const interval = setInterval(() => {
      if (isFinishedRef.current) {
        return;
      }
      socketClientService.refreshShapeLock(boardId, shape.id).catch((err) => {
        console.warn("Failed to refresh shape lock heartbeat:", err);
      });
    }, 1500);

    return (): void => {
      clearInterval(interval);
    };
  }, [boardId, shape.id]);

  const handleFinish = async (shouldCommit: boolean): Promise<void> => {
    if (isFinishedRef.current) {
      return;
    }
    isFinishedRef.current = true;

    if (shouldCommit) {
      const trimmedText = text;
      onCommit(shape.id, trimmedText);

      if (boardId) {
        try {
          await socketClientService.updateShape(shape.id, {
            style: {
              text: trimmedText,
            },
          });
        } catch (err) {
          toast.error(
            err instanceof Error ? err.message : "Failed to persist text update."
          );
        } finally {
          socketClientService.unlockShape(boardId, shape.id).catch(() => {});
        }
      }
    } else {
      if (boardId) {
        socketClientService.unlockShape(boardId, shape.id).catch(() => {});
      }
    }

    onClose();
  };

  const isSticky = shape.type === "sticky_note";

  return (
    <div
      className="absolute pointer-events-auto"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
        transform: shape.rotation ? `rotate(${shape.rotation}deg)` : undefined,
        transformOrigin: "top left",
        zIndex: 40,
      }}
    >
      <textarea
        ref={textareaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => handleFinish(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            handleFinish(false);
          } else if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            handleFinish(true);
          }
        }}
        className="w-full h-full resize-none border-2 border-blue-500 rounded outline-none p-2 shadow-lg leading-tight"
        style={{
          fontSize: `${fontSize}px`,
          fontFamily:
            shape.type === "text"
              ? shape.fontFamily || "Inter, sans-serif"
              : "Inter, sans-serif",
          fontWeight:
            shape.type === "text" ? shape.fontWeight || "normal" : "normal",
          fontStyle:
            shape.type === "text" ? shape.fontStyle || "normal" : "normal",
          textAlign: shape.type === "text" ? shape.textAlign || "left" : "left",
          backgroundColor: isSticky
            ? (shape as StickyNoteShape).backgroundColor || "#fef08a"
            : "#ffffff",
          color: isSticky
            ? (shape as StickyNoteShape).textColor || "#1f2937"
            : (shape as TextShape).fill || "#1f2937",
        }}
      />
    </div>
  );
}
