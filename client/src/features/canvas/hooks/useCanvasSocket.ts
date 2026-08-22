import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { socketClientService, SocketEvents } from "@/services/socket";
import type {
  CanvasSyncPayload,
  CursorMovedPayload,
  SelectionChangedPayload,
  ShapeLockedPayload,
  ShapeResponseDto,
  ShapeTransformEndPayload,
  ShapeTransformingPayload,
  ShapeUnlockedPayload,
  UserJoinedPayload,
  UserLeftPayload,
} from "@/services/socket";
import { mapShapeResponseToShape } from "../api";
import { useCanvasStore } from "../store";

/**
 * Custom hook managing real-time collaboration Socket.IO subscriptions for a canvas.
 * Dispatches remote events into the local Zustand store using dedicated remote actions
 * that isolate remote updates from local undo/redo stacks.
 *
 * @param boardId - Active board identifier
 * @param canvasId - Optional active canvas identifier
 */
export const useCanvasSocket = (
  boardId?: string,
  canvasId?: string
): void => {
  const setShapes = useCanvasStore((state) => state.setShapes);
  const applyRemoteShapeCreated = useCanvasStore(
    (state) => state.applyRemoteShapeCreated
  );
  const applyRemoteShapeUpdated = useCanvasStore(
    (state) => state.applyRemoteShapeUpdated
  );
  const applyRemoteShapeDeleted = useCanvasStore(
    (state) => state.applyRemoteShapeDeleted
  );
  const setRemoteCursor = useCanvasStore(
    (state) => state.setRemoteCursor
  );
  const removeRemoteCursor = useCanvasStore(
    (state) => state.removeRemoteCursor
  );
  const clearRemoteCursors = useCanvasStore(
    (state) => state.clearRemoteCursors
  );
  const setRemoteSelection = useCanvasStore(
    (state) => state.setRemoteSelection
  );
  const removeRemoteSelection = useCanvasStore(
    (state) => state.removeRemoteSelection
  );
  const clearRemoteSelections = useCanvasStore(
    (state) => state.clearRemoteSelections
  );
  const setRemoteShapeLock = useCanvasStore(
    (state) => state.setRemoteShapeLock
  );
  const removeRemoteShapeLock = useCanvasStore(
    (state) => state.removeRemoteShapeLock
  );
  const clearRemoteShapeLocks = useCanvasStore(
    (state) => state.clearRemoteShapeLocks
  );
  const setRemoteShapeTransform = useCanvasStore(
    (state) => state.setRemoteShapeTransform
  );
  const removeRemoteShapeTransform = useCanvasStore(
    (state) => state.removeRemoteShapeTransform
  );
  const clearRemoteShapeTransforms = useCanvasStore(
    (state) => state.clearRemoteShapeTransforms
  );

  const activeBoardIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!boardId) {
      return;
    }

    const socket = socketClientService.connect();
    activeBoardIdRef.current = boardId;

    // 1. Join board collaboration room
    socketClientService
      .joinBoard(boardId, canvasId)
      .catch((err) => {
        toast.error(
          err instanceof Error
            ? err.message
            : "Failed to join collaboration room."
        );
      });

    // 2. Handle canonical canvas sync on joining
    const handleCanvasSync = (payload: CanvasSyncPayload): void => {
      if (payload.boardId === boardId) {
        const mapped = payload.shapes.map(
          mapShapeResponseToShape
        );
        setShapes(mapped);
      }
    };

    // 3. Handle remote shape creation
    const handleShapeCreated = (shapeDto: ShapeResponseDto): void => {
      const shape = mapShapeResponseToShape(shapeDto);
      applyRemoteShapeCreated(shape);
    };

    // 4. Handle remote shape update (transform, move, resize, rotate, text edit)
    const handleShapeUpdated = (shapeDto: ShapeResponseDto): void => {
      const shape = mapShapeResponseToShape(shapeDto);
      applyRemoteShapeUpdated(shape);
      removeRemoteShapeTransform(shapeDto.id);
    };

    // 5. Handle remote shape deletion
    const handleShapeDeleted = (payload: { shapeId: string }): void => {
      applyRemoteShapeDeleted(payload.shapeId);
      removeRemoteShapeTransform(payload.shapeId);
    };

    // 6. Handle collaborator cursor movement
    const handleCursorMoved = (payload: CursorMovedPayload): void => {
      if (payload.boardId === boardId) {
        setRemoteCursor(payload);
      }
    };

    // 7. Handle collaborator selection changes
    const handleSelectionChanged = (payload: SelectionChangedPayload): void => {
      if (payload.boardId === boardId) {
        setRemoteSelection(payload);
      }
    };

    // 8. Handle collaborator shape soft-locking
    const handleShapeLocked = (payload: ShapeLockedPayload): void => {
      if (payload.boardId === boardId) {
        setRemoteShapeLock(payload);
      }
    };

    const handleShapeUnlocked = (payload: ShapeUnlockedPayload): void => {
      if (payload.boardId === boardId) {
        removeRemoteShapeLock(payload.shapeId);
        removeRemoteShapeTransform(payload.shapeId);
      }
    };

    // 9. Handle collaborator live transformation streaming
    const handleShapeTransforming = (
      payload: ShapeTransformingPayload
    ): void => {
      if (payload.boardId === boardId) {
        setRemoteShapeTransform({
          ...payload,
          lastUpdatedAt: Date.now(),
        });
      }
    };

    const handleShapeTransformEnd = (
      payload: ShapeTransformEndPayload
    ): void => {
      if (payload.boardId === boardId) {
        removeRemoteShapeTransform(payload.shapeId);
      }
    };

    // 10. Handle presence broadcasts
    const handleUserJoined = (payload: UserJoinedPayload): void => {
      console.log(`[Presence] User joined board: ${payload.userId}`);
    };

    const handleUserLeft = (payload: UserLeftPayload): void => {
      console.log(`[Presence] User left board: ${payload.userId}`);
      removeRemoteCursor(payload.userId);
      removeRemoteSelection(payload.userId);

      // Clean up any locks held by departing user
      const locks = useCanvasStore.getState().remoteShapeLocks;
      for (const [shapeId, lock] of Object.entries(locks)) {
        if (lock.userId === payload.userId) {
          removeRemoteShapeLock(shapeId);
        }
      }

      // Clean up any transforms held by departing user
      const transforms = useCanvasStore.getState().remoteShapeTransforms;
      for (const [shapeId, transform] of Object.entries(transforms)) {
        if (transform.userId === payload.userId) {
          removeRemoteShapeTransform(shapeId);
        }
      }
    };

    // 11. Periodic Stale Transform Cleanup (3000ms threshold)
    const staleCleanupInterval = setInterval(() => {
      const transforms = useCanvasStore.getState().remoteShapeTransforms;
      const now = Date.now();
      for (const [shapeId, transform] of Object.entries(transforms)) {
        if (now - transform.lastUpdatedAt > 3000) {
          removeRemoteShapeTransform(shapeId);
        }
      }
    }, 1000);

    socket.on(SocketEvents.CANVAS_SYNC, handleCanvasSync);
    socket.on(SocketEvents.SHAPE_CREATED, handleShapeCreated);
    socket.on(SocketEvents.SHAPE_UPDATED, handleShapeUpdated);
    socket.on(SocketEvents.SHAPE_DELETED, handleShapeDeleted);
    socket.on(SocketEvents.CURSOR_MOVED, handleCursorMoved);
    socket.on(SocketEvents.SELECTION_CHANGED, handleSelectionChanged);
    socket.on(SocketEvents.SHAPE_LOCKED, handleShapeLocked);
    socket.on(SocketEvents.SHAPE_UNLOCKED, handleShapeUnlocked);
    socket.on(SocketEvents.SHAPE_TRANSFORMING, handleShapeTransforming);
    socket.on(SocketEvents.SHAPE_TRANSFORM_END, handleShapeTransformEnd);
    socket.on(SocketEvents.USER_JOINED, handleUserJoined);
    socket.on(SocketEvents.USER_LEFT, handleUserLeft);

    return () => {
      clearInterval(staleCleanupInterval);
      socket.off(SocketEvents.CANVAS_SYNC, handleCanvasSync);
      socket.off(SocketEvents.SHAPE_CREATED, handleShapeCreated);
      socket.off(SocketEvents.SHAPE_UPDATED, handleShapeUpdated);
      socket.off(SocketEvents.SHAPE_DELETED, handleShapeDeleted);
      socket.off(SocketEvents.CURSOR_MOVED, handleCursorMoved);
      socket.off(SocketEvents.SELECTION_CHANGED, handleSelectionChanged);
      socket.off(SocketEvents.SHAPE_LOCKED, handleShapeLocked);
      socket.off(SocketEvents.SHAPE_UNLOCKED, handleShapeUnlocked);
      socket.off(SocketEvents.SHAPE_TRANSFORMING, handleShapeTransforming);
      socket.off(SocketEvents.SHAPE_TRANSFORM_END, handleShapeTransformEnd);
      socket.off(SocketEvents.USER_JOINED, handleUserJoined);
      socket.off(SocketEvents.USER_LEFT, handleUserLeft);

      clearRemoteCursors();
      clearRemoteSelections();
      clearRemoteShapeLocks();
      clearRemoteShapeTransforms();
      activeBoardIdRef.current = null;
    };
  }, [
    boardId,
    canvasId,
    setShapes,
    applyRemoteShapeCreated,
    applyRemoteShapeUpdated,
    applyRemoteShapeDeleted,
    setRemoteCursor,
    removeRemoteCursor,
    clearRemoteCursors,
    setRemoteSelection,
    removeRemoteSelection,
    clearRemoteSelections,
    setRemoteShapeLock,
    removeRemoteShapeLock,
    clearRemoteShapeLocks,
    setRemoteShapeTransform,
    removeRemoteShapeTransform,
    clearRemoteShapeTransforms,
  ]);
};
