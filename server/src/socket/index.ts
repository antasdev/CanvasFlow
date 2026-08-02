import { Server as HttpServer } from "http";
import { Server } from "socket.io";

import { SocketServer } from "./socket.server";

let socketServer: SocketServer | null = null;

export const initializeSocket = (
  httpServer: HttpServer
): Server => {
  socketServer = new SocketServer(httpServer);

  return socketServer.getIO();
};

export const getIO = (): Server => {
  if (!socketServer) {
    throw new Error(
      "Socket.IO has not been initialized."
    );
  }

  return socketServer.getIO();
};