import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { mutationManager, generateMutationId } from "./mutation-manager";
import { useMutationStore } from "../store/mutation.store";
import { useCanvasStore } from "../store/canvas.store";
import { socketClientService } from "@/services/socket";
import type { Shape } from "../types/shape.types";

vi.mock("@/services/socket", () => ({
  socketClientService: {
    createShape: vi.fn(),
    updateShape: vi.fn(),
    deleteShape: vi.fn(),
    createComment: vi.fn(),
    updateComment: vi.fn(),
    resolveComment: vi.fn(),
    deleteComment: vi.fn(),
  },
}));

describe("Mutation Manager (Slice 13) Unit & Integration Tests", () => {
  beforeEach(() => {
    useMutationStore.getState().reset();
    useCanvasStore.getState().resetCanvas();
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("generates a valid UUID v4 mutationId", () => {
    const id = generateMutationId();
    expect(id).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("registers a pending mutation with intent in the store", () => {
    const mutation = mutationManager.registerMutation({
      mutationId: "mut-test-1",
      boardId: "board-1",
      resourceType: "shape",
      resourceId: "shape-1",
      operation: "update",
      expectedVersion: 1,
    });

    expect(mutation.status).toBe("pending");
    expect(useMutationStore.getState().mutations["mut-test-1"]).toBeDefined();
  });

  it("marks mutation as uncertain when acknowledgement times out", () => {
    mutationManager.setTimeoutDuration(5000);
    mutationManager.registerMutation({
      mutationId: "mut-timeout-1",
      boardId: "board-1",
      resourceType: "shape",
      resourceId: "shape-1",
      operation: "update",
    });

    expect(useMutationStore.getState().mutations["mut-timeout-1"].status).toBe("pending");

    // Fast-forward 5000ms
    vi.advanceTimersByTime(5000);

    expect(useMutationStore.getState().mutations["mut-timeout-1"].status).toBe("uncertain");
  });

  it("successful shape update acknowledges and confirms mutation", async () => {
    vi.mocked(socketClientService.updateShape).mockResolvedValue({
      id: "shape-1",
      canvasId: "canvas-1",
      type: "rectangle",
      x: 300,
      y: 200,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: 1,
      version: 2,
      createdBy: "user-1",
      createdAt: "2026-08-23T12:00:00.000Z",
      updatedAt: "2026-08-23T12:00:00.000Z",
      style: { fill: "#ff0000", stroke: "#000000", strokeWidth: 1, opacity: 1 },
    });

    const response = await mutationManager.executeShapeUpdate(
      "board-1",
      "shape-1",
      { x: 300 },
      1
    );

    expect(response.version).toBe(2);
    expect(response.x).toBe(300);
    // Verified confirmed mutations are cleared from journal
    expect(useMutationStore.getState().getPendingMutations("board-1")).toHaveLength(0);
  });

  it("conflict during shape update marks mutation conflicted", async () => {
    const conflictError = new Error("Conflict detected");
    (conflictError as any).code = "CONFLICT";
    (conflictError as any).currentVersion = 3;

    vi.mocked(socketClientService.updateShape).mockRejectedValue(conflictError);

    await expect(
      mutationManager.executeShapeUpdate("board-1", "shape-1", { x: 300 }, 1, "mut-conflict-1")
    ).rejects.toThrow("Conflict detected");

    const item = useMutationStore.getState().mutations["mut-conflict-1"];
    expect(item).toBeDefined();
    expect(item.status).toBe("conflicted");
  });

  it("replaces temporary shape ID in canvasStore upon shape creation ack", async () => {
    useCanvasStore.getState().addShape({
      id: "temp-shape-1",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      fill: "#ff0000",
      stroke: "#000000",
      strokeWidth: 1,
    });
    useCanvasStore.getState().setSelectedShapeIds(["temp-shape-1"]);

    vi.mocked(socketClientService.createShape).mockResolvedValue({
      id: "6a8ae6f60b592055885c9999",
      canvasId: "canvas-1",
      type: "rectangle",
      x: 100,
      y: 100,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: 1,
      version: 1,
      createdBy: "user-1",
      createdAt: "2026-08-23T12:00:00.000Z",
      updatedAt: "2026-08-23T12:00:00.000Z",
      style: { fill: "#ff0000", stroke: "#000000", strokeWidth: 1, opacity: 1 },
    });

    await mutationManager.executeShapeCreate(
      "board-1",
      "canvas-1",
      { type: "rectangle", x: 100, y: 100, width: 100, height: 100 },
      "temp-shape-1"
    );

    expect(useCanvasStore.getState().shapes[0].id).toBe("6a8ae6f60b592055885c9999");
    expect(useCanvasStore.getState().selectedShapeIds).toContain("6a8ae6f60b592055885c9999");
  });

  describe("Four-Case Reconciliation Algorithm", () => {
    it("Case A: Confirms already-applied mutation when server state matches intended changes", async () => {
      // Pending update: expectedVersion = 1, changes = { x: 500 }
      mutationManager.registerMutation({
        mutationId: "mut-case-a",
        boardId: "board-1",
        resourceType: "shape",
        resourceId: "shape-1",
        operation: "update",
        expectedVersion: 1,
        intent: {
          resourceType: "shape",
          resourceId: "shape-1",
          operation: "update",
          expectedVersion: 1,
          changes: { x: 500 },
        },
      });

      // Authoritative recovery returns shape-1 at version 2 with x = 500
      const authoritativeShapes: Shape[] = [
        {
          id: "shape-1",
          type: "rectangle",
          x: 500, // Matches intended change!
          y: 100,
          width: 100,
          height: 100,
          rotation: 0,
          opacity: 1,
          zIndex: 1,
          fill: "#ff0000",
          stroke: "#000000",
          strokeWidth: 1,
          version: 2,
        },
      ];

      const report = await mutationManager.reconcileBoard("board-1", authoritativeShapes);
      expect(report.reconciledCount).toBe(1);
      expect(report.retriedCount).toBe(0);
      expect(report.conflictCount).toBe(0);
      expect(useMutationStore.getState().getPendingMutations("board-1")).toHaveLength(0);
    });

    it("Case B: Retries safe mutation when server version is still expectedVersion using same mutationId", async () => {
      // Pending update: expectedVersion = 1, changes = { x: 600 }
      mutationManager.registerMutation({
        mutationId: "mut-case-b-stable-id",
        boardId: "board-1",
        resourceType: "shape",
        resourceId: "shape-1",
        operation: "update",
        expectedVersion: 1,
        intent: {
          resourceType: "shape",
          resourceId: "shape-1",
          operation: "update",
          expectedVersion: 1,
          changes: { x: 600 },
        },
      });

      // Authoritative recovery returns shape-1 still at version 1 (mutation was lost in transit)
      const authoritativeShapes: Shape[] = [
        {
          id: "shape-1",
          type: "rectangle",
          x: 100,
          y: 100,
          width: 100,
          height: 100,
          rotation: 0,
          opacity: 1,
          zIndex: 1,
          fill: "#ff0000",
          stroke: "#000000",
          strokeWidth: 1,
          version: 1,
        },
      ];

      vi.mocked(socketClientService.updateShape).mockResolvedValue({
        id: "shape-1",
        canvasId: "canvas-1",
        type: "rectangle",
        x: 600,
        y: 100,
        width: 100,
        height: 100,
        rotation: 0,
        zIndex: 1,
        version: 2,
        createdBy: "user-1",
        createdAt: "2026-08-23T12:00:00.000Z",
        updatedAt: "2026-08-23T12:00:00.000Z",
        style: { fill: "#ff0000", stroke: "#000000", strokeWidth: 1, opacity: 1 },
      });

      const report = await mutationManager.reconcileBoard("board-1", authoritativeShapes);
      expect(report.retriedCount).toBe(1);
      expect(report.conflictCount).toBe(0);

      // Verify same stable mutationId was passed during retry
      expect(socketClientService.updateShape).toHaveBeenCalledWith(
        "shape-1",
        { x: 600 },
        1,
        "mut-case-b-stable-id"
      );
    });

    it("Case C: Marks CONFLICTED when server version advanced with differing changes", async () => {
      // Pending update: expectedVersion = 1, changes = { x: 700 }
      mutationManager.registerMutation({
        mutationId: "mut-case-c",
        boardId: "board-1",
        resourceType: "shape",
        resourceId: "shape-1",
        operation: "update",
        expectedVersion: 1,
        intent: {
          resourceType: "shape",
          resourceId: "shape-1",
          operation: "update",
          expectedVersion: 1,
          changes: { x: 700 },
        },
      });

      // Server is at version 3 with x = 850 (intervening collaborator modification)
      const authoritativeShapes: Shape[] = [
        {
          id: "shape-1",
          type: "rectangle",
          x: 850,
          y: 100,
          width: 100,
          height: 100,
          rotation: 0,
          opacity: 1,
          zIndex: 1,
          fill: "#ff0000",
          stroke: "#000000",
          strokeWidth: 1,
          version: 3,
        },
      ];

      const report = await mutationManager.reconcileBoard("board-1", authoritativeShapes);
      expect(report.conflictCount).toBe(1);
      expect(report.retriedCount).toBe(0);

      const item = useMutationStore.getState().mutations["mut-case-c"];
      expect(item.status).toBe("conflicted");
      expect(item.conflict?.currentVersion).toBe(3);
    });

    it("Case D: Marks CONFLICTED when target shape was deleted on server", async () => {
      mutationManager.registerMutation({
        mutationId: "mut-case-d",
        boardId: "board-1",
        resourceType: "shape",
        resourceId: "shape-deleted",
        operation: "update",
        expectedVersion: 1,
        intent: {
          resourceType: "shape",
          resourceId: "shape-deleted",
          operation: "update",
          expectedVersion: 1,
          changes: { x: 900 },
        },
      });

      // Authoritative recovery has empty shapes array
      const report = await mutationManager.reconcileBoard("board-1", []);
      expect(report.conflictCount).toBe(1);

      const item = useMutationStore.getState().mutations["mut-case-d"];
      expect(item.status).toBe("conflicted");
    });
  });

  describe("Slice 14 Mutation Idempotency Client Behaviors", () => {
    it("preserves stable mutationId and increments attemptCount across retries", async () => {
      const stableId = "00000000-0000-4000-8000-000000000001";

      mutationManager.registerMutation({
        mutationId: stableId,
        boardId: "board-1",
        resourceType: "shape",
        resourceId: "shape-1",
        operation: "update",
      });

      expect(useMutationStore.getState().mutations[stableId].attemptCount).toBe(1);

      // Re-registering existing mutation increments attemptCount
      mutationManager.registerMutation({
        mutationId: stableId,
        boardId: "board-1",
        resourceType: "shape",
        resourceId: "shape-1",
        operation: "update",
      });

      expect(useMutationStore.getState().mutations[stableId].attemptCount).toBe(2);
      expect(useMutationStore.getState().mutations[stableId].mutationId).toBe(stableId);
    });

    it("handles MUTATION_IN_PROGRESS by marking uncertain without generating new mutationId", async () => {
      const stableId = "00000000-0000-4000-8000-000000000002";
      vi.mocked(socketClientService.updateShape).mockRejectedValueOnce({
        code: "MUTATION_IN_PROGRESS",
        message: "Mutation is currently in progress.",
      });

      await expect(
        mutationManager.executeShapeUpdate("board-1", "shape-1", { x: 50 }, 1, stableId)
      ).rejects.toEqual({
        code: "MUTATION_IN_PROGRESS",
        message: "Mutation is currently in progress.",
      });

      const mutation = useMutationStore.getState().mutations[stableId];
      expect(mutation).toBeDefined();
      expect(mutation.status).toBe("uncertain");
      expect(mutation.mutationId).toBe(stableId);
    });

    it("handles IDEMPOTENCY_KEY_REUSED by marking mutation failed", async () => {
      const stableId = "00000000-0000-4000-8000-000000000003";
      vi.mocked(socketClientService.updateShape).mockRejectedValueOnce({
        code: "IDEMPOTENCY_KEY_REUSED",
        message: "Idempotency key reused with different payload.",
      });

      await expect(
        mutationManager.executeShapeUpdate("board-1", "shape-1", { x: 999 }, 1, stableId)
      ).rejects.toEqual({
        code: "IDEMPOTENCY_KEY_REUSED",
        message: "Idempotency key reused with different payload.",
      });

      const mutation = useMutationStore.getState().mutations[stableId];
      expect(mutation).toBeDefined();
      expect(mutation.status).toBe("failed");
    });
  });
});
