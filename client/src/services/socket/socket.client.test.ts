import { beforeEach, describe, expect, it, vi } from "vitest";
import { SocketClientService } from "./socket.client";
import { SocketEvents } from "./socket.events";

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
    const mockSocket: any = {
      connected: true,
      emit: vi.fn((event: string, payload: any, callback: (res: any) => void) => {
        if (event === SocketEvents.BOARD_JOIN) {
          callback({
            success: true,
            data: {
              boardId: payload.boardId,
              canvasId: "canvas-1",
              activeUsers: [{ userId: "user-1", role: "USER" }],
            },
          });
        }
      }),
    };

    (service as any).socket = mockSocket;

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
    const mockSocket: any = {
      connected: true,
      emit: vi.fn((event: string, _payload: any, callback: (res: any) => void) => {
        if (event === SocketEvents.BOARD_JOIN) {
          callback({
            success: false,
            error: { code: "FORBIDDEN", message: "Access denied." },
          });
        }
      }),
    };

    (service as any).socket = mockSocket;

    await expect(service.joinBoard("forbidden-board")).rejects.toThrow("Access denied.");
  });

  it("handles leaveBoard success acknowledgement", async () => {
    const mockSocket: any = {
      connected: true,
      emit: vi.fn((event: string, _payload: any, callback: (res: any) => void) => {
        if (event === SocketEvents.BOARD_LEAVE) {
          callback({ success: true });
        }
      }),
    };

    (service as any).socket = mockSocket;

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

    const mockSocket: any = {
      connected: true,
      emit: vi.fn((event: string, _payload: any, callback: (res: any) => void) => {
        if (event === SocketEvents.SHAPE_CREATE) {
          callback({
            success: true,
            data: mockResponse,
          });
        }
      }),
    };

    (service as any).socket = mockSocket;

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
    const mockSocket: any = {
      connected: true,
      emit: vi.fn((event: string, _payload: any, callback: (res: any) => void) => {
        if (event === SocketEvents.SHAPE_CREATE) {
          callback({
            success: false,
            error: { code: "BAD_REQUEST", message: "Invalid dimensions." },
          });
        }
      }),
    };

    (service as any).socket = mockSocket;

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

    const mockSocket: any = {
      connected: true,
      emit: vi.fn((event: string, _payload: any, callback: (res: any) => void) => {
        if (event === SocketEvents.SHAPE_UPDATE) {
          callback({
            success: true,
            data: mockUpdatedResponse,
          });
        }
      }),
    };

    (service as any).socket = mockSocket;

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
    const mockSocket: any = {
      connected: true,
      emit: vi.fn((event: string, _payload: any, callback: (res: any) => void) => {
        if (event === SocketEvents.SHAPE_DELETE) {
          callback({ success: true });
        }
      }),
    };

    (service as any).socket = mockSocket;

    await expect(service.deleteShape("shape-1")).resolves.toBeUndefined();
    expect(mockSocket.emit).toHaveBeenCalledWith(
      SocketEvents.SHAPE_DELETE,
      { shapeId: "shape-1" },
      expect.any(Function)
    );
  });

  it("handles moveCursor emitting cursor:move fire-and-forget", () => {
    const mockSocket: any = {
      connected: true,
      emit: vi.fn(),
    };

    (service as any).socket = mockSocket;

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
    const mockSocket: any = {
      connected: true,
      emit: vi.fn(),
    };

    (service as any).socket = mockSocket;

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

    const mockSocket: any = {
      connected: true,
      emit: vi.fn((_event, _payload, callback) => {
        callback({ success: true, data: mockLockData });
      }),
    };

    (service as any).socket = mockSocket;

    const result = await service.lockShape("board-123", "shape-1");

    expect(mockSocket.emit).toHaveBeenCalledWith(
      SocketEvents.SHAPE_LOCK,
      { boardId: "board-123", shapeId: "shape-1" },
      expect.any(Function)
    );
    expect(result).toEqual(mockLockData);
  });

  it("handles lockShape rejection on conflict error", async () => {
    const mockSocket: any = {
      connected: true,
      emit: vi.fn((_event, _payload, callback) => {
        callback({
          success: false,
          error: {
            code: "SHAPE_LOCKED",
            message: "Shape is currently being edited by another collaborator.",
          },
        });
      }),
    };

    (service as any).socket = mockSocket;

    await expect(service.lockShape("board-123", "shape-1")).rejects.toThrow(
      "Shape is currently being edited by another collaborator."
    );
  });

  it("handles unlockShape with acknowledgement", async () => {
    const mockSocket: any = {
      connected: true,
      emit: vi.fn((_event, _payload, callback) => {
        callback({ success: true });
      }),
    };

    (service as any).socket = mockSocket;

    await expect(service.unlockShape("board-123", "shape-1")).resolves.toBeUndefined();
    expect(mockSocket.emit).toHaveBeenCalledWith(
      SocketEvents.SHAPE_UNLOCK,
      { boardId: "board-123", shapeId: "shape-1" },
      expect.any(Function)
    );
  });

  it("handles refreshShapeLock with acknowledgement", async () => {
    const mockSocket: any = {
      connected: true,
      emit: vi.fn((_event, _payload, callback) => {
        callback({ success: true });
      }),
    };

    (service as any).socket = mockSocket;

    await expect(service.refreshShapeLock("board-123", "shape-1")).resolves.toBeUndefined();
    expect(mockSocket.emit).toHaveBeenCalledWith(
      SocketEvents.SHAPE_LOCK_REFRESH,
      { boardId: "board-123", shapeId: "shape-1" },
      expect.any(Function)
    );
  });

  it("emits shape:transforming fire-and-forget", () => {
    const mockSocket: any = {
      connected: true,
      emit: vi.fn(),
    };

    (service as any).socket = mockSocket;

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
    const mockSocket: any = {
      connected: true,
      emit: vi.fn(),
    };

    (service as any).socket = mockSocket;

    service.endShapeTransform("board-123", "shape-1");
    expect(mockSocket.emit).toHaveBeenCalledWith(
      SocketEvents.SHAPE_TRANSFORM_END,
      { boardId: "board-123", shapeId: "shape-1" }
    );
  });
});
