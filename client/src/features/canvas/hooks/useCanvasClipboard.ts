import { useCallback, useEffect } from "react";
import { toast } from "sonner";
import { socketClientService } from "@/services/socket";
import type { PasteShapeItemPayload } from "@/services/socket";
import { mapShapeResponseToShape } from "../api";
import { clipboardService } from "../services/clipboard.service";
import { useCanvasStore } from "../store";
import type {
  Shape,
  ConnectorShape,
  PolygonShape,
  StarShape,
  FreehandShape,
  LineShape,
  ArrowShape,
  TextShape,
  StickyNoteShape,
} from "../types";
import {
  extractClipboardSceneGraph,
  cloneSceneGraphWithNewIds,
} from "../utils/clipboard.utils";
import { getShapeStyle } from "../utils/shape-style.utils";

type UseCanvasClipboardProps = {
  boardId?: string;
  canvasId?: string;
  canEditCanvas?: boolean;
  isEditingText?: boolean;
};

/**
 * Checks whether the current event target is an active text input context.
 */
function isTextInputContext(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName;
  return (
    tagName === "INPUT" ||
    tagName === "TEXTAREA" ||
    target.isContentEditable ||
    target.closest("[contenteditable='true']") !== null
  );
}

/**
 * Converts a client Shape entity into a server-compatible PasteShapeItemPayload.
 */
function mapShapeToPastePayload(shape: Shape): PasteShapeItemPayload {
  const basePayload: PasteShapeItemPayload = {
    tempId: shape.id,
    type: shape.type,
    x: shape.x,
    y: shape.y,
    width: shape.width,
    height: shape.height,
    rotation: shape.rotation ?? 0,
    parentId: shape.parentId ?? null,
  };

  // Type-safe property extraction based on shape variant
  if (shape.type === "text") {
    const textShape = shape as TextShape;
    basePayload.text = textShape.text;
  } else if (shape.type === "sticky_note") {
    const stickyShape = shape as StickyNoteShape;
    basePayload.text = stickyShape.text;
  }

  if (
    shape.type === "line" ||
    shape.type === "arrow" ||
    shape.type === "freehand"
  ) {
    const vectorShape = shape as LineShape | ArrowShape | FreehandShape;
    basePayload.points = vectorShape.points;
  }

  if (shape.type === "connector") {
    const connShape = shape as ConnectorShape;
    if (connShape.connector) {
      basePayload.connector = {
        sourceShapeId: connShape.connector.sourceShapeId ?? null,
        sourceAnchor: connShape.connector.sourceAnchor ?? null,
        targetShapeId: connShape.connector.targetShapeId ?? null,
        targetAnchor: connShape.connector.targetAnchor ?? null,
        routing: connShape.connector.routing ?? "straight",
      };
    }
  }

  if (shape.type === "polygon") {
    const poly = shape as PolygonShape;
    if (poly.shapeConfig) {
      basePayload.shapeConfig = {
        sides: poly.shapeConfig.sides,
      };
    }
  }

  if (shape.type === "star") {
    const star = shape as StarShape;
    if (star.shapeConfig) {
      basePayload.shapeConfig = {
        points: star.shapeConfig.points,
        innerRadiusRatio: star.shapeConfig.innerRadiusRatio,
      };
    }
  }

  const extractedStyle = getShapeStyle(shape);
  if (extractedStyle && Object.keys(extractedStyle).length > 0) {
    basePayload.style = extractedStyle as Record<string, unknown>;
  }

  return basePayload;
}

export function useCanvasClipboard({
  canvasId,
  canEditCanvas = true,
  isEditingText = false,
}: UseCanvasClipboardProps): {
  handleCopy: () => Promise<void>;
  handlePaste: () => Promise<void>;
  handleDuplicate: () => Promise<void>;
} {
  const shapes = useCanvasStore((state) => state.shapes);
  const selectedShapeIds = useCanvasStore((state) => state.selectedShapeIds);
  const editingGroupId = useCanvasStore((state) => state.editingGroupId);

  const pasteClonedShapes = useCanvasStore((state) => state.pasteClonedShapes);
  const reconcileAuthoritativePastedShapes = useCanvasStore(
    (state) => state.reconcileAuthoritativePastedShapes
  );
  const rollbackOptimisticPaste = useCanvasStore(
    (state) => state.rollbackOptimisticPaste
  );

  /**
   * Copy current selection to clipboard.
   */
  const handleCopy = useCallback(async (): Promise<void> => {
    if (selectedShapeIds.length === 0) {
      return;
    }

    const extracted = extractClipboardSceneGraph(selectedShapeIds, shapes);
    if (extracted.length === 0) {
      return;
    }

    await clipboardService.copy(extracted, canvasId ?? "default_canvas");
    toast.success(`Copied ${extracted.length} shape${extracted.length > 1 ? "s" : ""}`);
  }, [selectedShapeIds, shapes, canvasId]);

  /**
   * Paste content from clipboard onto canvas.
   */
  const handlePaste = useCallback(async (): Promise<void> => {
    if (!canEditCanvas || !canvasId) {
      return;
    }

    const clipboardData = await clipboardService.read();
    if (!clipboardData || clipboardData.shapes.length === 0) {
      return;
    }

    const pasteCount = clipboardService.incrementConsecutivePasteCount();
    const destinationGroup = editingGroupId
      ? shapes.find((s) => s.id === editingGroupId)
      : null;

    const { shapes: clonedShapes, rootIds } = cloneSceneGraphWithNewIds(
      clipboardData.shapes,
      pasteCount,
      editingGroupId,
      destinationGroup
    );

    if (clonedShapes.length === 0) {
      return;
    }

    // 1. Optimistic local paste (1 undo snapshot recorded)
    pasteClonedShapes(clonedShapes, rootIds);

    // 2. Build backend payload and dispatch socket mutation
    const itemsPayload = clonedShapes.map(mapShapeToPastePayload);

    try {
      const ack = await socketClientService.pasteShapes(
        canvasId,
        itemsPayload,
        editingGroupId
      );

      // 3. Reconcile temporary IDs with authoritative server IDs
      const authoritativeShapes = ack.shapes.map(mapShapeResponseToShape);
      reconcileAuthoritativePastedShapes(ack.idMap, authoritativeShapes);
    } catch (err) {
      // 4. Rollback optimistic paste on failure
      rollbackOptimisticPaste(clonedShapes.map((s) => s.id));
      toast.error(err instanceof Error ? err.message : "Failed to paste shapes.");
    }
  }, [
    canEditCanvas,
    canvasId,
    editingGroupId,
    shapes,
    pasteClonedShapes,
    reconcileAuthoritativePastedShapes,
    rollbackOptimisticPaste,
  ]);

  /**
   * Duplicate selection atomically without polluting system clipboard text.
   */
  const handleDuplicate = useCallback(async (): Promise<void> => {
    if (!canEditCanvas || !canvasId || selectedShapeIds.length === 0) {
      return;
    }

    const extracted = extractClipboardSceneGraph(selectedShapeIds, shapes);
    if (extracted.length === 0) {
      return;
    }

    const destinationGroup = editingGroupId
      ? shapes.find((s) => s.id === editingGroupId)
      : null;

    // Duplicate always applies offset 1
    const { shapes: clonedShapes, rootIds } = cloneSceneGraphWithNewIds(
      extracted,
      1,
      editingGroupId,
      destinationGroup
    );

    if (clonedShapes.length === 0) {
      return;
    }

    // 1. Optimistic local paste (1 undo snapshot)
    pasteClonedShapes(clonedShapes, rootIds);

    const itemsPayload = clonedShapes.map(mapShapeToPastePayload);

    try {
      const ack = await socketClientService.pasteShapes(
        canvasId,
        itemsPayload,
        editingGroupId
      );

      const authoritativeShapes = ack.shapes.map(mapShapeResponseToShape);
      reconcileAuthoritativePastedShapes(ack.idMap, authoritativeShapes);
    } catch (err) {
      rollbackOptimisticPaste(clonedShapes.map((s) => s.id));
      toast.error(err instanceof Error ? err.message : "Failed to duplicate shapes.");
    }
  }, [
    canEditCanvas,
    canvasId,
    selectedShapeIds,
    editingGroupId,
    shapes,
    pasteClonedShapes,
    reconcileAuthoritativePastedShapes,
    rollbackOptimisticPaste,
  ]);

  // Global keyboard shortcuts listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      // Protect active native text editing context
      if (isEditingText || isTextInputContext(e.target)) {
        return;
      }

      const isMac = typeof navigator !== "undefined" && /Mac|iPod|iPhone|iPad/.test(navigator.userAgent);
      const isCmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;

      if (!isCmdOrCtrl) {
        return;
      }

      const key = e.key.toLowerCase();

      if (key === "c") {
        e.preventDefault();
        void handleCopy();
      } else if (key === "v") {
        e.preventDefault();
        void handlePaste();
      } else if (key === "d") {
        e.preventDefault();
        void handleDuplicate();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleCopy, handlePaste, handleDuplicate, isEditingText]);

  return {
    handleCopy,
    handlePaste,
    handleDuplicate,
  };
}
