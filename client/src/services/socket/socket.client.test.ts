import { beforeEach, describe, expect, it, vi } from "vitest";

import { SocketClientService } from "./socket.client";
import { SocketEvents } from "./socket.events";

type MockCallback = (res: unknown) => void;

interface MockSocket {
  connected: boolean;
  emit: (event: string, payload?: unknown, callback?: MockCallback) => void;
  on?: (event: string, handler: (...args: unknown[]) => void) => void;
  off?: (event: string, handler?: (...args: unknown[]) => void) => void;
  auth?: Record<string, unknown>;
}

function setMockSocket(svc: SocketClientService, socket: MockSocket): void {
  (svc as unknown as { socket: MockSocket }).socket = socket;
}

describe("SocketClientService", () => {
  let service: SocketClientService;

  beforeEach(() => {
    service = new SocketClientService();
  });

  it("initializes in disconnected state", () => {
    expect(service.getConnectionState()).toBe("disconnected");
    expect(service.isConnected()).toBe(false);
    expect(service.getSocket()).toBeNull();
  });

  it("subscribes to connection state changes and immediately receives current state", () => {
    const recordedStates: string[] = [];
    const unsubscribe = service.onStateChange((state) => {
      recordedStates.push(state);
    });

    expect(recordedStates).toEqual(["disconnected"]);

    unsubscribe();
  });

  it("handles disconnect safely when not connected", () => {
    expect(() => service.disconnect()).not.toThrow();
    expect(service.getConnectionState()).toBe("disconnected");
    expect(service.getSocket()).toBeNull();
  });

  it("updates auth token format cleanly", () => {
    expect(() => service.updateToken("test-jwt-token")).not.toThrow();
  });

  it("exposes consistent event constants", () => {
    expect(SocketEvents.BOARD_JOIN).toBe("board:join");
    expect(SocketEvents.BOARD_LEAVE).toBe("board:leave");
    expect(SocketEvents.CANVAS_SYNC).toBe("canvas:sync");
    expect(SocketEvents.SHAPE_CREATE).toBe("shape:create");
    expect(SocketEvents.SHAPE_CREATED).toBe("shape:created");
    expect(SocketEvents.SHAPE_UPDATE).toBe("shape:update");
    expect(SocketEvents.SHAPE_UPDATED).toBe("shape:updated");
    expect(SocketEvents.SHAPE_DELETE).toBe("shape:delete");
    expect(SocketEvents.SHAPE_DELETED).toBe("shape:deleted");
    expect(SocketEvents.USER_JOINED).toBe("user:joined");
    expect(SocketEvents.USER_LEFT).toBe("user:left");
    expect(SocketEvents.CURSOR_MOVE).toBe("cursor:move");
    expect(SocketEvents.CURSOR_MOVED).toBe("cursor:moved");
    expect(SocketEvents.SHAPE_TRANSFORMING).toBe("shape:transforming");
    expect(SocketEvents.SHAPE_TRANSFORM_END).toBe("shape:transform-end");
    expect(SocketEvents.ERROR).toBe("error");
  });

  it("handles joinBoard success acknowledgement", async () => {
    const mockSocket: MockSocket = {
      connected: true,
      emit: vi.fn((event: string, payload: unknown, callback?: MockCallback) => {
        if (event === SocketEvents.BOARD_JOIN) {
          const boardPayload = payload as { boardId: string };
          callback?.({
            success: true,
            data: {
              boardId: boardPayload.boardId,
              canvasId: "canvas-1",
              activeUsers: [{ userId: "user-1", role: "USER" }],
            },
          });
        }
      }),
    };

    setMockSocket(service, mockSocket);

    const result = await service.joinBoard("board-123");
    expect(result.boardId).toBe("board-123");
    expect(result.canvasId).toBe("canvas-1");
    expect(result.activeUsers).toHaveLength(1);
    expect(mockSocket.emit).toHaveBeenCalledWith(
      SocketEvents.BOARD_JOIN,
      { boardId: "board-123" },
      expect.any(Function)
    );
  });

  it("handles joinBoard failure acknowledgement", async () => {
    const mockSocket: MockSocket = {
      connected: true,
      emit: vi.fn((event: string, _payload: unknown, callback?: MockCallback) => {
        if (event === SocketEvents.BOARD_JOIN) {
          callback?.({
            success: false,
            error: { code: "FORBIDDEN", message: "Access denied." },
          });
        }
      }),
    };

    setMockSocket(service, mockSocket);

    await expect(service.joinBoard("forbidden-board")).rejects.toThrow("Access denied.");
  });

  it("handles leaveBoard success acknowledgement", async () => {
    const mockSocket: MockSocket = {
      connected: true,
      emit: vi.fn((event: string, _payload: unknown, callback?: MockCallback) => {
        if (event === SocketEvents.BOARD_LEAVE) {
          callback?.({ success: true });
        }
      }),
    };

    setMockSocket(service, mockSocket);

    await expect(service.leaveBoard("board-123")).resolves.toBeUndefined();
    expect(mockSocket.emit).toHaveBeenCalledWith(
      SocketEvents.BOARD_LEAVE,
      { boardId: "board-123" },
      expect.any(Function)
    );
  });

  it("handles createShape success acknowledgement", async () => {
    const mockResponse = {
      id: "shape-1",
      canvasId: "canvas-1",
      type: "rectangle" as const,
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      rotation: 0,
      zIndex: 1,
      style: {
        fill: "#ffffff",
        stroke: "#000000",
        strokeWidth: 2,
        opacity: 1,
      },
      createdBy: "user-1",
      createdAt: "2026-08-22T00:00:00.000Z",
      updatedAt: "2026-08-22T00:00:00.000Z",
    };

    const mockSocket: MockSocket = {
      connected: true,
      emit: vi.fn((event: string, _payload: unknown, callback?: MockCallback) => {
        if (event === SocketEvents.SHAPE_CREATE) {
          callback?.({
            success: true,
            data: mockResponse,
          });
        }
      }),
    };

    setMockSocket(service, mockSocket);

    const result = await service.createShape({
      canvasId: "canvas-1",
      type: "rectangle",
      x: 10,
      y: 20,
      width: 100,
      height: 50,
    });

    expect(result.id).toBe("shape-1");
    expect(result.width).toBe(100);
    expect(mockSocket.emit).toHaveBeenCalledWith(
      SocketEvents.SHAPE_CREATE,
      expect.objectContaining({ canvasId: "canvas-1", width: 100 }),
      expect.any(Function)
    );
  });

  it("handles createShape failure acknowledgement", async () => {
    const mockSocket: MockSocket = {
      connected: true,
      emit: vi.fn((event: string, _payload: unknown, callback?: MockCallback) => {
        if (event === SocketEvents.SHAPE_CREATE) {
          callback?.({
            success: false,
            error: { code: "BAD_REQUEST", message: "Invalid dimensions." },
          });
        }
      }),
    };

    setMockSocket(service, mockSocket);

    await expect(
      service.createShape({
        canvasId: "canvas-1",
        type: "rectangle",
        x: 0,
        y: 0,
        width: -10,
        height: 50,
      })
    ).rejects.toThrow("Invalid dimensions.");
  });

  it("handles updateShape success acknowledgement", async () => {
    const mockUpdatedResponse = {
      id: "shape-1",
      canvasId: "canvas-1",
      type: "rectangle" as const,
      x: 50,
      y: 60,
      width: 200,
      height: 100,
      rotation: 45,
      zIndex: 1,
      style: {
        fill: "#ffffff",
        stroke: "#000000",
        strokeWidth: 2,
        opacity: 1,
      },
      createdBy: "user-1",
      createdAt: "2026-08-22T00:00:00.000Z",
      updatedAt: "2026-08-22T00:00:00.000Z",
    };

    const mockSocket: MockSocket = {
      connected: true,
      emit: vi.fn((event: string, _payload: unknown, callback?: MockCallback) => {
        if (event === SocketEvents.SHAPE_UPDATE) {
          callback?.({
            success: true,
            data: mockUpdatedResponse,
          });
        }
      }),
    };

    setMockSocket(service, mockSocket);

    const result = await service.updateShape("shape-1", {
      x: 50,
      y: 60,
      width: 200,
      rotation: 45,
    });

    expect(result.x).toBe(50);
    expect(result.rotation).toBe(45);
    expect(mockSocket.emit).toHaveBeenCalledWith(
      SocketEvents.SHAPE_UPDATE,
      {
        shapeId: "shape-1",
        data: { x: 50, y: 60, width: 200, rotation: 45 },
      },
      expect.any(Function)
    );
  });

  it("handles deleteShape success acknowledgement", async () => {
    const mockSocket: MockSocket = {
      connected: true,
      emit: vi.fn((event: string, _payload: unknown, callback?: MockCallback) => {
        if (event === SocketEvents.SHAPE_DELETE) {
          callback?.({ success: true });
        }
      }),
    };

    setMockSocket(service, mockSocket);

    await expect(service.deleteShape("shape-1")).resolves.toBeUndefined();
    expect(mockSocket.emit).toHaveBeenCalledWith(
      SocketEvents.SHAPE_DELETE,
      { shapeId: "shape-1" },
      expect.any(Function)
    );
  });

  it("handles moveCursor emitting cursor:move fire-and-forget", () => {
    const mockSocket: MockSocket = {
      connected: true,
      emit: vi.fn(),
    };

    setMockSocket(service, mockSocket);

    service.moveCursor("board-123", { x: 150, y: 250 });

    expect(mockSocket.emit).toHaveBeenCalledWith(
      SocketEvents.CURSOR_MOVE,
      {
        boardId: "board-123",
        x: 150,
        y: 250,
      }
    );
  });

  it("handles changeSelection emitting selection:change fire-and-forget", () => {
    const mockSocket: MockSocket = {
      connected: true,
      emit: vi.fn(),
    };

    setMockSocket(service, mockSocket);

    service.changeSelection("board-123", ["shape-1", "shape-2"]);

    expect(mockSocket.emit).toHaveBeenCalledWith(
      SocketEvents.SELECTION_CHANGE,
      {
        boardId: "board-123",
        shapeIds: ["shape-1", "shape-2"],
      }
    );
  });

  it("handles lockShape with acknowledgement on success", async () => {
    const mockLockData = {
      boardId: "board-123",
      shapeId: "shape-1",
      userId: "user-1",
      fullName: "Alice Developer",
      color: "#EF4444",
    };

    const mockSocket: MockSocket = {
      connected: true,
      emit: vi.fn((_event: string, _payload: unknown, callback?: MockCallback) => {
        callback?.({ success: true, data: mockLockData });
      }),
    };

    setMockSocket(service, mockSocket);

    const result = await service.lockShape("board-123", "shape-1");

    expect(mockSocket.emit).toHaveBeenCalledWith(
      SocketEvents.SHAPE_LOCK,
      { boardId: "board-123", shapeId: "shape-1" },
      expect.any(Function)
    );
    expect(result).toEqual(mockLockData);
  });

  it("handles lockShape rejection on conflict error", async () => {
    const mockSocket: MockSocket = {
      connected: true,
      emit: vi.fn((_event: string, _payload: unknown, callback?: MockCallback) => {
        callback?.({
          success: false,
          error: {
            code: "SHAPE_LOCKED",
            message: "Shape is currently being edited by another collaborator.",
          },
        });
      }),
    };

    setMockSocket(service, mockSocket);

    await expect(service.lockShape("board-123", "shape-1")).rejects.toThrow(
      "Shape is currently being edited by another collaborator."
    );
  });

  it("handles unlockShape with acknowledgement", async () => {
    const mockSocket: MockSocket = {
      connected: true,
      emit: vi.fn((_event: string, _payload: unknown, callback?: MockCallback) => {
        callback?.({ success: true });
      }),
    };

    setMockSocket(service, mockSocket);

    await expect(service.unlockShape("board-123", "shape-1")).resolves.toBeUndefined();
    expect(mockSocket.emit).toHaveBeenCalledWith(
      SocketEvents.SHAPE_UNLOCK,
      { boardId: "board-123", shapeId: "shape-1" },
      expect.any(Function)
    );
  });

  it("handles refreshShapeLock with acknowledgement", async () => {
    const mockSocket: MockSocket = {
      connected: true,
      emit: vi.fn((_event: string, _payload: unknown, callback?: MockCallback) => {
        callback?.({ success: true });
      }),
    };

    setMockSocket(service, mockSocket);

    await expect(service.refreshShapeLock("board-123", "shape-1")).resolves.toBeUndefined();
    expect(mockSocket.emit).toHaveBeenCalledWith(
      SocketEvents.SHAPE_LOCK_REFRESH,
      { boardId: "board-123", shapeId: "shape-1" },
      expect.any(Function)
    );
  });

  it("emits shape:transforming fire-and-forget", () => {
    const mockSocket: MockSocket = {
      connected: true,
      emit: vi.fn(),
    };

    setMockSocket(service, mockSocket);

    const payload = {
      boardId: "board-123",
      shapeId: "shape-1",
      x: 100,
      y: 200,
      width: 150,
      height: 120,
      rotation: 45,
    };

    service.transformShape(payload);
    expect(mockSocket.emit).toHaveBeenCalledWith(
      SocketEvents.SHAPE_TRANSFORMING,
      payload
    );
  });

  it("emits shape:transform-end fire-and-forget", () => {
    const mockSocket: MockSocket = {
      connected: true,
      emit: vi.fn(),
    };

    setMockSocket(service, mockSocket);

    service.endShapeTransform("board-123", "shape-1");
    expect(mockSocket.emit).toHaveBeenCalledWith(
      SocketEvents.SHAPE_TRANSFORM_END,
      { boardId: "board-123", shapeId: "shape-1" }
    );
  });

  it("tracks connectionEpoch counter", () => {
    expect(service.getConnectionEpoch()).toBe(0);
  });

  it("handles recoverBoard success acknowledgement with revision", async () => {
    const mockRecoveryData = {
      boardId: "board-123",
      revision: 42,
      recoveredAt: "2026-08-23T12:00:00.000Z",
      presence: {
        activeUsers: [
          {
            userId: "user-1",
            fullName: "Alice",
            color: "#3B82F6",
            joinedAt: "2026-08-23T12:00:00.000Z",
          },
        ],
      },
    };

    const mockSocket: MockSocket = {
      connected: true,
      emit: vi.fn((event: string, _payload: unknown, callback?: MockCallback) => {
        if (event === SocketEvents.BOARD_RECOVERY_REQUEST) {
          callback?.({
            success: true,
            data: mockRecoveryData,
          });
        }
      }),
    };

    setMockSocket(service, mockSocket);

    const result = await service.recoverBoard("board-123");
    expect(result.boardId).toBe("board-123");
    expect(result.revision).toBe(42);
    expect(result.recoveredAt).toBe("2026-08-23T12:00:00.000Z");
    expect(result.presence.activeUsers).toHaveLength(1);
    expect(mockSocket.emit).toHaveBeenCalledWith(
      SocketEvents.BOARD_RECOVERY_REQUEST,
      { boardId: "board-123" },
      expect.any(Function)
    );
  });

  it("handles recoverBoard failure acknowledgement", async () => {
    const mockSocket: MockSocket = {
      connected: true,
      emit: vi.fn((event: string, _payload: unknown, callback?: MockCallback) => {
        if (event === SocketEvents.BOARD_RECOVERY_REQUEST) {
          callback?.({
            success: false,
            error: { code: "FORBIDDEN", message: "Forbidden board recovery." },
          });
        }
      }),
    };

    setMockSocket(service, mockSocket);

    await expect(service.recoverBoard("board-123")).rejects.toThrow(
      "Forbidden board recovery."
    );
  });

  it("subscribes and unsubscribes to onRecoveryState broadcasts", () => {
    const mockHandler = vi.fn();
    const mockSocket: MockSocket = {
      connected: true,
      emit: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    };

    setMockSocket(service, mockSocket);

    const unsubscribe = service.onRecoveryState(mockHandler);
    expect(mockSocket.on).toHaveBeenCalledWith(
      SocketEvents.BOARD_RECOVERY_STATE,
      mockHandler
    );

    unsubscribe();
    expect(mockSocket.off).toHaveBeenCalledWith(
      SocketEvents.BOARD_RECOVERY_STATE,
      mockHandler
    );
  });
});
