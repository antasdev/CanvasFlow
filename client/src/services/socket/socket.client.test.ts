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
});
