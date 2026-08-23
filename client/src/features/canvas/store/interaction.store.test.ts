import { describe, it, expect, beforeEach } from "vitest";
import { useInteractionStore } from "./interaction.store";
import { useCanvasStore } from "./canvas.store";
import { useMutationStore } from "./mutation.store";
import type { CollaborativeInteraction } from "@/services/socket";

describe("Interaction Store (Slice 16) Unit Tests", () => {
  beforeEach(() => {
    useInteractionStore.getState().reset();
    useCanvasStore.getState().resetCanvas();
    useMutationStore.getState().reset();
  });

  it("hydrates state from authoritative snapshot", () => {
    const snapshot: CollaborativeInteraction[] = [
      {
        interactionId: "int-1",
        socketId: "sock-1",
        userId: "user-1",
        boardId: "board-1",
        type: "moving",
        targets: [{ type: "shape", id: "shape-1" }],
        startedAt: "2026-08-23T12:00:00.000Z",
        updatedAt: "2026-08-23T12:00:00.000Z",
      },
      {
        interactionId: "int-2",
        socketId: "sock-2",
        userId: "user-2",
        boardId: "board-1",
        type: "selecting",
        targets: [{ type: "shape", id: "shape-2" }],
        startedAt: "2026-08-23T12:00:00.000Z",
        updatedAt: "2026-08-23T12:00:00.000Z",
      },
    ];

    useInteractionStore.getState().setSnapshot(snapshot);

    const state = useInteractionStore.getState();
    expect(Object.keys(state.interactions)).toHaveLength(2);
    expect(state.interactions["int-1"]?.userId).toBe("user-1");
    expect(state.interactions["int-2"]?.type).toBe("selecting");
  });

  it("adds, updates and removes interactions", () => {
    const interaction: CollaborativeInteraction = {
      interactionId: "int-10",
      socketId: "sock-10",
      userId: "user-10",
      boardId: "board-1",
      type: "resizing",
      targets: [{ type: "shape", id: "shape-10" }],
      startedAt: "2026-08-23T12:00:00.000Z",
      updatedAt: "2026-08-23T12:00:00.000Z",
      data: { scaleX: 1.2 },
    };

    useInteractionStore.getState().addInteraction(interaction);
    expect(useInteractionStore.getState().interactions["int-10"]?.data?.scaleX).toBe(1.2);

    useInteractionStore.getState().updateInteraction("int-10", {
      data: { scaleX: 1.5, scaleY: 1.5 },
    });
    expect(useInteractionStore.getState().interactions["int-10"]?.data?.scaleX).toBe(1.5);

    useInteractionStore.getState().removeInteraction("int-10");
    expect(useInteractionStore.getState().interactions["int-10"]).toBeUndefined();
  });

  it("tracks and cleans local interactions separately", () => {
    const localInt: CollaborativeInteraction = {
      interactionId: "local-int-1",
      socketId: "sock-local",
      userId: "my-user",
      boardId: "board-1",
      type: "editing-text",
      targets: [{ type: "shape", id: "shape-text-1" }],
      startedAt: "2026-08-23T12:00:00.000Z",
      updatedAt: "2026-08-23T12:00:00.000Z",
    };

    useInteractionStore.getState().setLocalInteraction(localInt);
    expect(useInteractionStore.getState().localInteractions["local-int-1"]).toBeDefined();
    expect(useInteractionStore.getState().interactions["local-int-1"]).toBeDefined();

    useInteractionStore.getState().removeLocalInteraction("local-int-1");
    expect(useInteractionStore.getState().localInteractions["local-int-1"]).toBeUndefined();
    expect(useInteractionStore.getState().interactions["local-int-1"]).toBeUndefined();
  });

  it("accurately identifies exclusive target owner", () => {
    const movingInt: CollaborativeInteraction = {
      interactionId: "int-moving",
      socketId: "sock-peer",
      userId: "peer-user",
      boardId: "board-1",
      type: "moving",
      targets: [{ type: "shape", id: "target-shape-1" }],
      startedAt: "2026-08-23T12:00:00.000Z",
      updatedAt: "2026-08-23T12:00:00.000Z",
    };

    useInteractionStore.getState().addInteraction(movingInt);

    // Target locked by peer
    const owner = useInteractionStore.getState().getTargetOwner("shape", "target-shape-1", "my-user");
    expect(owner?.userId).toBe("peer-user");

    // Self exclusion ignores own lock
    const selfCheck = useInteractionStore.getState().getTargetOwner("shape", "target-shape-1", "peer-user");
    expect(selfCheck).toBeNull();

    // Shared selecting does not create exclusive ownership lock
    useInteractionStore.getState().addInteraction({
      interactionId: "int-selecting",
      socketId: "sock-peer-2",
      userId: "peer-user-2",
      boardId: "board-1",
      type: "selecting",
      targets: [{ type: "shape", id: "target-shape-2" }],
      startedAt: "2026-08-23T12:00:00.000Z",
      updatedAt: "2026-08-23T12:00:00.000Z",
    });

    const sharedOwner = useInteractionStore.getState().getTargetOwner("shape", "target-shape-2", "my-user");
    expect(sharedOwner).toBeNull();
  });

  it("strictly preserves zero side-effects on canvas undo/redo history and mutations", () => {
    const canvasStoreBefore = useCanvasStore.getState();
    const pastLengthBefore = canvasStoreBefore.past.length;
    const futureLengthBefore = canvasStoreBefore.future.length;
    const pendingMutationsBefore = Object.keys(useMutationStore.getState().mutations).length;

    useInteractionStore.getState().addInteraction({
      interactionId: "int-pure",
      socketId: "sock-1",
      userId: "user-1",
      boardId: "board-1",
      type: "moving",
      targets: [{ type: "shape", id: "shape-1" }],
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    useInteractionStore.getState().updateInteraction("int-pure", {
      data: { deltaX: 20 },
    });

    useInteractionStore.getState().removeInteraction("int-pure");

    const canvasStoreAfter = useCanvasStore.getState();
    expect(canvasStoreAfter.past.length).toBe(pastLengthBefore);
    expect(canvasStoreAfter.future.length).toBe(futureLengthBefore);
    expect(Object.keys(useMutationStore.getState().mutations).length).toBe(pendingMutationsBefore);
  });
});
