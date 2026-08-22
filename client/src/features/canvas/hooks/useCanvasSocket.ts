import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { socketClientService, SocketEvents } from "@/services/socket";
import type {
  CanvasSyncPayload,
  CursorMovedPayload,
  SelectionChangedPayload,
  ShapeResponseDto,
  UserJoinedPayload,
  UserLeftPayload,
} from "@/services/socket";
import { mapShapeResponseToRectangleShape } from "../api";
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
          mapShapeResponseToRectangleShape
        );
        setShapes(mapped);
      }
    };

    // 3. Handle remote shape creation
    const handleShapeCreated = (shapeDto: ShapeResponseDto): void => {
      const shape = mapShapeResponseToRectangleShape(shapeDto);
      applyRemoteShapeCreated(shape);
    };

    // 4. Handle remote shape update (transform, move, resize, rotate)
    const handleShapeUpdated = (shapeDto: ShapeResponseDto): void => {
      const shape = mapShapeResponseToRectangleShape(shapeDto);
      applyRemoteShapeUpdated(shape);
    };

    // 5. Handle remote shape deletion
    const handleShapeDeleted = (payload: { shapeId: string }): void => {
      applyRemoteShapeDeleted(payload.shapeId);
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

    // 8. Handle presence broadcasts
    const handleUserJoined = (payload: UserJoinedPayload): void => {
      console.log(`[Presence] User joined board: ${payload.userId}`);
    };

    const handleUserLeft = (payload: UserLeftPayload): void => {
      console.log(`[Presence] User left board: ${payload.userId}`);
      removeRemoteCursor(payload.userId);
      removeRemoteSelection(payload.userId);
    };

    socket.on(SocketEvents.CANVAS_SYNC, handleCanvasSync);
    socket.on(SocketEvents.SHAPE_CREATED, handleShapeCreated);
    socket.on(SocketEvents.SHAPE_UPDATED, handleShapeUpdated);
    socket.on(SocketEvents.SHAPE_DELETED, handleShapeDeleted);
    socket.on(SocketEvents.CURSOR_MOVED, handleCursorMoved);
    socket.on(SocketEvents.SELECTION_CHANGED, handleSelectionChanged);
    socket.on(SocketEvents.USER_JOINED, handleUserJoined);
    socket.on(SocketEvents.USER_LEFT, handleUserLeft);

    return () => {
      socket.off(SocketEvents.CANVAS_SYNC, handleCanvasSync);
      socket.off(SocketEvents.SHAPE_CREATED, handleShapeCreated);
      socket.off(SocketEvents.SHAPE_UPDATED, handleShapeUpdated);
      socket.off(SocketEvents.SHAPE_DELETED, handleShapeDeleted);
      socket.off(SocketEvents.CURSOR_MOVED, handleCursorMoved);
      socket.off(SocketEvents.SELECTION_CHANGED, handleSelectionChanged);
      socket.off(SocketEvents.USER_JOINED, handleUserJoined);
      socket.off(SocketEvents.USER_LEFT, handleUserLeft);

      clearRemoteCursors();
      clearRemoteSelections();

      if (activeBoardIdRef.current) {
        socketClientService
          .leaveBoard(activeBoardIdRef.current)
          .catch(() => {});
        activeBoardIdRef.current = null;
      }
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
  ]);
};
