import { beforeEach, describe, expect, it } from "vitest";

import { useCollaborationStore } from "./collaboration.store";
import { useCanvasStore } from "./canvas.store";

describe("Collaboration Store (useCollaborationStore) Unit Tests", () => {
  beforeEach(() => {
    useCollaborationStore.getState().reset();
    useCanvasStore.getState().resetCanvas();
  });

  it("should initialize with default state", () => {
    const state = useCollaborationStore.getState();
    expect(state.boardRevisions).toEqual({});
    expect(state.connectionEpoch).toBe(0);
    expect(state.isRecovering).toBe(false);
    expect(state.getRevision("board-1")).toBe(0);
  });

  it("should set and retrieve board revisions accurately", () => {
    useCollaborationStore.getState().setRevision("board-1", 42);
    useCollaborationStore.getState().setRevision("board-2", 100);

    expect(useCollaborationStore.getState().getRevision("board-1")).toBe(42);
    expect(useCollaborationStore.getState().getRevision("board-2")).toBe(100);
  });

  it("should increment connection epoch monotonically", () => {
    const epoch1 = useCollaborationStore.getState().incrementEpoch();
    expect(epoch1).toBe(1);
    expect(useCollaborationStore.getState().connectionEpoch).toBe(1);

    const epoch2 = useCollaborationStore.getState().incrementEpoch();
    expect(epoch2).toBe(2);
    expect(useCollaborationStore.getState().connectionEpoch).toBe(2);
  });

  it("should accept sequential next revision and advance stored revision", () => {
    useCollaborationStore.getState().setRevision("board-1", 42);

    const result = useCollaborationStore.getState().checkEventFreshness("board-1", 43);

    expect(result.action).toBe("apply");
    expect(result.currentRevision).toBe(42);
    expect(useCollaborationStore.getState().getRevision("board-1")).toBe(43);
  });

  it("should ignore older (stale) revisions without changing stored revision", () => {
    useCollaborationStore.getState().setRevision("board-1", 42);

    const result = useCollaborationStore.getState().checkEventFreshness("board-1", 40);

    expect(result.action).toBe("ignore");
    expect(result.currentRevision).toBe(42);
    expect(useCollaborationStore.getState().getRevision("board-1")).toBe(42);
  });

  it("should ignore duplicate (equal) revisions without changing stored revision", () => {
    useCollaborationStore.getState().setRevision("board-1", 42);

    const result = useCollaborationStore.getState().checkEventFreshness("board-1", 42);

    expect(result.action).toBe("ignore");
    expect(result.currentRevision).toBe(42);
    expect(useCollaborationStore.getState().getRevision("board-1")).toBe(42);
  });

  it("should detect revision gaps when an intermediate revision was missed", () => {
    useCollaborationStore.getState().setRevision("board-1", 42);

    // Incoming 45 when current is 42 (gap: 43 and 44 were missed)
    const result = useCollaborationStore.getState().checkEventFreshness("board-1", 45);

    expect(result.action).toBe("gap");
    expect(result.currentRevision).toBe(42);
    // Stored revision must remain 42 until recovery executes
    expect(useCollaborationStore.getState().getRevision("board-1")).toBe(42);
  });

  it("should handle initial event when stored revision is 0", () => {
    const result = useCollaborationStore.getState().checkEventFreshness("board-1", 10);

    expect(result.action).toBe("apply");
    expect(result.currentRevision).toBe(0);
    expect(useCollaborationStore.getState().getRevision("board-1")).toBe(10);
  });

  it("should toggle isRecovering flag cleanly", () => {
    useCollaborationStore.getState().setRecovering(true);
    expect(useCollaborationStore.getState().isRecovering).toBe(true);

    useCollaborationStore.getState().setRecovering(false);
    expect(useCollaborationStore.getState().isRecovering).toBe(false);
  });

  it("guarantees collaboration store operations NEVER touch canvas undo/redo history", () => {
    // 1. Add a shape to have 1 local undo entry
    const localShape = {
      id: "shape-undo-test",
      type: "rectangle" as const,
      x: 10,
      y: 10,
      width: 50,
      height: 50,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      fill: "#ffffff",
      stroke: "#000000",
      strokeWidth: 2,
    };
    useCanvasStore.getState().addShape(localShape);
    expect(useCanvasStore.getState().past).toHaveLength(1);

    // 2. Perform various collaboration store operations
    useCollaborationStore.getState().setRevision("board-1", 50);
    useCollaborationStore.getState().incrementEpoch();
    useCollaborationStore.getState().checkEventFreshness("board-1", 51);
    useCollaborationStore.getState().setRecovering(true);
    useCollaborationStore.getState().setRecovering(false);

    // 3. Canvas undo/redo stacks must remain completely unaffected
    expect(useCanvasStore.getState().past).toHaveLength(1);
    expect(useCanvasStore.getState().future).toHaveLength(0);
  });
});
