import { describe, it, expect, beforeEach } from "vitest";
import { usePresenceStore } from "./presence.store";
import { useCanvasStore } from "./canvas.store";
import { useMutationStore } from "./mutation.store";
import type { PresenceCursor, PresenceUser } from "@/services/socket";

describe("Presence Store (Slice 15) Unit Tests", () => {
  beforeEach(() => {
    usePresenceStore.getState().reset();
    useCanvasStore.getState().resetCanvas();
    useMutationStore.getState().reset();
  });

  it("hydrates state from authoritative snapshot", () => {
    const users: PresenceUser[] = [
      {
        userId: "user-1",
        fullName: "Alice Presence",
        status: "online",
        activity: "cursor",
        sessionCount: 1,
        lastSeenAt: "2026-08-23T12:00:00.000Z",
      },
      {
        userId: "user-2",
        fullName: "Bob Presence",
        status: "online",
        activity: "idle",
        sessionCount: 2,
        lastSeenAt: "2026-08-23T12:00:00.000Z",
      },
    ];

    const cursors: PresenceCursor[] = [
      {
        userId: "user-1",
        x: 150,
        y: 250,
        updatedAt: "2026-08-23T12:00:00.000Z",
      },
    ];

    usePresenceStore.getState().setSnapshot(users, cursors);

    const state = usePresenceStore.getState();
    expect(Object.keys(state.users)).toHaveLength(2);
    expect(state.users["user-1"]?.fullName).toBe("Alice Presence");
    expect(state.users["user-2"]?.sessionCount).toBe(2);
    expect(state.cursors["user-1"]?.x).toBe(150);
  });

  it("adds and updates user presence", () => {
    const user: PresenceUser = {
      userId: "user-3",
      fullName: "Carol Presence",
      status: "online",
      activity: "moving",
      sessionCount: 1,
      lastSeenAt: "2026-08-23T12:00:00.000Z",
    };

    usePresenceStore.getState().addUser(user);
    expect(usePresenceStore.getState().users["user-3"]?.activity).toBe("moving");

    // Update with tab 2
    usePresenceStore.getState().addUser({
      ...user,
      sessionCount: 2,
    });
    expect(usePresenceStore.getState().users["user-3"]?.sessionCount).toBe(2);
  });

  it("removes user and cleans up their cursor", () => {
    usePresenceStore.getState().addUser({
      userId: "user-4",
      fullName: "Dave Presence",
      status: "online",
      activity: "idle",
      sessionCount: 1,
      lastSeenAt: "2026-08-23T12:00:00.000Z",
    });

    usePresenceStore.getState().updateCursor({
      userId: "user-4",
      x: 300,
      y: 400,
      updatedAt: "2026-08-23T12:00:00.000Z",
    });

    expect(usePresenceStore.getState().users["user-4"]).toBeDefined();
    expect(usePresenceStore.getState().cursors["user-4"]).toBeDefined();

    usePresenceStore.getState().removeUser("user-4");

    expect(usePresenceStore.getState().users["user-4"]).toBeUndefined();
    expect(usePresenceStore.getState().cursors["user-4"]).toBeUndefined();
  });

  it("updates cursor coordinates independently", () => {
    usePresenceStore.getState().updateCursor({
      userId: "user-5",
      x: 50,
      y: 75,
      updatedAt: "2026-08-23T12:00:00.000Z",
    });

    expect(usePresenceStore.getState().cursors["user-5"]?.x).toBe(50);
    expect(usePresenceStore.getState().cursors["user-5"]?.y).toBe(75);
  });

  it("updates user activity and updates timestamp", () => {
    usePresenceStore.getState().addUser({
      userId: "user-6",
      fullName: "Frank Presence",
      status: "online",
      activity: "idle",
      sessionCount: 1,
      lastSeenAt: "2026-08-23T12:00:00.000Z",
    });

    usePresenceStore.getState().updateActivity("user-6", "editing-text", "2026-08-23T12:05:00.000Z");

    const user = usePresenceStore.getState().users["user-6"];
    expect(user?.activity).toBe("editing-text");
    expect(user?.lastSeenAt).toBe("2026-08-23T12:05:00.000Z");
  });

  it("sets local activity and resets on reset()", () => {
    usePresenceStore.getState().setLocalActivity("resizing");
    expect(usePresenceStore.getState().localActivity).toBe("resizing");

    usePresenceStore.getState().reset();
    expect(usePresenceStore.getState().localActivity).toBe("idle");
    expect(Object.keys(usePresenceStore.getState().users)).toHaveLength(0);
    expect(Object.keys(usePresenceStore.getState().cursors)).toHaveLength(0);
  });

  it("guarantees ZERO side-effects on canvas undo/redo and mutation store", () => {
    const canvasPastBefore = useCanvasStore.getState().past.length;
    const canvasFutureBefore = useCanvasStore.getState().future.length;
    const mutationCountBefore = Object.keys(useMutationStore.getState().mutations).length;

    usePresenceStore.getState().addUser({
      userId: "user-7",
      fullName: "Grace Presence",
      status: "online",
      activity: "commenting",
      sessionCount: 1,
      lastSeenAt: "2026-08-23T12:00:00.000Z",
    });

    usePresenceStore.getState().updateCursor({
      userId: "user-7",
      x: 100,
      y: 100,
      updatedAt: "2026-08-23T12:00:00.000Z",
    });

    expect(useCanvasStore.getState().past.length).toBe(canvasPastBefore);
    expect(useCanvasStore.getState().future.length).toBe(canvasFutureBefore);
    expect(Object.keys(useMutationStore.getState().mutations).length).toBe(mutationCountBefore);
  });
});
