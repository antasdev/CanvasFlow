import { describe, it, expect, beforeEach } from "vitest";
import { useMutationStore } from "./mutation.store";
import { useCanvasStore } from "./canvas.store";
import type { PendingMutation } from "./mutation.store";

describe("Mutation Store (Slice 13) Unit Tests", () => {
  beforeEach(() => {
    useMutationStore.getState().reset();
    useCanvasStore.getState().resetCanvas();
  });

  it("adds a pending mutation to the journal", () => {
    const mutation: PendingMutation = {
      mutationId: "mut-1",
      boardId: "board-1",
      resourceType: "shape",
      resourceId: "shape-1",
      operation: "update",
      expectedVersion: 1,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      retryCount: 0,
      intent: {
        resourceType: "shape",
        resourceId: "shape-1",
        operation: "update",
        expectedVersion: 1,
        changes: { x: 200 },
      },
    };

    useMutationStore.getState().addMutation(mutation);

    const pending = useMutationStore.getState().getPendingMutations("board-1");
    expect(pending).toHaveLength(1);
    expect(pending[0].mutationId).toBe("mut-1");
    expect(pending[0].status).toBe("pending");
  });

  it("marks mutation confirmed and removes it from journal to keep state bounded", () => {
    const mutation: PendingMutation = {
      mutationId: "mut-2",
      boardId: "board-1",
      resourceType: "shape",
      resourceId: "shape-2",
      operation: "create",
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      retryCount: 0,
    };

    useMutationStore.getState().addMutation(mutation);
    expect(Object.keys(useMutationStore.getState().mutations)).toHaveLength(1);

    useMutationStore.getState().markConfirmed("mut-2");
    expect(Object.keys(useMutationStore.getState().mutations)).toHaveLength(0);
    expect(useMutationStore.getState().getPendingMutations("board-1")).toHaveLength(0);
  });

  it("marks mutation failed with error reason", () => {
    const mutation: PendingMutation = {
      mutationId: "mut-3",
      boardId: "board-1",
      resourceType: "shape",
      resourceId: "shape-3",
      operation: "delete",
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      retryCount: 0,
    };

    useMutationStore.getState().addMutation(mutation);
    useMutationStore.getState().markFailed("mut-3", "Unauthorized delete attempt");

    const item = useMutationStore.getState().mutations["mut-3"];
    expect(item).toBeDefined();
    expect(item.status).toBe("failed");
    expect(item.error).toBe("Unauthorized delete attempt");
  });

  it("marks mutation uncertain on timeout or disconnect", () => {
    const mutation: PendingMutation = {
      mutationId: "mut-4",
      boardId: "board-1",
      resourceType: "comment",
      resourceId: "comment-1",
      operation: "update",
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      retryCount: 0,
    };

    useMutationStore.getState().addMutation(mutation);
    useMutationStore.getState().markUncertain("mut-4");

    const item = useMutationStore.getState().mutations["mut-4"];
    expect(item.status).toBe("uncertain");

    // Uncertain mutations must still be returned in getPendingMutations for reconciliation
    const pending = useMutationStore.getState().getPendingMutations("board-1");
    expect(pending).toHaveLength(1);
    expect(pending[0].mutationId).toBe("mut-4");
  });

  it("marks mutation conflicted with structured conflict metadata", () => {
    const mutation: PendingMutation = {
      mutationId: "mut-5",
      boardId: "board-1",
      resourceType: "shape",
      resourceId: "shape-5",
      operation: "update",
      expectedVersion: 1,
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      retryCount: 0,
    };

    useMutationStore.getState().addMutation(mutation);
    useMutationStore.getState().markConflicted("mut-5", {
      code: "CONFLICT",
      resourceType: "shape",
      resourceId: "shape-5",
      currentVersion: 3,
    });

    const item = useMutationStore.getState().mutations["mut-5"];
    expect(item.status).toBe("conflicted");
    expect(item.conflict?.currentVersion).toBe(3);
  });

  it("marks mutation reconciling during recovery", () => {
    const mutation: PendingMutation = {
      mutationId: "mut-6",
      boardId: "board-1",
      resourceType: "shape",
      resourceId: "shape-6",
      operation: "update",
      status: "uncertain",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      retryCount: 0,
    };

    useMutationStore.getState().addMutation(mutation);
    useMutationStore.getState().markReconciling("mut-6");

    expect(useMutationStore.getState().mutations["mut-6"].status).toBe("reconciling");
  });

  it("clears all mutations for a specific board", () => {
    useMutationStore.getState().addMutation({
      mutationId: "b1-mut",
      boardId: "board-1",
      resourceType: "shape",
      resourceId: "s1",
      operation: "update",
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      retryCount: 0,
    });

    useMutationStore.getState().addMutation({
      mutationId: "b2-mut",
      boardId: "board-2",
      resourceType: "shape",
      resourceId: "s2",
      operation: "update",
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      retryCount: 0,
    });

    useMutationStore.getState().clearBoard("board-1");

    expect(useMutationStore.getState().getPendingMutations("board-1")).toHaveLength(0);
    expect(useMutationStore.getState().getPendingMutations("board-2")).toHaveLength(1);
  });

  it("guarantees 0% undo/redo history pollution in useCanvasStore", () => {
    expect(useCanvasStore.getState().past).toHaveLength(0);
    expect(useCanvasStore.getState().future).toHaveLength(0);

    useMutationStore.getState().addMutation({
      mutationId: "pollute-test",
      boardId: "board-1",
      resourceType: "shape",
      resourceId: "s1",
      operation: "update",
      status: "pending",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      retryCount: 0,
    });

    useMutationStore.getState().markUncertain("pollute-test");
    useMutationStore.getState().markConfirmed("pollute-test");

    expect(useCanvasStore.getState().past).toHaveLength(0);
    expect(useCanvasStore.getState().future).toHaveLength(0);
    expect(useCanvasStore.getState().canUndo()).toBe(false);
  });
});
