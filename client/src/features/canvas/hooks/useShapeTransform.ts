import { useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import { socketClientService } from "@/services/socket";
import { useCanvasStore } from "../store";
import type { Shape } from "../types";

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
};

export const useShapeTransform = ({
  shape,
  boardId,
}: UseShapeTransformOptions) => {
  const activeTool = useCanvasStore((state) => state.activeTool);
  const selectedShapeIds = useCanvasStore((state) => state.selectedShapeIds);
  const remoteShapeLocks = useCanvasStore((state) => state.remoteShapeLocks);
  const remoteShapeTransforms = useCanvasStore(
    (state) => state.remoteShapeTransforms
  );

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

  const isSelected = selectedShapeIds.includes(shape.id);
  const remoteLock = remoteShapeLocks[shape.id];
  const isLockedByOther = Boolean(remoteLock);
  const remoteTransform = remoteShapeTransforms[shape.id];

  const pendingFrameRef = useRef<TransformValues | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const isLockedBySelfRef = useRef<boolean>(false);

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

      // 2. Commit local state (records exactly ONE undo snapshot)
      if (delta && selectedShapeIds.length > 1) {
        moveSelectedShapes(delta.x, delta.y);
      } else {
        updateShapeTransform(shape.id, finalTransform);
      }

      // 3. Persist final transform and cleanup
      if (boardId && isLockedBySelfRef.current) {
        try {
          await socketClientService.updateShape(shape.id, {
            x: finalTransform.x,
            y: finalTransform.y,
            width: finalTransform.width,
            height: finalTransform.height,
            rotation: finalTransform.rotation,
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
    [boardId, shape.id, selectedShapeIds.length, moveSelectedShapes, updateShapeTransform]
  );

  return {
    activeTool,
    isSelected,
    isLockedByOther,
    remoteLock,
    displayTransform,
    selectShape,
    toggleShapeSelection,
    acquireLock,
    emitTransformFrame,
    endTransform,
  };
};
