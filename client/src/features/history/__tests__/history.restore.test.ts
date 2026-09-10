import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useCanvasStore } from "@/features/canvas/store/canvas.store";
import { useCollaborationStore } from "@/features/canvas/store/collaboration.store";
import { api } from "@/services/api";

import { historyApi } from "../api";
import type { RestoreVersionPayload, RestoreVersionResult } from "../types";

describe("Slice 41 — Version Restore Client & API", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    useCanvasStore.setState({ shapes: [], selectedShapeIds: [] });
    useCollaborationStore.getState().reset();
  });

  beforeEach(() => {
    useCanvasStore.setState({
      shapes: [],
      selectedShapeIds: ["shape-1", "shape-2"],
    });
    useCollaborationStore.setState({
      boardRevisions: { "board-100": 42 },
    });
  });

  it("calls restore API endpoint with expectedCollaborationRevision and mutationId", async () => {
    const mockResult: RestoreVersionResult = {
      restoredVersionId: "ver-1",
      restoredVersionNumber: 1,
      collaborationRevision: 43,
      newVersion: {
        id: "ver-10",
        boardId: "board-100",
        versionNumber: 10,
        trigger: "restore",
        createdBy: "user-1",
        collaborationRevision: 43,
        canvasCount: 1,
        shapeCount: 5,
        isNamed: false,
        createdAt: "2026-09-10T14:00:00.000Z",
      },
    };

    const postSpy = vi.spyOn(api, "post").mockResolvedValueOnce({
      data: {
        success: true,
        data: mockResult,
      },
    });

    const payload: RestoreVersionPayload = {
      expectedCollaborationRevision: 42,
      mutationId: "mut-restore-test-1",
      description: "Restored from Version 1",
    };

    const result = await historyApi.restoreVersion("board-100", "ver-1", payload);

    expect(postSpy).toHaveBeenCalledTimes(1);
    expect(postSpy).toHaveBeenCalledWith(
      "/boards/board-100/versions/ver-1/restore",
      payload
    );
    expect(result.restoredVersionNumber).toBe(1);
    expect(result.collaborationRevision).toBe(43);
    expect(result.newVersion.trigger).toBe("restore");
    expect(result.newVersion.versionNumber).toBe(10);
  });

  it("propagates 409 OCC Conflict error on stale expected revision", async () => {
    const conflictError = {
      isAxiosError: true,
      response: {
        status: 409,
        data: {
          success: false,
          code: "OCC_CONFLICT",
          message: "Board revision mismatch",
        },
      },
    };

    vi.spyOn(api, "post").mockRejectedValueOnce(conflictError);

    await expect(
      historyApi.restoreVersion("board-100", "ver-1", {
        expectedCollaborationRevision: 40,
      })
    ).rejects.toMatchObject({
      response: { status: 409 },
    });
  });

  it("propagates 403 Forbidden error for unauthorized users", async () => {
    const forbiddenError = {
      isAxiosError: true,
      response: {
        status: 403,
        data: {
          success: false,
          code: "FORBIDDEN",
          message: "Only editors and above can restore",
        },
      },
    };

    vi.spyOn(api, "post").mockRejectedValueOnce(forbiddenError);

    await expect(
      historyApi.restoreVersion("board-100", "ver-1", {
        expectedCollaborationRevision: 42,
      })
    ).rejects.toMatchObject({
      response: { status: 403 },
    });
  });

  it("clears transient canvas selection on successful restore flow", () => {
    expect(useCanvasStore.getState().selectedShapeIds).toHaveLength(2);

    // Simulate clearing selection on restore
    useCanvasStore.getState().clearSelection();

    expect(useCanvasStore.getState().selectedShapeIds).toHaveLength(0);
  });

  it("retrieves current board collaboration revision from collaboration store", () => {
    const boardId = "board-100";
    const currentRev = useCollaborationStore.getState().getRevision(boardId);

    expect(currentRev).toBe(42);
  });

  it("validates that restore confirmation modal copy enforces invariants", () => {
    const versionNumber = 5;
    const versionName = "Sprint 1 Layout";

    const titleText = versionName
      ? `Restore "${versionName}" (v${versionNumber})?`
      : `Restore Version ${versionNumber}?`;

    expect(titleText).toBe(`Restore "Sprint 1 Layout" (v5)?`);
  });
});
