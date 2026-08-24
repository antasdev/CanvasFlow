import { Socket } from "socket.io";
import { Types } from "mongoose";
import jwt from "jsonwebtoken";

import { verifyAccessToken } from "@/modules/auth/auth.tokens";
import {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
} from "./socket.types";

/**
 * Socket.IO authentication middleware.
 * Verifies JWT token from handshake auth or headers, extracts user identity,
 * and attaches authenticated user data to socket.data.user.
 */
export const socketAuthMiddleware = (
  socket: Socket<
    ClientToServerEvents,
    ServerToClientEvents,
    InterServerEvents,
    SocketData
  >,
  next: (err?: Error) => void
): void => {
  try {
    const rawAuth =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization;

    if (!rawAuth || typeof rawAuth !== "string") {
      return next(new Error("Authentication required: token missing."));
    }

    const token = rawAuth.startsWith("Bearer ")
      ? rawAuth.substring(7).trim()
      : rawAuth.trim();

    if (!token) {
      return next(new Error("Authentication required: token missing."));
    }

    const payload = verifyAccessToken(token);

    if (!payload || !payload.userId) {
      return next(new Error("Authentication failed: invalid token payload."));
    }

    socket.data.user = {
      userId: new Types.ObjectId(payload.userId),
      role: payload.role,
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(new Error("Authentication failed: token expired."));
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return next(new Error("Authentication failed: invalid token."));
    }

    return next(new Error("Authentication failed."));
  }
};