import { io } from "socket.io-client";
import { appConfig } from "@/config";
import { useAuthStore } from "@/store";
import { SocketEvents } from "./socket.events";
import type {
  BoardJoinAckData,
  BoardRecoveryRequestPayload,
  BoardRecoveryStatePayload,
  CommentCreatedPayload,
  CommentDeletedPayload,
  CommentResolvedPayload,
  CommentResponseDto,
  CommentUpdatedPayload,
  ConnectionState,
  CreateCommentPayload,
  CreateShapePayload,
  CursorMovePayload,
  DeleteCommentPayload,
  DeleteShapePayload,
  CollaborativeInteraction,
  InteractionBroadcastPayload,
  InteractionEndBroadcastPayload,
  InteractionTarget,
  InteractionType,
  JoinBoardPayload,
  LeaveBoardPayload,
  PresenceActivity,
  PresenceActivityBroadcastPayload,
  PresenceActivityPayload,
  PresenceCursorBroadcastPayload,
  PresenceCursorPayload,
  PresenceSnapshotPayload,
  PresenceUserJoinedPayload,
  PresenceUserLeftPayload,
  ResolveCommentPayload,
  SelectionChangePayload,
  ShapeLockedPayload,
  ShapeResponseDto,
  TransformingShapePayload,
  TypedSocket,
  UpdateCommentPayload,
  UpdateShapePayload,
  WorkspaceMemberRoleUpdatedPayload,
} from "./socket.types";

import { useCollaborationStore } from "@/features/canvas/store";

/**
 * Encapsulated service managing Socket.IO client connections,
 * authentication handshake, board room lifecycle, shape synchronization, and connection state transitions.
 */
export class SocketClientService {
  private socket: TypedSocket | null = null;
  private connectionState: ConnectionState = "disconnected";
  private stateChangeListeners = new Set<(state: ConnectionState) => void>();
  private connectionEpoch: number = 0;

  /**
   * Returns current connection epoch counter.
   */
  public getConnectionEpoch(): number {
    return this.connectionEpoch;
  }

  /**
   * Initializes or returns the authenticated Socket.IO connection.
   *
   * @param tokenOverride - Optional access token override (defaults to useAuthStore accessToken)
   * @returns Typed Socket instance
   */
  public connect(tokenOverride?: string): TypedSocket {
    const rawToken = tokenOverride ?? useAuthStore.getState().accessToken;

    if (this.socket?.connected) {
      return this.socket;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.setConnectionState("connecting");

    const token = rawToken
      ? rawToken.startsWith("Bearer ")
        ? rawToken
        : `Bearer ${rawToken}`
      : "";

    this.socket = io(appConfig.socketUrl, {
      auth: {
        token,
      },
      autoConnect: true,
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 10000,
      withCredentials: true,
    }) as TypedSocket;

    this.socket.on("connect", () => {
      this.connectionEpoch += 1;
      useCollaborationStore.getState().incrementEpoch();
      this.setConnectionState("connected");
    });

    this.socket.on("disconnect", () => {
      this.setConnectionState("disconnected");
    });

    this.socket.on("connect_error", () => {
      this.setConnectionState("error");
    });

    return this.socket;
  }

  /**
   * Closes the active socket connection and resets state.
   */
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.setConnectionState("disconnected");
  }

  /**
   * Updates authentication credentials and reconnects if active.
   *
   * @param token - The new JWT access token
   */
  public updateToken(token: string): void {
    const formattedToken = token.startsWith("Bearer ")
      ? token
      : `Bearer ${token}`;

    if (this.socket) {
      this.socket.auth = {
        token: formattedToken,
      };

      if (this.socket.connected) {
        this.socket.disconnect().connect();
      }
    }
  }

  /**
   * Joins a collaborative board room and retrieves canonical canvas state.
   *
   * @param boardId - Target board identifier
   * @param canvasId - Optional canvas page identifier
   * @returns Promise resolving with initial board join acknowledgement data
   */
  public joinBoard(
    boardId: string,
    canvasId?: string
  ): Promise<BoardJoinAckData> {
    return new Promise((resolve, reject) => {
      const socket = this.socket ?? this.connect();

      const payload: JoinBoardPayload = {
        boardId,
        ...(canvasId ? { canvasId } : {}),
      };

      socket.emit(SocketEvents.BOARD_JOIN, payload, (response) => {
        if (response.success && response.data) {
          resolve(response.data);
        } else {
          const errorMessage =
            typeof response.error === "string"
              ? response.error
              : response.error?.message ?? "Failed to join board room.";
          reject(new Error(errorMessage));
        }
      });
    });
  }

  /**
   * Leaves a collaborative board room.
   *
   * @param boardId - Target board identifier
   * @returns Promise resolving when leave acknowledgement is received
   */
  public leaveBoard(boardId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket) {
        resolve();
        return;
      }

      const payload: LeaveBoardPayload = {
        boardId,
      };

      this.socket.emit(SocketEvents.BOARD_LEAVE, payload, (response) => {
        if (response.success) {
          resolve();
        } else {
          const errorMessage =
            typeof response.error === "string"
              ? response.error
              : response.error?.message ?? "Failed to leave board room.";
          reject(new Error(errorMessage));
        }
      });
    });
  }

  /**
   * Recovers board state and presence snapshot following connection drop or tab wakeup.
   *
   * @param boardId - Target board identifier
   * @returns Promise resolving with authoritative presence snapshot and recovery timestamp
   */
  public recoverBoard(boardId: string): Promise<BoardRecoveryStatePayload> {
    return new Promise((resolve, reject) => {
      const socket = this.socket ?? this.connect();

      const payload: BoardRecoveryRequestPayload = {
        boardId,
      };

      socket.emit(SocketEvents.BOARD_RECOVERY_REQUEST, payload, (response) => {
        if (response.success && response.data) {
          resolve(response.data);
        } else {
          const errorMessage =
            typeof response.error === "string"
              ? response.error
              : response.error?.message ?? "Failed to recover board state.";
          reject(new Error(errorMessage));
        }
      });
    });
  }

  /**
   * Subscribes to authoritative board recovery state push broadcasts.
   */
  public onRecoveryState(
    handler: (state: BoardRecoveryStatePayload) => void
  ): () => void {
    const socket = this.socket ?? this.connect();
    socket.on(SocketEvents.BOARD_RECOVERY_STATE, handler);

    return () => {
      socket.off(SocketEvents.BOARD_RECOVERY_STATE, handler);
    };
  }

  /**
   * Emits shape creation request to authoritative backend over Socket.IO.
   *
   * @param payload - Shape creation parameters
   * @returns Promise resolving with canonical persisted ShapeResponseDto
   */
  public createShape(
    payload: CreateShapePayload
  ): Promise<ShapeResponseDto> {
    return new Promise((resolve, reject) => {
      const socket = this.socket ?? this.connect();

      socket.emit(SocketEvents.SHAPE_CREATE, payload, (response) => {
        if (response.success && response.data) {
          resolve(response.data);
        } else {
          const errorObj = typeof response.error === "object" ? response.error : null;
          const errorMessage =
            typeof response.error === "string"
              ? response.error
              : response.error?.message ?? "Failed to create shape.";
          const err = new Error(errorMessage);
          if (errorObj) {
            Object.assign(err, errorObj);
          }
          if (response.mutationId) {
            (err as any).mutationId = response.mutationId;
          }
          reject(err);
        }
      });
    });
  }

  /**
   * Emits shape update request to authoritative backend over Socket.IO.
   *
   * @param shapeId - Shape identifier
   * @param data - Partial shape update properties
   * @param expectedVersion - Expected OCC version
   * @param mutationId - Optional client mutation UUID
   * @returns Promise resolving with canonical updated ShapeResponseDto
   */
  public updateShape(
    shapeId: string,
    data: UpdateShapePayload["data"],
    expectedVersion?: number,
    mutationId?: string
  ): Promise<ShapeResponseDto> {
    return new Promise((resolve, reject) => {
      const socket = this.socket ?? this.connect();

      const payload: UpdateShapePayload = {
        shapeId,
        mutationId,
        expectedVersion,
        data,
      };

      socket.emit(SocketEvents.SHAPE_UPDATE, payload, (response) => {
        if (response.success && response.data) {
          resolve(response.data);
        } else {
          const errorObj = typeof response.error === "object" ? response.error : null;
          const errorMessage =
            typeof response.error === "string"
              ? response.error
              : response.error?.message ?? "Failed to update shape.";
          const err = new Error(errorMessage);
          if (errorObj) {
            Object.assign(err, errorObj);
          }
          if (response.mutationId) {
            (err as any).mutationId = response.mutationId;
          }
          reject(err);
        }
      });
    });
  }

  /**
   * Emits shape deletion request to authoritative backend over Socket.IO.
   *
   * @param shapeId - Shape identifier to delete
   * @param expectedVersion - Expected OCC version
   * @param mutationId - Optional client mutation UUID
   * @returns Promise resolving on successful deletion acknowledgement
   */
  public deleteShape(
    shapeId: string,
    expectedVersion?: number,
    mutationId?: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const socket = this.socket ?? this.connect();

      const payload: DeleteShapePayload = {
        shapeId,
        mutationId,
        expectedVersion,
      };

      socket.emit(SocketEvents.SHAPE_DELETE, payload, (response) => {
        if (response.success) {
          resolve();
        } else {
          const errorObj = typeof response.error === "object" ? response.error : null;
          const errorMessage =
            typeof response.error === "string"
              ? response.error
              : response.error?.message ?? "Failed to delete shape.";
          const err = new Error(errorMessage);
          if (errorObj) {
            Object.assign(err, errorObj);
          }
          if (response.mutationId) {
            (err as any).mutationId = response.mutationId;
          }
          reject(err);
        }
      });
    });
  }

  /**
   * Emits live collaborator cursor movement over Socket.IO.
   * Ephemeral fire-and-forget event with zero acknowledgement overhead.
   *
   * @param boardId - Target board identifier
   * @param position - Canvas world coordinates (x, y)
   */
  public moveCursor(
    boardId: string,
    position: {
      x: number;
      y: number;
    }
  ): void {
    if (!this.socket?.connected) {
      return;
    }

    const payload: CursorMovePayload = {
      boardId,
      x: position.x,
      y: position.y,
    };

    this.socket.emit(SocketEvents.CURSOR_MOVE, payload);
  }

  /**
   * Emits live collaborator selection change over Socket.IO.
   * Ephemeral fire-and-forget event with zero acknowledgement overhead.
   *
   * @param boardId - Target board identifier
   * @param shapeIds - Array of currently selected shape IDs
   */
  public changeSelection(boardId: string, shapeIds: string[]): void {
    if (!this.socket?.connected) {
      return;
    }

    const payload: SelectionChangePayload = {
      boardId,
      shapeIds,
    };

    this.socket.emit(SocketEvents.SELECTION_CHANGE, payload);
  }

  /**
   * Requests an exclusive ephemeral soft-lock on a shape before transforming.
   *
   * @param boardId - Target board identifier
   * @param shapeId - Target shape identifier
   * @returns Promise resolving to ShapeLockedPayload or rejecting on conflict/error
   */
  public async lockShape(
    boardId: string,
    shapeId: string
  ): Promise<ShapeLockedPayload> {
    if (!this.socket?.connected) {
      throw new Error("Socket is not connected.");
    }

    return new Promise<ShapeLockedPayload>((resolve, reject) => {
      this.socket?.emit(
        SocketEvents.SHAPE_LOCK,
        { boardId, shapeId },
        (response) => {
          if (response.success && response.data) {
            resolve(response.data);
          } else {
            const errorMessage =
              typeof response.error === "string"
                ? response.error
                : response.error?.message ?? "Failed to acquire shape lock.";
            const err = new Error(errorMessage);
            if (typeof response.error === "object" && response.error?.code) {
              (err as any).code = response.error.code;
            }
            reject(err);
          }
        }
      );
    });
  }

  /**
   * Releases an ephemeral soft-lock on a shape after transformation finishes.
   *
   * @param boardId - Target board identifier
   * @param shapeId - Target shape identifier
   */
  public async unlockShape(
    boardId: string,
    shapeId: string
  ): Promise<void> {
    if (!this.socket?.connected) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      this.socket?.emit(
        SocketEvents.SHAPE_UNLOCK,
        { boardId, shapeId },
        (response) => {
          if (response.success) {
            resolve();
          } else {
            const errorMessage =
              typeof response.error === "string"
                ? response.error
                : response.error?.message ?? "Failed to release shape lock.";
            reject(new Error(errorMessage));
          }
        }
      );
    });
  }

  /**
   * Refreshes the activity timestamp on an active lock during ongoing dragging/transforming.
   *
   * @param boardId - Target board identifier
   * @param shapeId - Target shape identifier
   */
  public async refreshShapeLock(
    boardId: string,
    shapeId: string
  ): Promise<void> {
    if (!this.socket?.connected) {
      return;
    }

    return new Promise<void>((resolve, reject) => {
      this.socket?.emit(
        SocketEvents.SHAPE_LOCK_REFRESH,
        { boardId, shapeId },
        (response) => {
          if (response.success) {
            resolve();
          } else {
            const errorMessage =
              typeof response.error === "string"
                ? response.error
                : response.error?.message ?? "Failed to refresh shape lock.";
            reject(new Error(errorMessage));
          }
        }
      );
    });
  }

  /**
   * Emits ephemeral shape transform stream frame to collaborators over Socket.IO.
   * High-frequency fire-and-forget event without Promise/acknowledgement overhead.
   *
   * @param payload - Ephemeral transform properties (x, y, width, height, rotation)
   */
  public transformShape(payload: TransformingShapePayload): void {
    if (!this.socket?.connected) {
      return;
    }
    this.socket.emit(SocketEvents.SHAPE_TRANSFORMING, payload);
  }

  /**
   * Emits shape transform end notification to collaborators over Socket.IO.
   * High-frequency fire-and-forget event notifying peers that active transformation has concluded.
   *
   * @param boardId - Target board identifier
   * @param shapeId - Target shape identifier
   */
  public endShapeTransform(boardId: string, shapeId: string): void {
    if (!this.socket?.connected) {
      return;
    }
    this.socket.emit(SocketEvents.SHAPE_TRANSFORM_END, { boardId, shapeId });
  }

  /**
   * Creates a comment on a board or shape in real-time.
   */
  public createComment(
    payload: CreateCommentPayload
  ): Promise<CommentResponseDto> {
    return new Promise((resolve, reject) => {
      const socket = this.socket ?? this.connect();

      socket.emit(SocketEvents.COMMENT_CREATE, payload, (response) => {
        if (response.success && response.data) {
          resolve(response.data);
        } else {
          const errorObj = typeof response.error === "object" ? response.error : null;
          const errorMessage =
            typeof response.error === "string"
              ? response.error
              : response.error?.message ?? "Failed to create comment.";
          const err = new Error(errorMessage);
          if (errorObj) {
            Object.assign(err, errorObj);
          }
          if (response.mutationId) {
            (err as any).mutationId = response.mutationId;
          }
          reject(err);
        }
      });
    });
  }

  /**
   * Updates an existing comment's content in real-time.
   */
  public updateComment(
    payload: UpdateCommentPayload
  ): Promise<CommentResponseDto> {
    return new Promise((resolve, reject) => {
      const socket = this.socket ?? this.connect();

      socket.emit(SocketEvents.COMMENT_UPDATE, payload, (response) => {
        if (response.success && response.data) {
          resolve(response.data);
        } else {
          const errorObj = typeof response.error === "object" ? response.error : null;
          const errorMessage =
            typeof response.error === "string"
              ? response.error
              : response.error?.message ?? "Failed to update comment.";
          const err = new Error(errorMessage);
          if (errorObj) {
            Object.assign(err, errorObj);
          }
          if (response.mutationId) {
            (err as any).mutationId = response.mutationId;
          }
          reject(err);
        }
      });
    });
  }

  /**
   * Resolves or unresolves a comment in real-time.
   */
  public resolveComment(
    payload: ResolveCommentPayload
  ): Promise<CommentResponseDto> {
    return new Promise((resolve, reject) => {
      const socket = this.socket ?? this.connect();

      socket.emit(SocketEvents.COMMENT_RESOLVE, payload, (response) => {
        if (response.success && response.data) {
          resolve(response.data);
        } else {
          const errorObj = typeof response.error === "object" ? response.error : null;
          const errorMessage =
            typeof response.error === "string"
              ? response.error
              : response.error?.message ?? "Failed to resolve comment.";
          const err = new Error(errorMessage);
          if (errorObj) {
            Object.assign(err, errorObj);
          }
          if (response.mutationId) {
            (err as any).mutationId = response.mutationId;
          }
          reject(err);
        }
      });
    });
  }

  /**
   * Soft-deletes a comment in real-time.
   */
  public deleteComment(
    payload: DeleteCommentPayload
  ): Promise<CommentResponseDto> {
    return new Promise((resolve, reject) => {
      const socket = this.socket ?? this.connect();

      socket.emit(SocketEvents.COMMENT_DELETE, payload, (response) => {
        if (response.success && response.data) {
          resolve(response.data);
        } else {
          const errorObj = typeof response.error === "object" ? response.error : null;
          const errorMessage =
            typeof response.error === "string"
              ? response.error
              : response.error?.message ?? "Failed to delete comment.";
          const err = new Error(errorMessage);
          if (errorObj) {
            Object.assign(err, errorObj);
          }
          if (response.mutationId) {
            (err as any).mutationId = response.mutationId;
          }
          reject(err);
        }
      });
    });
  }

  /**
   * Subscribes to remote comment creation broadcasts.
   */
  public onCommentCreated(
    handler: (payload: CommentCreatedPayload | CommentResponseDto) => void
  ): () => void {
    const socket = this.socket ?? this.connect();
    socket.on(SocketEvents.COMMENT_CREATED, handler);

    return () => {
      socket.off(SocketEvents.COMMENT_CREATED, handler);
    };
  }

  /**
   * Subscribes to remote comment update broadcasts.
   */
  public onCommentUpdated(
    handler: (payload: CommentUpdatedPayload | CommentResponseDto) => void
  ): () => void {
    const socket = this.socket ?? this.connect();
    socket.on(SocketEvents.COMMENT_UPDATED, handler);

    return () => {
      socket.off(SocketEvents.COMMENT_UPDATED, handler);
    };
  }

  /**
   * Subscribes to remote comment resolved broadcasts.
   */
  public onCommentResolved(
    handler: (payload: CommentResolvedPayload | CommentResponseDto) => void
  ): () => void {
    const socket = this.socket ?? this.connect();
    socket.on(SocketEvents.COMMENT_RESOLVED, handler);

    return () => {
      socket.off(SocketEvents.COMMENT_RESOLVED, handler);
    };
  }

  /**
   * Subscribes to remote comment deletion broadcasts.
   */
  public onCommentDeleted(
    handler: (payload: CommentDeletedPayload | { boardId: string; commentId: string }) => void
  ): () => void {
    const socket = this.socket ?? this.connect();
    socket.on(SocketEvents.COMMENT_DELETED, handler);

    return () => {
      socket.off(SocketEvents.COMMENT_DELETED, handler);
    };
  }

  // -------------------------------------------------------------
  // Slice 15: Collaborative Presence & Session Lifecycle
  // -------------------------------------------------------------

  /**
   * Emits a presence heartbeat to maintain active session validity.
   */
  public sendPresenceHeartbeat(boardId: string): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve(false);
        return;
      }

      this.socket.emit(
        SocketEvents.PRESENCE_HEARTBEAT,
        { boardId },
        (response) => {
          resolve(Boolean(response?.success));
        }
      );
    });
  }

  /**
   * Emits live collaborator cursor position over high-frequency presence channel.
   */
  public sendPresenceCursor(
    boardId: string,
    position: { x: number; y: number }
  ): void {
    if (!this.socket?.connected) {
      return;
    }

    const payload: PresenceCursorPayload = {
      boardId,
      x: position.x,
      y: position.y,
    };

    this.socket.emit(SocketEvents.PRESENCE_CURSOR, payload);
  }

  /**
   * Emits collaborator active interaction state change.
   */
  public sendPresenceActivity(
    boardId: string,
    activity: PresenceActivity
  ): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve(false);
        return;
      }

      const payload: PresenceActivityPayload = {
        boardId,
        activity,
      };

      this.socket.emit(
        SocketEvents.PRESENCE_ACTIVITY,
        payload,
        (response) => {
          resolve(Boolean(response?.success));
        }
      );
    });
  }

  /**
   * Requests a fresh presence snapshot from the server.
   */
  public getPresenceSnapshot(
    boardId: string
  ): Promise<PresenceSnapshotPayload | null> {
    return new Promise((resolve) => {
      if (!this.socket?.connected) {
        resolve(null);
        return;
      }

      this.socket.emit(
        SocketEvents.PRESENCE_SNAPSHOT,
        { boardId },
        (response) => {
          if (response?.success && response.data) {
            resolve(response.data);
          } else {
            resolve(null);
          }
        }
      );
    });
  }

  /**
   * Subscribes to board presence snapshot broadcasts.
   */
  public onPresenceSnapshot(
    handler: (payload: PresenceSnapshotPayload) => void
  ): () => void {
    const socket = this.socket ?? this.connect();
    socket.on(SocketEvents.PRESENCE_SNAPSHOT, handler);

    return () => {
      socket.off(SocketEvents.PRESENCE_SNAPSHOT, handler);
    };
  }

  /**
   * Subscribes to collaborator presence joined broadcasts.
   */
  public onPresenceUserJoined(
    handler: (payload: PresenceUserJoinedPayload) => void
  ): () => void {
    const socket = this.socket ?? this.connect();
    socket.on(SocketEvents.PRESENCE_USER_JOINED, handler);

    return () => {
      socket.off(SocketEvents.PRESENCE_USER_JOINED, handler);
    };
  }

  /**
   * Subscribes to collaborator presence left broadcasts.
   */
  public onPresenceUserLeft(
    handler: (payload: PresenceUserLeftPayload) => void
  ): () => void {
    const socket = this.socket ?? this.connect();
    socket.on(SocketEvents.PRESENCE_USER_LEFT, handler);

    return () => {
      socket.off(SocketEvents.PRESENCE_USER_LEFT, handler);
    };
  }

  /**
   * Subscribes to collaborator live cursor position broadcasts.
   */
  public onPresenceCursor(
    handler: (payload: PresenceCursorBroadcastPayload) => void
  ): () => void {
    const socket = this.socket ?? this.connect();
    socket.on(SocketEvents.PRESENCE_CURSOR, handler);

    return () => {
      socket.off(SocketEvents.PRESENCE_CURSOR, handler);
    };
  }

  /**
   * Subscribes to collaborator interaction activity broadcasts.
   */
  public onPresenceActivity(
    handler: (payload: PresenceActivityBroadcastPayload) => void
  ): () => void {
    const socket = this.socket ?? this.connect();
    socket.on(SocketEvents.PRESENCE_ACTIVITY, handler);

    return () => {
      socket.off(SocketEvents.PRESENCE_ACTIVITY, handler);
    };
  }

  // -------------------------------------------------------------
  // Slice 16: Collaborative Interaction State Methods
  // -------------------------------------------------------------

  /**
   * Initiates a collaborative interaction (e.g. moving, resizing, editing text, selecting).
   */
  public startInteraction(
    boardId: string,
    type: InteractionType,
    targets: InteractionTarget[],
    data?: Record<string, unknown>
  ): Promise<{
    success: boolean;
    interactionId?: string;
    startedAt?: string;
    error?: {
      code: string;
      message: string;
      resourceType?: string;
      resourceId?: string;
      ownerUserId?: string;
      interactionType?: string;
    };
  }> {
    return new Promise((resolve) => {
      const socket = this.socket ?? this.connect();
      if (!socket.connected) {
        resolve({
          success: false,
          error: { code: "DISCONNECTED", message: "Socket is not connected." },
        });
        return;
      }

      socket.emit(
        SocketEvents.INTERACTION_START,
        { boardId, type, targets, data },
        (response) => {
          if (response.success && response.data) {
            resolve({
              success: true,
              interactionId: response.data.interactionId,
              startedAt: response.data.startedAt,
            });
          } else {
            resolve({
              success: false,
              error: {
                code: typeof response.error === "object" ? response.error.code ?? "ERROR" : "ERROR",
                message: typeof response.error === "object" ? response.error.message : response.error ?? "Failed to start interaction.",
                resourceType: typeof response.error === "object" ? response.error.resourceType : undefined,
                resourceId: typeof response.error === "object" ? response.error.resourceId : undefined,
                ownerUserId: typeof response.error === "object" ? response.error.ownerUserId : undefined,
                interactionType: typeof response.error === "object" ? response.error.interactionType : undefined,
              },
            });
          }
        }
      );
    });
  }

  /**
   * Updates an ongoing collaborative interaction with transient data or updated target items.
   */
  public updateInteraction(
    boardId: string,
    interactionId: string,
    data?: Record<string, unknown>,
    targets?: InteractionTarget[]
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = this.socket ?? this.connect();
      if (!socket.connected) {
        resolve(false);
        return;
      }

      socket.emit(
        SocketEvents.INTERACTION_UPDATE,
        { boardId, interactionId, data, targets },
        (response) => {
          resolve(Boolean(response.success));
        }
      );
    });
  }

  /**
   * Ends an active collaborative interaction, releasing target ownership locks.
   */
  public endInteraction(
    boardId: string,
    interactionId: string
  ): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = this.socket ?? this.connect();
      if (!socket.connected) {
        resolve(false);
        return;
      }

      socket.emit(
        SocketEvents.INTERACTION_END,
        { boardId, interactionId },
        (response) => {
          resolve(Boolean(response.success));
        }
      );
    });
  }

  /**
   * Requests a fresh snapshot of active interactions on a board.
   */
  public getInteractionSnapshot(
    boardId: string
  ): Promise<CollaborativeInteraction[]> {
    return new Promise((resolve) => {
      const socket = this.socket ?? this.connect();
      if (!socket.connected) {
        resolve([]);
        return;
      }

      socket.emit(
        SocketEvents.INTERACTION_SNAPSHOT,
        { boardId },
        (response) => {
          if (response.success && response.data) {
            resolve(response.data.interactions);
          } else {
            resolve([]);
          }
        }
      );
    });
  }

  /**
   * Subscribes to remote interaction start events.
   */
  public onInteractionStart(
    handler: (payload: InteractionBroadcastPayload) => void
  ): () => void {
    const socket = this.socket ?? this.connect();
    socket.on(SocketEvents.INTERACTION_START, handler);

    return () => {
      socket.off(SocketEvents.INTERACTION_START, handler);
    };
  }

  /**
   * Subscribes to remote interaction update events.
   */
  public onInteractionUpdate(
    handler: (payload: InteractionBroadcastPayload) => void
  ): () => void {
    const socket = this.socket ?? this.connect();
    socket.on(SocketEvents.INTERACTION_UPDATE, handler);

    return () => {
      socket.off(SocketEvents.INTERACTION_UPDATE, handler);
    };
  }

  /**
   * Subscribes to remote interaction end events.
   */
  public onInteractionEnd(
    handler: (payload: InteractionEndBroadcastPayload) => void
  ): () => void {
    const socket = this.socket ?? this.connect();
    socket.on(SocketEvents.INTERACTION_END, handler);

    return () => {
      socket.off(SocketEvents.INTERACTION_END, handler);
    };
  }

  /**
   * Subscribes to interaction snapshot events.
   */
  public onInteractionSnapshot(
    handler: (payload: { boardId: string; interactions: CollaborativeInteraction[] }) => void
  ): () => void {
    const socket = this.socket ?? this.connect();
    socket.on(SocketEvents.INTERACTION_SNAPSHOT, handler);

    return () => {
      socket.off(SocketEvents.INTERACTION_SNAPSHOT, handler);
    };
  }

  /**
   * Subscribes to workspace member role updates.
   *
   * @param handler - Callback receiving WorkspaceMemberRoleUpdatedPayload
   * @returns Cleanup unsubscribe function
   */
  public onMemberRoleUpdated(
    handler: (payload: WorkspaceMemberRoleUpdatedPayload) => void
  ): () => void {
    const socket = this.socket ?? this.connect();
    socket.on(SocketEvents.WORKSPACE_MEMBER_ROLE_UPDATED, handler);

    return () => {
      socket.off(SocketEvents.WORKSPACE_MEMBER_ROLE_UPDATED, handler);
    };
  }

  /**
   * Retrieves the raw Socket instance if initialized.
   */
  public getSocket(): TypedSocket | null {
    return this.socket;
  }

  /**
   * Checks if socket is currently connected.
   */
  public isConnected(): boolean {
    return Boolean(this.socket?.connected);
  }

  /**
   * Returns current connection state.
   */
  public getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  /**
   * Subscribes to connection state changes.
   *
   * @param listener - Callback receiving connection state transitions
   * @returns Cleanup unsubscribe function
   */
  public onStateChange(
    listener: (state: ConnectionState) => void
  ): () => void {
    this.stateChangeListeners.add(listener);
    listener(this.connectionState);

    return () => {
      this.stateChangeListeners.delete(listener);
    };
  }

  private setConnectionState(newState: ConnectionState): void {
    if (this.connectionState !== newState) {
      this.connectionState = newState;
      this.stateChangeListeners.forEach((listener) => listener(newState));
    }
  }
}

export const socketClientService = new SocketClientService();
