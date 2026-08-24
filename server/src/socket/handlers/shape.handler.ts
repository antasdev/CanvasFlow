import { Types } from "mongoose";
import { z } from "zod";

import { boardService } from "@/modules/board";
import { canvasRepository } from "@/modules/canvas";
import { shapeService, ShapeMapper, ShapeType } from "@/modules/shape";
import { mutationRepository, generateMutationHash } from "@/modules/mutation";
import { ApiError, ConflictError } from "@/shared/utils";
import { HttpStatus, Messages } from "@/shared/constants";

import { SocketEvents } from "../socket.events";
import { getBoardRoom } from "../socket.rooms";
import { collaborationVersionService } from "../services/collaboration-version.service";
import {
  AuthSocket,
  CreateShapePayload,
  DeleteShapePayload,
  ShapeResponseDto,
  SocketAck,
  UpdateShapePayload,
} from "../socket.types";

const objectIdSchema = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, "Invalid ID format.");

const shapeStyleSocketSchema = z.object({
  fill: z.string().trim().optional(),
  stroke: z.string().trim().optional(),
  strokeWidth: z
    .number()
    .min(0, "Stroke width cannot be negative.")
    .max(50)
    .optional(),
  opacity: z
    .number()
    .min(0, "Opacity must be at least 0.")
    .max(1, "Opacity cannot exceed 1.")
    .optional(),
  text: z.string().max(5000, "Text cannot exceed 5000 characters.").optional(),
  fontSize: z
    .number()
    .min(8, "Font size must be at least 8.")
    .max(200, "Font size cannot exceed 200.")
    .optional(),
  fontFamily: z.string().trim().max(100).optional(),
  fontWeight: z.union([z.string().trim().max(20), z.number()]).optional(),
  fontStyle: z.string().trim().max(20).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  backgroundColor: z.string().trim().optional(),
  textColor: z.string().trim().optional(),
});

const createShapeSocketSchema = z.object({
  canvasId: objectIdSchema,
  mutationId: z.string().uuid("Invalid mutation ID format.").optional(),
  type: z
    .enum(["rectangle", "RECTANGLE", "text", "TEXT", "sticky_note", "STICKY_NOTE"])
    .default("rectangle"),
  x: z.number().finite("x must be a finite number."),
  y: z.number().finite("y must be a finite number."),
  width: z.number().positive("Width must be greater than 0."),
  height: z.number().positive("Height must be greater than 0."),
  rotation: z.number().finite("Rotation must be a finite number.").optional(),
  style: shapeStyleSocketSchema.optional(),
});

const updateShapeSocketSchema = z.object({
  shapeId: objectIdSchema,
  mutationId: z.string().uuid("Invalid mutation ID format.").optional(),
  expectedVersion: z.number().int().min(1).optional(),
  data: z.object({
    x: z.number().finite("x must be a finite number.").optional(),
    y: z.number().finite("y must be a finite number.").optional(),
    width: z.number().positive("Width must be greater than 0.").optional(),
    height: z.number().positive("Height must be greater than 0.").optional(),
    rotation: z.number().finite("Rotation must be a finite number.").optional(),
    style: shapeStyleSocketSchema.optional(),
  }),
});

const deleteShapeSocketSchema = z.object({
  shapeId: objectIdSchema,
  mutationId: z.string().uuid("Invalid mutation ID format.").optional(),
  expectedVersion: z.number().int().min(1).optional(),
});

/**
 * Registers real-time shape collaboration event handlers on an authenticated socket.
 */
export const registerShapeHandlers = (socket: AuthSocket): void => {
  /**
   * Handle shape:create
   */
  socket.on(
    SocketEvents.SHAPE_CREATE,
    async (
      payload: CreateShapePayload,
      callback?: (response: SocketAck<ShapeResponseDto>) => void
    ) => {
      const fallbackMutationId = typeof payload?.mutationId === "string" ? payload.mutationId : undefined;
      try {
        const parsed = createShapeSocketSchema.safeParse(payload);

        if (!parsed.success) {
          const message =
            parsed.error.issues[0]?.message ?? "Invalid shape creation payload.";
          socket.emit(SocketEvents.ERROR, message);
          callback?.({
            success: false,
            mutationId: fallbackMutationId,
            error: { code: "BAD_REQUEST", message },
          });
          return;
        }

        const userId = socket.data.user.userId;
        const canvasObjectId = new Types.ObjectId(parsed.data.canvasId);

        // 1. Resolve canvas & board
        const canvas = await canvasRepository.findById(canvasObjectId);

        if (!canvas) {
          throw new ApiError(
            HttpStatus.NOT_FOUND,
            Messages.CANVAS_NOT_FOUND
          );
        }

        const boardId = canvas.boardId;

        // 2. Authorize board access
        await boardService.authorizeBoardAccess(boardId, userId);

        // 3. Verify socket is joined to the board room
        const room = getBoardRoom(boardId.toString());

        if (!socket.rooms.has(room)) {
          throw new ApiError(
            HttpStatus.FORBIDDEN,
            "You must join the board room before creating shapes."
          );
        }

        // 4. Determine ShapeType
        const rawType = parsed.data.type.toUpperCase();
        let shapeType: ShapeType = ShapeType.RECTANGLE;
        if (rawType === "TEXT") {
          shapeType = ShapeType.TEXT;
        } else if (rawType === "STICKY_NOTE") {
          shapeType = ShapeType.STICKY_NOTE;
        }

        // 5. Authoritative persistence via ShapeService & atomic revision increment
        const { result, meta } = await collaborationVersionService.executeWithRevision(
          boardId,
          userId,
          socket.id,
          async (session) => {
            return shapeService.createShape(
              userId,
              {
                canvasId: canvasObjectId,
                type: shapeType,
                x: parsed.data.x,
                y: parsed.data.y,
                width: parsed.data.width,
                height: parsed.data.height,
                rotation: parsed.data.rotation ?? 0,
                style: parsed.data.style,
              },
              session
            );
          },
          parsed.data.mutationId,
          "shape:create",
          parsed.data
        );

        // 6. Transform to canonical response DTO
        const responseDto = (result as any)?.shape
          ? ShapeMapper.toResponseDto((result as any).shape)
          : (result as unknown as ShapeResponseDto);

        // 7. Broadcast envelope to other collaborators in the room (excludes sender, omitted on replay)
        if (!meta.isIdempotentReplay) {
          socket.to(room).emit(SocketEvents.SHAPE_CREATED, {
            meta,
            shape: responseDto,
          });
        }

        // 8. Acknowledge creator with canonical persisted shape & mutationId
        callback?.({
          success: true,
          mutationId: parsed.data.mutationId,
          data: responseDto,
        });
      } catch (error) {
        if (error instanceof ApiError) {
          const code =
            error.code ??
            (error.statusCode === HttpStatus.NOT_FOUND
              ? "NOT_FOUND"
              : error.statusCode === HttpStatus.FORBIDDEN
              ? "FORBIDDEN"
              : error.statusCode === HttpStatus.CONFLICT
              ? "CONFLICT"
              : "BAD_REQUEST");

          socket.emit(SocketEvents.ERROR, error.message);
          callback?.({
            success: false,
            mutationId: fallbackMutationId,
            error: { code, message: error.message },
          });
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Failed to create shape.";

        socket.emit(SocketEvents.ERROR, message);
        callback?.({
          success: false,
          mutationId: fallbackMutationId,
          error: { code: "INTERNAL_ERROR", message },
        });
      }
    }
  );

  /**
   * Handle shape:update
   */
  socket.on(
    SocketEvents.SHAPE_UPDATE,
    async (
      payload: UpdateShapePayload,
      callback?: (response: SocketAck<ShapeResponseDto>) => void
    ) => {
      const fallbackMutationId = typeof payload?.mutationId === "string" ? payload.mutationId : undefined;
      try {
        const parsed = updateShapeSocketSchema.safeParse(payload);

        if (!parsed.success) {
          const message =
            parsed.error.issues[0]?.message ?? "Invalid shape update payload.";
          socket.emit(SocketEvents.ERROR, message);
          callback?.({
            success: false,
            mutationId: fallbackMutationId,
            error: { code: "BAD_REQUEST", message },
          });
          return;
        }

        const userId = socket.data.user.userId;
        const shapeObjectId = new Types.ObjectId(parsed.data.shapeId);

        // Pre-check idempotency record for completed or in-progress duplicate requests
        if (parsed.data.mutationId) {
          const existingRecord = await mutationRepository.findByActorAndMutation(
            userId,
            parsed.data.mutationId
          );
          if (existingRecord) {
            const expectedHash = generateMutationHash({
              operation: "shape:update",
              boardId: existingRecord.boardId,
              mutationId: parsed.data.mutationId,
              actorId: userId,
              payload: parsed.data,
            });

            if (existingRecord.requestHash !== expectedHash) {
              callback?.({
                success: false,
                mutationId: parsed.data.mutationId,
                error: {
                  code: "IDEMPOTENCY_KEY_REUSED",
                  message: "Idempotency key reused with different payload.",
                },
              });
              return;
            }

            if (existingRecord.status === "completed") {
              const responseDto = (existingRecord.response as any)?.shape
                ? ShapeMapper.toResponseDto((existingRecord.response as any).shape)
                : (existingRecord.response as ShapeResponseDto);

              callback?.({
                success: true,
                mutationId: parsed.data.mutationId,
                data: responseDto,
              });
              return;
            }

            if (existingRecord.status === "processing") {
              const isStale =
                Date.now() - new Date(existingRecord.createdAt).getTime() > 30000;
              if (!isStale) {
                callback?.({
                  success: false,
                  mutationId: parsed.data.mutationId,
                  error: {
                    code: "MUTATION_IN_PROGRESS",
                    message: "Mutation is currently in progress.",
                  },
                });
                return;
              }
            }
          }
        }

        // 1. Resolve shape, canvas & board
        const shape = await shapeService.getShapeById(shapeObjectId);
        const canvas = await canvasRepository.findById(shape.canvasId);

        if (!canvas) {
          throw new ApiError(
            HttpStatus.NOT_FOUND,
            Messages.CANVAS_NOT_FOUND
          );
        }

        const boardId = canvas.boardId;

        // 2. Authorize board access
        await boardService.authorizeBoardAccess(boardId, userId);

        // 3. Verify socket is joined to the board room
        const room = getBoardRoom(boardId.toString());

        if (!socket.rooms.has(room)) {
          throw new ApiError(
            HttpStatus.FORBIDDEN,
            "You must join the board room before updating shapes."
          );
        }

        // 4. Authoritative persistence via ShapeService & atomic revision increment
        const { result, meta } = await collaborationVersionService.executeWithRevision(
          boardId,
          userId,
          socket.id,
          async (session) => {
            return shapeService.updateShape(
              shapeObjectId,
              parsed.data.data,
              session,
              parsed.data.expectedVersion
            );
          },
          parsed.data.mutationId,
          "shape:update",
          parsed.data
        );

        // 5. Transform to canonical response DTO
        const responseDto = (result as any)?.shape
          ? ShapeMapper.toResponseDto((result as any).shape)
          : (result as unknown as ShapeResponseDto);

        // 6. Broadcast envelope to other room members (excludes sender, omitted on replay)
        if (!meta.isIdempotentReplay) {
          socket.to(room).emit(SocketEvents.SHAPE_UPDATED, {
            meta,
            shape: responseDto,
          });
        }

        // 7. Acknowledge sender with canonical response & mutationId
        callback?.({
          success: true,
          mutationId: parsed.data.mutationId,
          data: responseDto,
        });
      } catch (error) {
        if (error instanceof ConflictError) {
          socket.emit(SocketEvents.ERROR, error.message);
          callback?.({
            success: false,
            mutationId: fallbackMutationId,
            error: {
              code: "CONFLICT",
              message: error.message,
              resourceType: error.resourceType,
              resourceId: error.resourceId,
              currentVersion: error.currentVersion,
            },
          });
          return;
        }

        if (error instanceof ApiError) {
          const code =
            error.code ??
            (error.statusCode === HttpStatus.NOT_FOUND
              ? "NOT_FOUND"
              : error.statusCode === HttpStatus.FORBIDDEN
              ? "FORBIDDEN"
              : error.statusCode === HttpStatus.CONFLICT
              ? "CONFLICT"
              : "BAD_REQUEST");

          socket.emit(SocketEvents.ERROR, error.message);
          callback?.({
            success: false,
            mutationId: fallbackMutationId,
            error: { code, message: error.message },
          });
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Failed to update shape.";

        socket.emit(SocketEvents.ERROR, message);
        callback?.({
          success: false,
          mutationId: fallbackMutationId,
          error: { code: "INTERNAL_ERROR", message },
        });
      }
    }
  );

  /**
   * Handle shape:delete
   */
  socket.on(
    SocketEvents.SHAPE_DELETE,
    async (
      payload: DeleteShapePayload,
      callback?: (response: SocketAck) => void
    ) => {
      const fallbackMutationId = typeof payload?.mutationId === "string" ? payload.mutationId : undefined;
      try {
        const parsed = deleteShapeSocketSchema.safeParse(payload);

        if (!parsed.success) {
          const message =
            parsed.error.issues[0]?.message ?? "Invalid shape delete payload.";
          socket.emit(SocketEvents.ERROR, message);
          callback?.({
            success: false,
            mutationId: fallbackMutationId,
            error: { code: "BAD_REQUEST", message },
          });
          return;
        }

        const userId = socket.data.user.userId;
        const shapeObjectId = new Types.ObjectId(parsed.data.shapeId);

        // Pre-check idempotency record for completed or in-progress duplicate requests
        if (parsed.data.mutationId) {
          const existingRecord = await mutationRepository.findByActorAndMutation(
            userId,
            parsed.data.mutationId
          );
          if (existingRecord) {
            const expectedHash = generateMutationHash({
              operation: "shape:delete",
              boardId: existingRecord.boardId,
              mutationId: parsed.data.mutationId,
              actorId: userId,
              payload: parsed.data,
            });

            if (existingRecord.requestHash !== expectedHash) {
              callback?.({
                success: false,
                mutationId: parsed.data.mutationId,
                error: {
                  code: "IDEMPOTENCY_KEY_REUSED",
                  message: "Idempotency key reused with different payload.",
                },
              });
              return;
            }

            if (existingRecord.status === "completed") {
              callback?.({
                success: true,
                mutationId: parsed.data.mutationId,
              });
              return;
            }

            if (existingRecord.status === "processing") {
              const isStale =
                Date.now() - new Date(existingRecord.createdAt).getTime() > 30000;
              if (!isStale) {
                callback?.({
                  success: false,
                  mutationId: parsed.data.mutationId,
                  error: {
                    code: "MUTATION_IN_PROGRESS",
                    message: "Mutation is currently in progress.",
                  },
                });
                return;
              }
            }
          }
        }

        // 1. Resolve shape, canvas & board
        const shape = await shapeService.getShapeById(shapeObjectId);
        const canvas = await canvasRepository.findById(shape.canvasId);

        if (!canvas) {
          throw new ApiError(
            HttpStatus.NOT_FOUND,
            Messages.CANVAS_NOT_FOUND
          );
        }

        const boardId = canvas.boardId;

        // 2. Authorize board access
        await boardService.authorizeBoardAccess(boardId, userId);

        // 3. Verify socket is joined to the board room
        const room = getBoardRoom(boardId.toString());

        if (!socket.rooms.has(room)) {
          throw new ApiError(
            HttpStatus.FORBIDDEN,
            "You must join the board room before deleting shapes."
          );
        }

        // 4. Authoritative deletion via ShapeService & atomic revision increment
        const { meta } = await collaborationVersionService.executeWithRevision(
          boardId,
          userId,
          socket.id,
          async (session) => {
            return shapeService.deleteShape(
              shapeObjectId,
              session,
              parsed.data.expectedVersion
            );
          },
          parsed.data.mutationId,
          "shape:delete",
          parsed.data
        );

        // 5. Broadcast deletion envelope to other room members (excludes sender, omitted on replay)
        if (!meta.isIdempotentReplay) {
          socket.to(room).emit(SocketEvents.SHAPE_DELETED, {
            meta,
            shapeId: parsed.data.shapeId,
          });
        }

        // 6. Acknowledge sender with mutationId
        callback?.({
          success: true,
          mutationId: parsed.data.mutationId,
        });
      } catch (error) {
        if (error instanceof ConflictError) {
          socket.emit(SocketEvents.ERROR, error.message);
          callback?.({
            success: false,
            mutationId: fallbackMutationId,
            error: {
              code: "CONFLICT",
              message: error.message,
              resourceType: error.resourceType,
              resourceId: error.resourceId,
              currentVersion: error.currentVersion,
            },
          });
          return;
        }

        if (error instanceof ApiError) {
          const code =
            error.code ??
            (error.statusCode === HttpStatus.NOT_FOUND
              ? "NOT_FOUND"
              : error.statusCode === HttpStatus.FORBIDDEN
              ? "FORBIDDEN"
              : error.statusCode === HttpStatus.CONFLICT
              ? "CONFLICT"
              : "BAD_REQUEST");

          socket.emit(SocketEvents.ERROR, error.message);
          callback?.({
            success: false,
            mutationId: fallbackMutationId,
            error: { code, message: error.message },
          });
          return;
        }

        const message =
          error instanceof Error
            ? error.message
            : "Failed to delete shape.";

        socket.emit(SocketEvents.ERROR, message);
        callback?.({
          success: false,
          mutationId: fallbackMutationId,
          error: { code: "INTERNAL_ERROR", message },
        });
      }
    }
  );
};