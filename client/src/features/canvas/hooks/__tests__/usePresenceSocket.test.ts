import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { usePresenceStore, useCollaborationStore } from "../../store";
import type {
  PresenceSnapshotPayload,
  PresenceUserJoinedPayload,
  PresenceUserLeftPayload,
  PresenceCursorBroadcastPayload,
  PresenceActivityBroadcastPayload,
} from "@/services/socket";

describe("Presence Socket Logic (Slice 15) Integration Tests", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    usePresenceStore.getState().reset();
    useCollaborationStore.getState().reset();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("handles incoming presence:snapshot payload and hydrates store", () => {
    const snapshot: PresenceSnapshotPayload = {
      boardId: "board-100",
      users: [
        {
          userId: "user-alice",
          fullName: "Alice Snapshot",
          status: "online",
          activity: "idle",
          sessionCount: 1,
          lastSeenAt: "2026-08-23T12:00:00.000Z",
        },
      ],
      cursors: [
        {
          userId: "user-alice",
          x: 200,
          y: 300,
          updatedAt: "2026-08-23T12:00:00.000Z",
        },
      ],
      timestamp: "2026-08-23T12:00:00.000Z",
    };

    usePresenceStore.getState().setSnapshot(snapshot.users, snapshot.cursors);

    const state = usePresenceStore.getState();
    expect(state.users["user-alice"]?.fullName).toBe("Alice Snapshot");
    expect(state.cursors["user-alice"]?.x).toBe(200);
    expect(state.cursors["user-alice"]?.y).toBe(300);
  });

  it("handles presence:user-joined and presence:user-left lifecycles", () => {
    const joinedPayload: PresenceUserJoinedPayload = {
      boardId: "board-100",
      sessionId: "sess-1",
      user: {
        userId: "user-bob",
        fullName: "Bob Presence",
        status: "online",
        activity: "cursor",
        sessionCount: 1,
        lastSeenAt: "2026-08-23T12:00:00.000Z",
      },
    };

    usePresenceStore.getState().addUser(joinedPayload.user);
    expect(usePresenceStore.getState().users["user-bob"]?.fullName).toBe("Bob Presence");

    const leftPayload: PresenceUserLeftPayload = {
      boardId: "board-100",
      userId: "user-bob",
      remainingSessions: 0,
    };

    usePresenceStore.getState().removeUser(leftPayload.userId);
    expect(usePresenceStore.getState().users["user-bob"]).toBeUndefined();
  });

  it("handles presence:cursor coordinate streams", () => {
    const cursorPayload: PresenceCursorBroadcastPayload = {
      boardId: "board-100",
      userId: "user-carol",
      x: 450,
      y: 600,
      updatedAt: "2026-08-23T12:01:00.000Z",
    };

    usePresenceStore.getState().updateCursor({
      userId: cursorPayload.userId,
      x: cursorPayload.x,
      y: cursorPayload.y,
      updatedAt: cursorPayload.updatedAt,
    });

    expect(usePresenceStore.getState().cursors["user-carol"]?.x).toBe(450);
    expect(usePresenceStore.getState().cursors["user-carol"]?.y).toBe(600);
  });

  it("handles presence:activity state transitions", () => {
    usePresenceStore.getState().addUser({
      userId: "user-dave",
      fullName: "Dave Activity",
      status: "online",
      activity: "idle",
      sessionCount: 1,
      lastSeenAt: "2026-08-23T12:00:00.000Z",
    });

    const activityPayload: PresenceActivityBroadcastPayload = {
      boardId: "board-100",
      userId: "user-dave",
      activity: "editing-text",
      updatedAt: "2026-08-23T12:02:00.000Z",
    };

    usePresenceStore
      .getState()
      .updateActivity(activityPayload.userId, activityPayload.activity, activityPayload.updatedAt);

    expect(usePresenceStore.getState().users["user-dave"]?.activity).toBe("editing-text");
    expect(usePresenceStore.getState().users["user-dave"]?.lastSeenAt).toBe("2026-08-23T12:02:00.000Z");
  });

  it("isolates presence state from collaboration revisions and board recovery", () => {
    useCollaborationStore.getState().setRevision("board-100", 5);
    expect(useCollaborationStore.getState().getRevision("board-100")).toBe(5);

    usePresenceStore.getState().addUser({
      userId: "user-eve",
      fullName: "Eve Isolation",
      status: "online",
      activity: "selecting",
      sessionCount: 1,
      lastSeenAt: "2026-08-23T12:00:00.000Z",
    });

    // Revision must not change
    expect(useCollaborationStore.getState().getRevision("board-100")).toBe(5);
  });
});
