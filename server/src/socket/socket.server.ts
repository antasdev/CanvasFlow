import { Server as HttpServer } from "http";
import { Server } from "socket.io";

import env from "@/config/env";
import { SocketEvents } from "./socket.events";
import { socketAuthMiddleware } from "./socket.middleware";
import { registerBoardHandlers } from "./handlers/board.handler";
import { presenceManager } from "./presence/presence.manager";
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

      // Handle Socket Disconnection Lifecycle & Multi-Tab Presence Cleanup
      socket.on(SocketEvents.DISCONNECT, (reason) => {
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