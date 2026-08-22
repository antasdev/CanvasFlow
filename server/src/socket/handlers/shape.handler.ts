import { Server } from "socket.io";
import {
  AuthSocket,
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../socket.types";

/**
 * Register shape event handlers (create, update, delete).
 * Implementation reserved for Shape Events slice.
 */
export const registerShapeHandlers = (
  _io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >,
  _socket: AuthSocket
): void => {
  // Handlers will be attached in Shape Collaboration slice
};