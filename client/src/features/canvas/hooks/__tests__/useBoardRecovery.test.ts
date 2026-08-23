import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";

import { useCanvasStore } from "../../store";
import { useCommentStore } from "@/features/comments/store";
import { socketClientService } from "@/services/socket";
import { shapeApi } from "../../api/shape.api";
import { commentApi } from "@/features/comments/api";
import { mapShapeResponseToShape } from "../../api/shape.mapper";

vi.mock("@/services/socket", () => ({
  socketClientService: {
    connect: vi.fn(),
    getSocket: vi.fn(),
    recoverBoard: vi.fn(),
    onRecoveryState: vi.fn(() => () => {}),
  },
  SocketEvents: {
    BOARD_RECOVERY_REQUEST: "board:recovery-request",
    BOARD_RECOVERY_STATE: "board:recovery-state",
  },
}));

vi.mock("../../api/shape.api", () => ({
  shapeApi: {
    getShapes: vi.fn(),
  },
}));

vi.mock("@/features/comments/api", () => ({
  commentApi: {
    getComments: vi.fn(),
  },
}));

describe("Board Recovery Logic & State Integration Tests", () => {
  beforeEach(() => {
    useCanvasStore.getState().resetCanvas();
    useCommentStore.getState().clearComments();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("clears ephemeral collaboration state and hydrates authoritative shapes & comments on recovery", async () => {
    // 1. Setup initial store state with ephemeral cursors, selections, locks, transforms
    useCanvasStore.getState().setRemoteCursor({
      userId: "user-1",
      boardId: "board-1",
      x: 100,
      y: 200,
    });
    useCanvasStore.getState().setRemoteSelection({
      userId: "user-1",
      boardId: "board-1",
      shapeIds: ["shape-1"],
    });
    useCanvasStore.getState().setRemoteShapeLock({
      shapeId: "shape-1",
      boardId: "board-1",
      userId: "user-1",
      fullName: "Alice",
      color: "#EF4444",
    });
    useCanvasStore.getState().setRemoteShapeTransform({
      shapeId: "shape-1",
      boardId: "board-1",
      userId: "user-1",
      fullName: "Alice",
      color: "#EF4444",
      x: 150,
      y: 250,
      width: 100,
      height: 100,
      rotation: 0,
      lastUpdatedAt: Date.now(),
    });

    expect(Object.keys(useCanvasStore.getState().remoteCursors)).toHaveLength(1);
    expect(Object.keys(useCanvasStore.getState().remoteSelections)).toHaveLength(1);
    expect(Object.keys(useCanvasStore.getState().remoteShapeLocks)).toHaveLength(1);
    expect(Object.keys(useCanvasStore.getState().remoteShapeTransforms)).toHaveLength(1);

    // 2. Clear ephemeral state as recovery start action
    useCanvasStore.getState().clearRemoteCursors();
    useCanvasStore.getState().clearRemoteSelections();
    useCanvasStore.getState().clearRemoteShapeLocks();
    useCanvasStore.getState().clearRemoteShapeTransforms();

    expect(Object.keys(useCanvasStore.getState().remoteCursors)).toHaveLength(0);
    expect(Object.keys(useCanvasStore.getState().remoteSelections)).toHaveLength(0);
    expect(Object.keys(useCanvasStore.getState().remoteShapeLocks)).toHaveLength(0);
    expect(Object.keys(useCanvasStore.getState().remoteShapeTransforms)).toHaveLength(0);

    // 3. Mock authoritative recovery responses
    const mockRecoveryState = {
      boardId: "board-1",
      recoveredAt: "2026-08-23T12:00:00.000Z",
      presence: {
        activeUsers: [
          {
            userId: "user-current",
            fullName: "Current User",
            email: "current@example.com",
            role: "USER" as const,
            color: "#3B82F6",
            joinedAt: "2026-08-23T12:00:00.000Z",
          },
        ],
      },
    };

    const mockShapes = [
      {
        id: "recovered-shape-1",
        canvasId: "canvas-1",
        type: "rectangle" as const,
        x: 300,
        y: 400,
        width: 150,
        height: 100,
        rotation: 0,
        zIndex: 1,
        style: {
          fill: "#10B981",
          stroke: "#047857",
          strokeWidth: 2,
          opacity: 1,
        },
        createdBy: "user-owner",
        createdAt: "2026-08-23T12:00:00.000Z",
        updatedAt: "2026-08-23T12:00:00.000Z",
      },
    ];

    const mockComments = [
      {
        id: "comment-1",
        boardId: "board-1",
        shapeId: null,
        authorId: "user-1",
        author: {
          id: "user-1",
          fullName: "Alice",
        },
        parentCommentId: null,
        content: "Authoritative comment recovered",
        isResolved: false,
        isEdited: false,
        isDeleted: false,
        createdAt: "2026-08-23T12:00:00.000Z",
        updatedAt: "2026-08-23T12:00:00.000Z",
      },
    ];

    vi.mocked(socketClientService.recoverBoard).mockResolvedValue(mockRecoveryState);
    vi.mocked(shapeApi.getShapes).mockResolvedValue(mockShapes as any);
    vi.mocked(commentApi.getComments).mockResolvedValue(mockComments as any);

    // 4. Execute recovery hydration steps
    const [recoveryState, rawShapes, comments] = await Promise.all([
      socketClientService.recoverBoard("board-1"),
      shapeApi.getShapes("canvas-1"),
      commentApi.getComments("board-1"),
    ]);

    const mappedShapes = rawShapes.map(mapShapeResponseToShape);
    useCanvasStore.getState().replaceShapesFromRecovery(mappedShapes);
    useCommentStore.getState().setComments(comments);

    // 5. Verify authoritative store state
    expect(recoveryState.boardId).toBe("board-1");
    expect(useCanvasStore.getState().shapes).toHaveLength(1);
    expect(useCanvasStore.getState().shapes[0].id).toBe("recovered-shape-1");
    expect(useCanvasStore.getState().shapes[0].x).toBe(300);
    expect(Object.keys(useCommentStore.getState().comments)).toHaveLength(1);
    expect(useCommentStore.getState().comments["comment-1"].content).toBe(
      "Authoritative comment recovered"
    );

    // 6. Verify Undo/Redo stacks were NOT polluted by recovery
    expect(useCanvasStore.getState().past).toHaveLength(0);
    expect(useCanvasStore.getState().future).toHaveLength(0);
    expect(useCanvasStore.getState().canUndo()).toBe(false);
  });

  it("handles slow REST hydration without corrupting intermediate local changes", async () => {
    // 1. User performs local edit
    const initialShape = {
      id: "local-1",
      type: "rectangle" as const,
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
      zIndex: 1,
      fill: "#ffffff",
      stroke: "#000000",
      strokeWidth: 2,
    };
    useCanvasStore.getState().addShape(initialShape);
    expect(useCanvasStore.getState().past).toHaveLength(1);

    // 2. Recovery hydration arrives and replaces shapes
    const authoritativeShapes = [
      {
        id: "server-1",
        type: "rectangle" as const,
        x: 200,
        y: 200,
        width: 120,
        height: 80,
        rotation: 0,
        opacity: 1,
        zIndex: 1,
        fill: "#3b82f6",
        stroke: "#1e40af",
        strokeWidth: 2,
      },
    ];

    useCanvasStore.getState().replaceShapesFromRecovery(authoritativeShapes);

    expect(useCanvasStore.getState().shapes).toHaveLength(1);
    expect(useCanvasStore.getState().shapes[0].id).toBe("server-1");

    // Past undo history is preserved
    expect(useCanvasStore.getState().past).toHaveLength(1);
  });
});
