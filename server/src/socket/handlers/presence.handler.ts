import { Server } from "socket.io";
import {
  AuthSocket,
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "../socket.types";

/**
 * Register presence event handlers (cursor movement, active users).
 * Implementation reserved for Presence slice.
 */
export const registerPresenceHandlers = (
  _io: Server<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >,
  _socket: AuthSocket
): void => {
  // Handlers will be attached in Presence slice
};