import { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { SocketServer } from "./socket.server";
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "./socket.types";

let socketServerInstance: SocketServer | null = null;

export const initializeSocketServer = (
  httpServer: HttpServer
): SocketServer => {
  socketServerInstance = new SocketServer(httpServer);
  return socketServerInstance;
};

export const getIO = (): Server<
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData
> => {
  if (!socketServerInstance) {
    throw new Error("Socket.IO has not been initialized.");
  }
  return socketServerInstance.getIO();
};

export * from "./socket.events";
export * from "./socket.types";
export * from "./socket.rooms";
export * from "./socket.middleware";
export * from "./socket.server";
export * from "./presence/presence.manager";
export * from "./handlers/board.handler";