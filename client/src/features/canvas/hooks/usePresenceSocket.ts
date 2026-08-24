import { useCallback, useEffect, useRef } from "react";
import { socketClientService, type PresenceActivity } from "@/services/socket";
import { useCollaborationStore, usePresenceStore } from "../store";

const HEARTBEAT_INTERVAL_MS = 20000;
const CURSOR_THROTTLE_MS = 33; // ~30 FPS
const IDLE_TIMEOUT_MS = 5000;

export type UsePresenceSocketReturn = {
  users: ReturnType<typeof usePresenceStore.getState>["users"];
  cursors: ReturnType<typeof usePresenceStore.getState>["cursors"];
  localActivity: PresenceActivity;
  emitCursor: (position: { x: number; y: number }) => void;
  emitActivity: (activity: PresenceActivity) => void;
};

/**
 * Custom React hook coordinating real-time presence lifecycle over Socket.IO.
 * Manages heartbeat emissions, cursor throttling, activity auto-idle resets,
 * and authoritative reconnection snapshot synchronization.
 */
export const usePresenceSocket = (boardId?: string): UsePresenceSocketReturn => {
  const users = usePresenceStore((state) => state.users);
  const cursors = usePresenceStore((state) => state.cursors);
  const localActivity = usePresenceStore((state) => state.localActivity);

  const connectionEpoch = useCollaborationStore((state) => state.connectionEpoch);

  const lastCursorEmitRef = useRef<number>(0);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // -------------------------------------------------------------
  // Throttled Cursor Broadcasting
  // -------------------------------------------------------------
  const emitCursor = useCallback(
    (position: { x: number; y: number }): void => {
      if (!boardId) return;

      const now = Date.now();
      if (now - lastCursorEmitRef.current >= CURSOR_THROTTLE_MS) {
        lastCursorEmitRef.current = now;
        socketClientService.sendPresenceCursor(boardId, position);
      }
    },
    [boardId]
  );

  // -------------------------------------------------------------
  // Activity Transitions with Automatic Idle Reset
  // -------------------------------------------------------------
  const emitActivity = useCallback(
    (activity: PresenceActivity): void => {
      if (!boardId) return;

      usePresenceStore.getState().setLocalActivity(activity);
      void socketClientService.sendPresenceActivity(boardId, activity);

      // Clear any existing idle reset timer
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }

      // If active interaction (not already idle), schedule auto-reset to idle
      if (activity !== "idle") {
        idleTimerRef.current = setTimeout(() => {
          usePresenceStore.getState().setLocalActivity("idle");
          void socketClientService.sendPresenceActivity(boardId, "idle");
        }, IDLE_TIMEOUT_MS);
      }
    },
    [boardId]
  );

  // -------------------------------------------------------------
  // Reconnect Epoch & Snapshot Hydration
  // -------------------------------------------------------------
  useEffect(() => {
    if (!boardId) return;

    // Refresh presence snapshot on mount or epoch increment
    void socketClientService.getPresenceSnapshot(boardId).then((snapshot) => {
      if (snapshot) {
        usePresenceStore.getState().setSnapshot(snapshot.users, snapshot.cursors);
      }
    });
  }, [boardId, connectionEpoch]);

  // -------------------------------------------------------------
  // Event Subscriptions & Heartbeat Lifecycle
  // -------------------------------------------------------------
  useEffect(() => {
    if (!boardId) return;

    // 1. Initial heartbeat & periodic heartbeat interval
    void socketClientService.sendPresenceHeartbeat(boardId);

    heartbeatTimerRef.current = setInterval(() => {
      void socketClientService.sendPresenceHeartbeat(boardId);
    }, HEARTBEAT_INTERVAL_MS);

    // 2. Subscribe to incoming presence events
    const unsubSnapshot = socketClientService.onPresenceSnapshot((payload) => {
      if (payload.boardId === boardId) {
        usePresenceStore.getState().setSnapshot(payload.users, payload.cursors);
      }
    });

    const unsubUserJoined = socketClientService.onPresenceUserJoined((payload) => {
      if (payload.boardId === boardId) {
        usePresenceStore.getState().addUser(payload.user);
      }
    });

    const unsubUserLeft = socketClientService.onPresenceUserLeft((payload) => {
      if (payload.boardId === boardId) {
        usePresenceStore.getState().removeUser(payload.userId);
      }
    });

    const unsubCursor = socketClientService.onPresenceCursor((payload) => {
      if (payload.boardId === boardId) {
        usePresenceStore.getState().updateCursor({
          userId: payload.userId,
          x: payload.x,
          y: payload.y,
          updatedAt: payload.updatedAt,
        });
      }
    });

    const unsubActivity = socketClientService.onPresenceActivity((payload) => {
      if (payload.boardId === boardId) {
        usePresenceStore
          .getState()
          .updateActivity(payload.userId, payload.activity, payload.updatedAt);
      }
    });

    return () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }

      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
        idleTimerRef.current = null;
      }

      unsubSnapshot();
      unsubUserJoined();
      unsubUserLeft();
      unsubCursor();
      unsubActivity();
      usePresenceStore.getState().reset();
    };
  }, [boardId]);

  return {
    users,
    cursors,
    localActivity,
    emitCursor,
    emitActivity,
  };
};
