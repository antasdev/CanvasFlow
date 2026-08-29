import { useCallback, useEffect, useRef } from "react";
import type Konva from "konva";
import { toast } from "sonner";
import { socketClientService } from "@/services/socket";
import { useCanvasStore } from "../store";
import type { Shape, SelectionMode } from "../types";
import {
  findSmartGuideCandidates,
  calculateSmartGuides,
  type SmartGuideCandidate,
} from "../utils/smart-guides.utils";
import { getShapeWorldAABB } from "../utils/alignment.utils";
import { resolveSelectionWithModifiers } from "../utils/selection-policy.utils";

function getAllDescendantIds(rootId: string, shapes: Shape[]): Set<string> {
  const result = new Set<string>([rootId]);
  let added = true;
  while (added) {
    added = false;
    for (const s of shapes) {
      if (s.parentId && result.has(s.parentId) && !result.has(s.id)) {
        result.add(s.id);
        added = true;
      }
    }
  }
  return result;
}

type UseShapeTransformOptions = {
  shape: Shape;
  boardId?: string;
};

type TransformValues = {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  points?: number[];
};

export const useShapeTransform = ({
  shape,
  boardId,
}: UseShapeTransformOptions) => {
  const activeTool = useCanvasStore((state) => state.activeTool);
  const shapes = useCanvasStore((state) => state.shapes);
  const zoom = useCanvasStore((state) => state.zoom);
  const selectedShapeIds = useCanvasStore((state) => state.selectedShapeIds);
  const remoteShapeLocks = useCanvasStore((state) => state.remoteShapeLocks);
  const remoteShapeTransforms = useCanvasStore(
    (state) => state.remoteShapeTransforms
  );

  const editingGroupId = useCanvasStore((state) => state.editingGroupId);
  const setSelectedShapeIds = useCanvasStore((state) => state.setSelectedShapeIds);
  const selectShape = useCanvasStore((state) => state.selectShape);
  const toggleShapeSelection = useCanvasStore(
    (state) => state.toggleShapeSelection
  );
  const updateShapeTransform = useCanvasStore(
    (state) => state.updateShapeTransform
  );
  const moveSelectedShapes = useCanvasStore(
    (state) => state.moveSelectedShapes
  );
  const setSmartGuides = useCanvasStore((state) => state.setSmartGuides);
  const clearSmartGuides = useCanvasStore((state) => state.clearSmartGuides);

  const isSelected = selectedShapeIds.includes(shape.id);
  const remoteLock = remoteShapeLocks[shape.id];
  const isLockedByOther = Boolean(remoteLock);
  const remoteTransform = remoteShapeTransforms[shape.id];

  const pendingFrameRef = useRef<TransformValues | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const isLockedBySelfRef = useRef<boolean>(false);

  // Smart guide candidate and snap retention caches
  const candidatesRef = useRef<SmartGuideCandidate[]>([]);
  const activeSnapRef = useRef<{ activeGuideX?: string; activeGuideY?: string }>({});

  const startDragGuides = useCallback((): void => {
    const descendants = getAllDescendantIds(shape.id, shapes);
    candidatesRef.current = findSmartGuideCandidates(shape.id, shapes, descendants);
    activeSnapRef.current = {};
  }, [shape.id, shapes]);

  const updateDragGuides = useCallback(
    (tentativeLocalX: number, tentativeLocalY: number): { snappedX: number; snappedY: number } => {
      if (candidatesRef.current.length === 0) {
        setSmartGuides([]);
        return { snappedX: tentativeLocalX, snappedY: tentativeLocalY };
      }

      const tentativeShape: Shape = {
        ...shape,
        x: tentativeLocalX,
        y: tentativeLocalY,
      };
      const movingAABB = getShapeWorldAABB(tentativeShape, shapes);

      const { guides, snapDeltaX, snapDeltaY, matchedGuideX, matchedGuideY } = calculateSmartGuides(
        movingAABB,
        candidatesRef.current,
        zoom,
        activeSnapRef.current
      );

      activeSnapRef.current = {
        activeGuideX: matchedGuideX,
        activeGuideY: matchedGuideY,
      };

      setSmartGuides(guides);

      return {
        snappedX: tentativeLocalX + snapDeltaX,
        snappedY: tentativeLocalY + snapDeltaY,
      };
    },
    [shape, shapes, zoom, setSmartGuides]
  );

  const endDragGuides = useCallback((): void => {
    clearSmartGuides();
    candidatesRef.current = [];
    activeSnapRef.current = {};
  }, [clearSmartGuides]);

  // Compute effective display coordinates
  const isTransformActive =
    isLockedByOther &&
    Boolean(remoteTransform) &&
    Date.now() - (remoteTransform?.lastUpdatedAt ?? 0) < 3000;

  const displayTransform: TransformValues = isTransformActive && remoteTransform
    ? {
        x: remoteTransform.x,
        y: remoteTransform.y,
        width: remoteTransform.width,
        height: remoteTransform.height,
        rotation: remoteTransform.rotation,
      }
    : {
        x: shape.x,
        y: shape.y,
        width: shape.width,
        height: shape.height,
        rotation: shape.rotation,
      };

  // Cleanup pending RAF on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  /**
   * Acquire soft-lock before beginning transformation.
   */
  const acquireLock = useCallback(async (): Promise<boolean> => {
    if (!boardId) {
      isLockedBySelfRef.current = true;
      return true;
    }

    try {
      await socketClientService.lockShape(boardId, shape.id);
      isLockedBySelfRef.current = true;
      return true;
    } catch (err) {
      isLockedBySelfRef.current = false;
      toast.info(
        err instanceof Error
          ? err.message
          : "Shape is currently being edited by another collaborator."
      );
      return false;
    }
  }, [boardId, shape.id]);

  /**
   * Emit high-frequency transformation frame scheduled via requestAnimationFrame.
   */
  const emitTransformFrame = useCallback(
    (transform: TransformValues): void => {
      if (!boardId || !isLockedBySelfRef.current) {
        return;
      }

      pendingFrameRef.current = transform;

      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null;
          if (pendingFrameRef.current) {
            socketClientService.transformShape({
              boardId,
              shapeId: shape.id,
              ...pendingFrameRef.current,
            });
            pendingFrameRef.current = null;
          }
        });
      }
    },
    [boardId, shape.id]
  );

  /**
   * Conclude transformation: cancels pending RAF, commits final state locally,
   * persists to MongoDB, emits shape:transform-end, and releases soft-lock.
   */
  const endTransform = useCallback(
    async (
      finalTransform: TransformValues,
      delta?: { x: number; y: number }
    ): Promise<void> => {
      // 1. Cancel pending RAF frame
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
      pendingFrameRef.current = null;

      // 2. Clear smart guides
      endDragGuides();

      // 3. Commit local state (records exactly ONE undo snapshot)
      if (delta && selectedShapeIds.length > 1) {
        moveSelectedShapes(delta.x, delta.y);
      } else {
        updateShapeTransform(shape.id, finalTransform);
      }

      // 4. Persist final transform and cleanup
      if (boardId && isLockedBySelfRef.current) {
        try {
          await socketClientService.updateShape(shape.id, {
            x: finalTransform.x,
            y: finalTransform.y,
            width: finalTransform.width,
            height: finalTransform.height,
            rotation: finalTransform.rotation,
            points: finalTransform.points,
          });
        } catch (err) {
          toast.error(
            err instanceof Error
              ? err.message
              : "Failed to persist shape transform."
          );
        } finally {
          socketClientService.endShapeTransform(boardId, shape.id);
          socketClientService.unlockShape(boardId, shape.id).catch(() => {});
          isLockedBySelfRef.current = false;
        }
      }
    },
    [boardId, shape.id, selectedShapeIds.length, moveSelectedShapes, updateShapeTransform, endDragGuides]
  );

  /**
   * Handles click selection with platform-safe modifiers (Ctrl/Cmd-toggle, Shift-add, click-replace)
   * and group hierarchy invariant enforcement.
   */
  const handleSelectionClick = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void => {
      const evt = event.evt;
      const isCtrlOrMeta = "ctrlKey" in evt && (evt.ctrlKey || evt.metaKey);
      const isShift = "shiftKey" in evt && evt.shiftKey;
      const mode: SelectionMode = isCtrlOrMeta ? "toggle" : isShift ? "add" : "replace";

      const resolved = resolveSelectionWithModifiers({
        currentSelectedIds: selectedShapeIds,
        hitIds: [shape.id],
        mode,
        shapes,
        editingGroupId,
      });

      setSelectedShapeIds(resolved);
    },
    [shape.id, shapes, selectedShapeIds, editingGroupId, setSelectedShapeIds]
  );

  return {
    activeTool,
    isSelected,
    isLockedByOther,
    remoteLock,
    displayTransform,
    selectShape,
    toggleShapeSelection,
    handleSelectionClick,
    acquireLock,
    emitTransformFrame,
    endTransform,
    startDragGuides,
    updateDragGuides,
    endDragGuides,
  };
};
