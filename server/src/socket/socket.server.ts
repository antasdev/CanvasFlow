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
import { registerRecoveryHandlers } from "./handlers/recovery.handler";
import { registerPresenceHandlers } from "./handlers/presence.handler";
import { registerInteractionHandlers } from "./handlers/interaction.handler";
import { presenceManager } from "./presence/presence.manager";
import { interactionManager } from "./presence/interaction.manager";
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
  private cleanupInterval?: NodeJS.Timeout;

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
    this.startStaleSessionPruning();
  }

  private startStaleSessionPruning(): void {
    // Periodically prune stale presence sessions and interactions every 5 seconds
    this.cleanupInterval = setInterval(() => {
      this.pruneStaleSessions();
      this.pruneStaleInteractions();
    }, 5000);
    // Unref so timer does not prevent process exit in test runners
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  public pruneStaleSessions(timeoutMs: number = 45000): void {
    const expiredSessions = presenceManager.removeExpiredSessions(timeoutMs);
    for (const expired of expiredSessions) {
      if (expired.isLastSocketForUser) {
        const room = getBoardRoom(expired.boardId);
        this.io.to(room).emit(SocketEvents.USER_LEFT, {
          userId: expired.userId,
          activeUsers: presenceManager.getActiveUsers(expired.boardId),
        });
        this.io.to(room).emit(SocketEvents.PRESENCE_USER_LEFT, {
          boardId: expired.boardId,
          userId: expired.userId,
          remainingSessions: 0,
        });
      }
    }
  }

  public pruneStaleInteractions(timeoutMs: number = 10000): void {
    const expiredInteractions = interactionManager.removeExpiredInteractions(timeoutMs);
    for (const expired of expiredInteractions) {
      const room = getBoardRoom(expired.boardId);
      this.io.to(room).emit(SocketEvents.INTERACTION_END, {
        boardId: expired.boardId,
        interactionId: expired.interactionId,
        userId: expired.userId,
        type: expired.type,
        targets: expired.targets,
      });
    }
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

      // Register Slice 10 Real-Time Reconnection & Board State Recovery Handlers
      registerRecoveryHandlers(socket);

      // Register Slice 15 Collaborative Presence & Session Lifecycle Handlers
      registerPresenceHandlers(this.io, socket);

      // Register Slice 16 Presence-Aware Collaborative Interaction State Handlers
      registerInteractionHandlers(this.io, socket);

      // Handle Socket Disconnection Lifecycle, Lock Release, Interaction & Presence Cleanup
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

        // 2. Clean up any active interactions started by this specific socket
        const removedInteractions = interactionManager.removeSocketInteractions(socket.id);
        for (const interaction of removedInteractions) {
          const room = getBoardRoom(interaction.boardId);
          this.io.to(room).emit(SocketEvents.INTERACTION_END, {
            boardId: interaction.boardId,
            interactionId: interaction.interactionId,
            userId: interaction.userId,
            type: interaction.type,
            targets: interaction.targets,
          });
        }

        // 3. Update multi-tab presence
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

          this.io.to(room).emit(SocketEvents.PRESENCE_USER_LEFT, {
            boardId: removeResult.boardId,
            userId: removeResult.removedUserId,
            remainingSessions: 0,
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
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    return new Promise((resolve) => {
      this.io.close(() => {
        resolve();
      });
    });
  }
}