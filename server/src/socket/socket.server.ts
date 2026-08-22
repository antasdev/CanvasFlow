import { Server as HttpServer } from "http";
import { Server } from "socket.io";

import env from "@/config/env";
import { SocketEvents } from "./socket.events";
import { socketAuthMiddleware } from "./socket.middleware";
import {
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
    this.io.on(SocketEvents.CONNECTION, (socket) => {
      console.log(
        `[Socket] Authenticated connection established: ${socket.id} (User: ${socket.data.user.userId})`
      );

      socket.on(SocketEvents.DISCONNECT, (reason) => {
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