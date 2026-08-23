import { Server as HttpServer } from "http";
import { Server } from "socket.io";

import env from "@/config/env";
import { SocketEvents } from "./socket.events";
import { socketAuthMiddleware } from "./socket.middleware";
import { registerBoardHandlers } from "./handlers/board.handler";
import { registerShapeHandlers } from "./handlers/shape.handler";
import { registerCursorHandlers } from "./handlers/cursor.handler";
import { registerSelectionHandlers } from "./handlers/selection.handler";
import { registerLockHandlers } from "./handlers/lock.handler";
import { registerTransformHandlers } from "./handlers/transform.handler";
import { registerCommentHandlers } from "./handlers/comment.handler";
import { presenceManager } from "./presence/presence.manager";
import { shapeLockManager } from "./locks/shape-lock.manager";
import { getBoardRoom } from "./socket.rooms";
import {
  AuthSocket,
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "./socket.types";

export class SocketServer {
  private io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >;

  constructor(httpServer: HttpServer) {
    this.io = new Server<
      ClientToServerEvents,
      ServerToClientEvents,
      InterServerEvents,
      SocketData
    >(httpServer, {
      cors: {
        origin: env.CLIENT_URL,
        credentials: true,
      },
    });

    this.io.use(socketAuthMiddleware);

    this.registerConnection();
  }

  private registerConnection(): void {
    this.io.on(SocketEvents.CONNECTION, (socket: AuthSocket) => {
      console.log(
        `[Socket] Authenticated connection established: ${socket.id} (User: ${socket.data.user.userId})`
      );

      // Register Slice 2 Board Room Handlers
      registerBoardHandlers(socket);

      // Register Slice 3 Real-Time Shape Handlers
      registerShapeHandlers(socket);

      // Register Slice 4 Live Collaborator Cursor Handlers
      registerCursorHandlers(socket);

      // Register Slice 5 Live Collaborator Selection Handlers
      registerSelectionHandlers(socket);

      // Register Slice 6 Collaborative Selection Conflict & Lock Handlers
      registerLockHandlers(socket);

      // Register Slice 8 Real-Time Shape Transform Streaming Handlers
      registerTransformHandlers(socket);

      // Register Slice 9 Real-Time Comments & Collaborative Annotations Handlers
      registerCommentHandlers(socket);

      // Handle Socket Disconnection Lifecycle, Lock Release & Presence Cleanup
      socket.on(SocketEvents.DISCONNECT, (reason) => {
        // 1. Release any shape locks held by this specific socket
        const releasedLocks = shapeLockManager.releaseSocketLocks(socket.id);
        for (const lock of releasedLocks) {
          const room = getBoardRoom(lock.boardId);
          this.io.to(room).emit(SocketEvents.SHAPE_UNLOCKED, {
            boardId: lock.boardId,
            shapeId: lock.shapeId,
          });
        }

        // 2. Update multi-tab presence
        const removeResult = presenceManager.removeSocket(socket.id);

        if (
          removeResult.boardId &&
          removeResult.isLastSocketForUser &&
          removeResult.removedUserId
        ) {
          const room = getBoardRoom(removeResult.boardId);
          this.io.to(room).emit(SocketEvents.USER_LEFT, {
            userId: removeResult.removedUserId,
            activeUsers: removeResult.activeUsers,
          });
        }

        console.log(
          `[Socket] Connection disconnected: ${socket.id} (Reason: ${reason})`
        );
      });
    });
  }

  public getIO(): Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  > {
    return this.io;
  }

  public close(): Promise<void> {
    return new Promise((resolve) => {
      this.io.close(() => {
        resolve();
      });
    });
  }
}