import { Socket } from "socket.io";

import { authenticateToken } from "@/shared/utils/auth.util";
import { SocketData } from "./socket.types";

export const socketAuthMiddleware = (
  socket: Socket<{}, {}, {}, SocketData>,
  next: (err?: Error) => void
): void => {
  try {
    const authorization =
      socket.handshake.auth.token;

    if (!authorization) {
      return next(
        new Error("Authentication required.")
      );
    }

    const token = authorization.startsWith(
      "Bearer "
    )
      ? authorization.substring(7)
      : authorization;

    socket.data.user =
      authenticateToken(token);

    next();
  } catch {
    next(
      new Error("Authentication failed.")
    );
  }
};