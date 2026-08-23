import assert from "assert";
import crypto from "crypto";
import { createServer } from "http";
import mongoose, { Types } from "mongoose";
import { io as clientIO, Socket as ClientSocket } from "socket.io-client";

import env from "@/config/env";
import { generateAccessToken } from "@/modules/auth/auth.tokens";
import { BoardModel } from "@/modules/board/board.model";
import { BoardVisibility } from "@/modules/board/board.types";
import { CanvasModel } from "@/modules/canvas/canvas.model";
import { CommentModel } from "@/modules/comment/comment.model";
import { ShapeModel } from "@/modules/shape/shape.model";
import { UserModel } from "@/modules/user/user.model";
import { UserRole } from "@/modules/user/user.types";
import { WorkspaceModel } from "@/modules/workspace/workspace.model";
import { WorkspaceMemberModel } from "@/modules/workspace/workspaceMember.model";
import { WorkspaceRole } from "@/modules/workspace/workspace.types";
import { SocketServer } from "../socket.server";
import { SocketEvents } from "../socket.events";
import {
  BoardJoinAckData,
  CollaborationEventMeta,
  CommentCreatedPayload,
  CommentDeletedPayload,
  CommentResolvedPayload,
  CommentResponseDto,
  CommentUpdatedPayload,
  CreateCommentPayload,
  CreateShapePayload,
  DeleteCommentPayload,
  DeleteShapePayload,
  ResolveCommentPayload,
  ShapeCreatedPayload,
  ShapeDeletedPayload,
  ShapeResponseDto,
  ShapeUpdatedPayload,
  SocketAck,
  UpdateCommentPayload,
  UpdateShapePayload,
} from "../socket.types";

type TestSocket = ClientSocket;

async function runMutationIdempotencyContractTests(): Promise<void> {
  console.log("Starting Real-Time Mutation ID & Idempotency Contract Tests (Slice 13)...\n");

  let isDbConnected = false;
  try {
    await mongoose.connect(env.MONGODB_URI);
    isDbConnected = true;
    console.log("Connected to MongoDB for integration testing.");
  } catch (err) {
    console.warn("MongoDB connection unavailable, skipping live DB tests:", err);
    return;
  }

  const httpServer = createServer();
  const socketServer = new SocketServer(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve());
  });

  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : 3000;
  const serverUrl = `http://localhost:${port}`;

  const createAuthClient = (token: string): Promise<TestSocket> => {
    return new Promise((resolve) => {
      const client: TestSocket = clientIO(serverUrl, {
        auth: { token: `Bearer ${token}` },
        transports: ["websocket"],
        reconnection: false,
      });
      client.on("connect", () => resolve(client));
    });
  };

  let clientA!: TestSocket;
  let clientB!: TestSocket;

  try {
    // 0. Seed Test Data
    const ownerUserId = new Types.ObjectId("9a8a92ec09ac3f2f9b0d41e1");
    const collaboratorUserId = new Types.ObjectId("9a8a92ec09ac3f2f9b0d41e2");

    await Promise.all([
      UserModel.deleteMany({ _id: { $in: [ownerUserId, collaboratorUserId] } }),
      WorkspaceModel.deleteMany({ name: "Mutation Test Workspace" }),
      BoardModel.deleteMany({ name: "Mutation Test Board" }),
      CanvasModel.deleteMany({}),
      ShapeModel.deleteMany({}),
      CommentModel.deleteMany({}),
    ]);

    await UserModel.create([
      {
        _id: ownerUserId,
        email: `owner_mut_${Date.now()}@example.com`,
        password: "Password123!",
        fullName: "Owner User",
        role: UserRole.USER,
      },
      {
        _id: collaboratorUserId,
        email: `collab_mut_${Date.now()}@example.com`,
        password: "Password123!",
        fullName: "Collaborator User",
        role: UserRole.USER,
      },
    ]);

    const workspace = await WorkspaceModel.create({
      name: "Mutation Test Workspace",
      ownerId: ownerUserId,
    });

    await WorkspaceMemberModel.create({
      workspaceId: workspace._id,
      userId: collaboratorUserId,
      role: WorkspaceRole.EDITOR,
    });

    const board = await BoardModel.create({
      workspaceId: workspace._id,
      name: "Mutation Test Board",
      visibility: BoardVisibility.PUBLIC,
      createdBy: ownerUserId,
      collaborationRevision: 1,
    });

    const canvas = await CanvasModel.create({
      boardId: board._id,
      name: "Main Canvas",
      order: 1,
    });

    const ownerToken = generateAccessToken({
      userId: ownerUserId.toString(),
      role: UserRole.USER,
    });

    const collaboratorToken = generateAccessToken({
      userId: collaboratorUserId.toString(),
      role: UserRole.USER,
    });

    clientA = await createAuthClient(ownerToken);
    clientB = await createAuthClient(collaboratorToken);

    // Join both clients to board room
    await new Promise<void>((resolve) => {
      clientA.emit(SocketEvents.BOARD_JOIN, { boardId: board._id.toString() }, () => {
        clientB.emit(SocketEvents.BOARD_JOIN, { boardId: board._id.toString() }, () => {
          resolve();
        });
      });
    });

    console.log("✓ Test setup and authenticated board joining completed.");

    // =========================================================================
    // TEST 1 & 3 & 5: Shape Create with mutationId -> ack & meta broadcast
    // =========================================================================
    const shapeCreateMutationId = crypto.randomUUID();
    let createdShapeDto: ShapeResponseDto | null = null;
    let shapeCreateMeta: CollaborationEventMeta | null = null;

    const shapeCreatedPromise = new Promise<void>((resolve) => {
      clientB.once(SocketEvents.SHAPE_CREATED, (payload: ShapeCreatedPayload) => {
        shapeCreateMeta = payload.meta;
        resolve();
      });
    });

    await new Promise<void>((resolve) => {
      const payload: CreateShapePayload = {
        canvasId: canvas._id.toString(),
        mutationId: shapeCreateMutationId,
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
      };

      clientA.emit(SocketEvents.SHAPE_CREATE, payload, (ack: SocketAck<ShapeResponseDto>) => {
        assert(ack.success === true, "Shape create must succeed");
        assert(ack.mutationId === shapeCreateMutationId, `Ack must return mutationId, got ${ack.mutationId}`);
        assert(ack.data !== undefined, "Ack data must be defined");
        assert(ack.data?.version === 1, "Initial shape version must be 1");
        createdShapeDto = ack.data!;
        resolve();
      });
    });

    await shapeCreatedPromise;
    assert(shapeCreateMeta !== null, "Broadcast meta must be received by peer");
    assert(
      (shapeCreateMeta as any)?.mutationId === shapeCreateMutationId,
      `Broadcast meta must include mutationId ${shapeCreateMutationId}, got ${(shapeCreateMeta as any)?.mutationId}`
    );
    console.log("✓ Test 1, 3, 5: Shape create accepted mutationId, returned it in ack, and broadcast in meta.");

    // =========================================================================
    // TEST 1 (Update) & 3 & 5: Shape Update with mutationId -> ack & meta broadcast
    // =========================================================================
    const shapeUpdateMutationId = crypto.randomUUID();
    let shapeUpdateMeta: CollaborationEventMeta | null = null;

    const shapeUpdatedPromise = new Promise<void>((resolve) => {
      clientB.once(SocketEvents.SHAPE_UPDATED, (payload: ShapeUpdatedPayload) => {
        shapeUpdateMeta = payload.meta;
        resolve();
      });
    });

    await new Promise<void>((resolve) => {
      const payload: UpdateShapePayload = {
        shapeId: createdShapeDto!.id,
        mutationId: shapeUpdateMutationId,
        expectedVersion: 1,
        data: {
          x: 250,
        },
      };

      clientA.emit(SocketEvents.SHAPE_UPDATE, payload, (ack: SocketAck<ShapeResponseDto>) => {
        assert(ack.success === true, "Shape update must succeed");
        assert(ack.mutationId === shapeUpdateMutationId, "Ack must return mutationId");
        assert(ack.data?.version === 2, "Shape version must advance to 2");
        assert(ack.data?.x === 250, "Shape x must update to 250");
        resolve();
      });
    });

    await shapeUpdatedPromise;
    assert(
      (shapeUpdateMeta as any)?.mutationId === shapeUpdateMutationId,
      `Broadcast meta must include update mutationId ${shapeUpdateMutationId}`
    );
    console.log("✓ Test 1 (Update): Shape update returned mutationId in ack and broadcast meta.");

    // =========================================================================
    // TEST 2: Comment Mutations with mutationId (Create, Update, Resolve, Delete)
    // =========================================================================
    const commentCreateMutationId = crypto.randomUUID();
    let createdCommentDto: CommentResponseDto | null = null;
    let commentCreateMeta: CollaborationEventMeta | null = null;

    const commentCreatedPromise = new Promise<void>((resolve) => {
      clientB.once(SocketEvents.COMMENT_CREATED, (payload: CommentCreatedPayload) => {
        commentCreateMeta = payload.meta;
        resolve();
      });
    });

    await new Promise<void>((resolve) => {
      const payload: CreateCommentPayload = {
        boardId: board._id.toString(),
        mutationId: commentCreateMutationId,
        content: "Contract test comment",
      };

      clientA.emit(SocketEvents.COMMENT_CREATE, payload, (ack: SocketAck<CommentResponseDto>) => {
        assert(ack.success === true, "Comment create must succeed");
        assert(ack.mutationId === commentCreateMutationId, "Ack must return mutationId");
        assert(ack.data?.version === 1, "Comment version must be 1");
        createdCommentDto = ack.data!;
        resolve();
      });
    });

    await commentCreatedPromise;
    assert(
      (commentCreateMeta as any)?.mutationId === commentCreateMutationId,
      "Comment create broadcast meta must include mutationId"
    );

    // Comment Update
    const commentUpdateMutationId = crypto.randomUUID();
    await new Promise<void>((resolve) => {
      const payload: UpdateCommentPayload = {
        boardId: board._id.toString(),
        commentId: createdCommentDto!.id,
        mutationId: commentUpdateMutationId,
        expectedVersion: 1,
        content: "Updated comment text",
      };

      clientA.emit(SocketEvents.COMMENT_UPDATE, payload, (ack: SocketAck<CommentResponseDto>) => {
        assert(ack.success === true, "Comment update must succeed");
        assert(ack.mutationId === commentUpdateMutationId, "Ack must return mutationId");
        assert(ack.data?.version === 2, "Comment version must become 2");
        resolve();
      });
    });

    // Comment Resolve
    const commentResolveMutationId = crypto.randomUUID();
    await new Promise<void>((resolve) => {
      const payload: ResolveCommentPayload = {
        boardId: board._id.toString(),
        commentId: createdCommentDto!.id,
        mutationId: commentResolveMutationId,
        expectedVersion: 2,
        isResolved: true,
      };

      clientA.emit(SocketEvents.COMMENT_RESOLVE, payload, (ack: SocketAck<CommentResponseDto>) => {
        assert(ack.success === true, "Comment resolve must succeed");
        assert(ack.mutationId === commentResolveMutationId, "Ack must return mutationId");
        assert(ack.data?.version === 3, "Comment version must become 3");
        assert(ack.data?.isResolved === true, "Comment must be resolved");
        resolve();
      });
    });

    // Comment Soft-Delete
    const commentDeleteMutationId = crypto.randomUUID();
    await new Promise<void>((resolve) => {
      const payload: DeleteCommentPayload = {
        boardId: board._id.toString(),
        commentId: createdCommentDto!.id,
        mutationId: commentDeleteMutationId,
        expectedVersion: 3,
      };

      clientA.emit(SocketEvents.COMMENT_DELETE, payload, (ack: SocketAck<CommentResponseDto>) => {
        assert(ack.success === true, "Comment delete must succeed");
        assert(ack.mutationId === commentDeleteMutationId, "Ack must return mutationId");
        assert(ack.data?.version === 4, "Comment version must become 4");
        assert(ack.data?.isDeleted === true, "Comment must be soft-deleted");
        resolve();
      });
    });
    console.log("✓ Test 2: Comment create, update, resolve, delete accepted and returned mutationId.");

    // =========================================================================
    // TEST 4 & 7: Mutation ID returned in Error Acknowledgement & OCC Preserved
    // =========================================================================
    const staleShapeMutationId = crypto.randomUUID();
    await new Promise<void>((resolve) => {
      const payload: UpdateShapePayload = {
        shapeId: createdShapeDto!.id,
        mutationId: staleShapeMutationId,
        expectedVersion: 1, // Stale! Current version is 2
        data: {
          x: 999,
        },
      };

      clientA.emit(SocketEvents.SHAPE_UPDATE, payload, (ack: SocketAck<ShapeResponseDto>) => {
        assert(ack.success === false, "Stale update must fail with conflict");
        assert(ack.mutationId === staleShapeMutationId, "Error ack must preserve mutationId");
        if (typeof ack.error === "object") {
          assert(ack.error.code === "CONFLICT", "Error code must be CONFLICT");
          assert(ack.error.currentVersion === 2, "Current version reported must be 2");
        }
        resolve();
      });
    });
    console.log("✓ Test 4 & 7: Mutation ID returned in 409 CONFLICT ack; Slice 12 OCC remained functional.");

    // =========================================================================
    // TEST 6: Invalid Non-UUID Mutation ID Rejected with BAD_REQUEST
    // =========================================================================
    await new Promise<void>((resolve) => {
      const payload = {
        canvasId: canvas._id.toString(),
        mutationId: "not-a-valid-uuid-12345",
        type: "rectangle",
        x: 100,
        y: 100,
        width: 100,
        height: 100,
      } as any;

      clientA.emit(SocketEvents.SHAPE_CREATE, payload, (ack: SocketAck<ShapeResponseDto>) => {
        assert(ack.success === false, "Invalid UUID must be rejected");
        assert(ack.mutationId === "not-a-valid-uuid-12345", "Fallback mutationId preserved");
        if (typeof ack.error === "object") {
          assert(ack.error.code === "BAD_REQUEST", `Must be BAD_REQUEST, got ${ack.error.code}`);
        }
        resolve();
      });
    });
    console.log("✓ Test 6: Invalid UUID mutationId rejected with BAD_REQUEST.");

    // =========================================================================
    // TEST 8: Failed Mutation Produces No Broadcast & No Revision Increment
    // =========================================================================
    const boardDocBefore = await BoardModel.findById(board._id);
    const revisionBefore = boardDocBefore!.collaborationRevision;

    let peerBroadcastReceived = false;
    const unexpectedListener = () => {
      peerBroadcastReceived = true;
    };
    clientB.on(SocketEvents.SHAPE_UPDATED, unexpectedListener);

    await new Promise<void>((resolve) => {
      const payload: UpdateShapePayload = {
        shapeId: createdShapeDto!.id,
        mutationId: crypto.randomUUID(),
        expectedVersion: 1, // Stale!
        data: { x: 500 },
      };

      clientA.emit(SocketEvents.SHAPE_UPDATE, payload, () => {
        resolve();
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 150));
    clientB.off(SocketEvents.SHAPE_UPDATED, unexpectedListener);

    const boardDocAfter = await BoardModel.findById(board._id);
    assert(
      boardDocAfter!.collaborationRevision === revisionBefore,
      "Revision must not increment on failed mutation"
    );
    assert(peerBroadcastReceived === false, "No broadcast must be delivered on failed mutation");
    console.log("✓ Test 8: Failed persistence produces no broadcast and zero revision increment.");

    // =========================================================================
    // TEST 9: Multi-Tab Mutation IDs Remain Isolated
    // =========================================================================
    const tab1MutationId = crypto.randomUUID();
    const tab2MutationId = crypto.randomUUID();

    let tab1AckMutationId: string | undefined;
    let tab2AckMutationId: string | undefined;

    await Promise.all([
      new Promise<void>((resolve) => {
        clientA.emit(
          SocketEvents.SHAPE_UPDATE,
          {
            shapeId: createdShapeDto!.id,
            mutationId: tab1MutationId,
            expectedVersion: 2,
            data: { x: 300 },
          },
          (ack: SocketAck<ShapeResponseDto>) => {
            tab1AckMutationId = ack.mutationId;
            resolve();
          }
        );
      }),
      new Promise<void>((resolve) => {
        // Tab 2 sends with expectedVersion 2 concurrently
        clientB.emit(
          SocketEvents.SHAPE_UPDATE,
          {
            shapeId: createdShapeDto!.id,
            mutationId: tab2MutationId,
            expectedVersion: 2,
            data: { x: 400 },
          },
          (ack: SocketAck<ShapeResponseDto>) => {
            tab2AckMutationId = ack.mutationId;
            resolve();
          }
        );
      }),
    ]);

    assert(tab1AckMutationId === tab1MutationId, "Tab 1 ack must receive Tab 1 mutationId");
    assert(tab2AckMutationId === tab2MutationId, "Tab 2 ack must receive Tab 2 mutationId");
    console.log("✓ Test 9: Multi-tab mutation IDs remain strictly isolated in concurrent execution.");

    // Shape Delete Contract Check
    const shapeDeleteMutationId = crypto.randomUUID();
    await new Promise<void>((resolve) => {
      const payload: DeleteShapePayload = {
        shapeId: createdShapeDto!.id,
        mutationId: shapeDeleteMutationId,
        expectedVersion: 3,
      };

      clientA.emit(SocketEvents.SHAPE_DELETE, payload, (ack: SocketAck) => {
        assert(ack.success === true, "Shape delete must succeed");
        assert(ack.mutationId === shapeDeleteMutationId, "Delete ack must return mutationId");
        resolve();
      });
    });
    console.log("✓ Shape delete contract verified with mutationId.");

    console.log("\nAll Mutation ID & Idempotency Contract Tests Passed Successfully! (9/9)\n");
  } finally {
    if (clientA) clientA.disconnect();
    if (clientB) clientB.disconnect();

    await socketServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    if (isDbConnected) {
      await mongoose.disconnect();
    }
  }
}

runMutationIdempotencyContractTests().catch((err) => {
  console.error("Mutation ID Contract Test Failed:", err);
  process.exit(1);
});
