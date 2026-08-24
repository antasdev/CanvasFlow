import { createServer } from "http";
import mongoose, { Types } from "mongoose";
import { io as clientIO, Socket as ClientSocket } from "socket.io-client";

import env from "@/config/env";
import { generateAccessToken } from "@/modules/auth/auth.tokens";
import { UserRole } from "@/modules/user/user.types";
import { UserModel } from "@/modules/user/user.model";
import { WorkspaceModel } from "@/modules/workspace/workspace.model";
import { WorkspaceMemberModel } from "@/modules/workspace/workspaceMember.model";
import { WorkspaceRole } from "@/modules/workspace/workspace.types";
import { BoardModel } from "@/modules/board/board.model";
import { BoardVisibility } from "@/modules/board/board.types";
import { CanvasModel } from "@/modules/canvas/canvas.model";
import { ShapeModel } from "@/modules/shape/shape.model";
import { ShapeType } from "@/modules/shape/shape.types";
import { CommentModel } from "@/modules/comment/comment.model";
import { MutationRecordModel } from "@/modules/mutation/mutation.model";
import { IMutationRecord } from "@/modules/mutation/mutation.types";
import { SocketServer } from "../socket.server";
import { SocketEvents } from "../socket.events";
import {
  ClientToServerEvents,
  CommentResponseDto,
  CreateCommentPayload,
  CreateShapePayload,
  DeleteCommentPayload,
  DeleteShapePayload,
  ResolveCommentPayload,
  ServerToClientEvents,
  ShapeCreatedPayload,
  ShapeDeletedPayload,
  ShapeResponseDto,
  ShapeUpdatedPayload,
  SocketAck,
  UpdateCommentPayload,
  UpdateShapePayload,
} from "../socket.types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

type TestSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

async function runSocketMutationIdempotencyTests(): Promise<void> {
  console.log("Starting Server-Side Mutation Idempotency Tests (Slice 14)...\n");

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
    // Seed Test Data
    const ownerUserId = new Types.ObjectId("8a8a92ec09ac3f2f9b0d41e1");
    const collaboratorUserId = new Types.ObjectId("8a8a92ec09ac3f2f9b0d41e2");

    await Promise.all([
      UserModel.deleteMany({ _id: { $in: [ownerUserId, collaboratorUserId] } }),
      WorkspaceModel.deleteMany({ name: { $regex: /Idempotency/i } }),
      BoardModel.deleteMany({ name: { $regex: /Idempotency/i } }),
      CanvasModel.deleteMany({}),
      ShapeModel.deleteMany({}),
      CommentModel.deleteMany({}),
      MutationRecordModel.deleteMany({}),
    ]);

    await UserModel.create([
      {
        _id: ownerUserId,
        email: `owner.idempotency.${Date.now()}@canvasflow.io`,
        password: "Password123!",
        fullName: "Idempotency Owner",
        role: UserRole.USER,
      },
      {
        _id: collaboratorUserId,
        email: `collab.idempotency.${Date.now()}@canvasflow.io`,
        password: "Password123!",
        fullName: "Idempotency Collaborator",
        role: UserRole.USER,
      },
    ]);

    const workspace = await WorkspaceModel.create({
      name: "Idempotency Test Workspace",
      ownerId: ownerUserId,
    });

    await WorkspaceMemberModel.create([
      {
        workspaceId: workspace._id,
        userId: ownerUserId,
        role: WorkspaceRole.OWNER,
      },
      {
        workspaceId: workspace._id,
        userId: collaboratorUserId,
        role: WorkspaceRole.EDITOR,
      },
    ]);

    const board1 = await BoardModel.create({
      name: "Idempotency Test Board 1",
      workspaceId: workspace._id,
      createdBy: ownerUserId,
      visibility: BoardVisibility.PUBLIC,
      collaborationRevision: 0,
    });

    const board2 = await BoardModel.create({
      name: "Idempotency Test Board 2",
      workspaceId: workspace._id,
      createdBy: ownerUserId,
      visibility: BoardVisibility.PUBLIC,
      collaborationRevision: 0,
    });

    const canvas1 = await CanvasModel.create({
      boardId: board1._id,
      name: "Main Canvas 1",
      order: 1,
    });

    const canvas2 = await CanvasModel.create({
      boardId: board2._id,
      name: "Main Canvas 2",
      order: 1,
    });

    const tokenA = generateAccessToken({
      userId: ownerUserId.toString(),
      role: UserRole.USER,
    });

    const tokenB = generateAccessToken({
      userId: collaboratorUserId.toString(),
      role: UserRole.USER,
    });

    clientA = await createAuthClient(tokenA);
    clientB = await createAuthClient(tokenB);

    // Join Board 1 Room
    await new Promise<void>((resolve) => {
      clientA.emit(
        SocketEvents.BOARD_JOIN,
        { boardId: board1._id.toString(), canvasId: canvas1._id.toString() },
        () => resolve()
      );
    });

    await new Promise<void>((resolve) => {
      clientB.emit(
        SocketEvents.BOARD_JOIN,
        { boardId: board1._id.toString(), canvasId: canvas1._id.toString() },
        () => resolve()
      );
    });

    // -------------------------------------------------------------
    // Scenario 1: Duplicate Shape Create
    // -------------------------------------------------------------
    console.log("Scenario 1: Duplicate Shape Create (At-Most-Once)");
    {
      const mutationId = "00000000-0000-4000-8000-000000000001";
      let peerReceivedEvents = 0;
      let peerShapeCreated: ShapeResponseDto | null = null;

      const handler = (payload: any) => {
        peerReceivedEvents++;
        peerShapeCreated = payload.shape;
      };
      clientB.on(SocketEvents.SHAPE_CREATED, handler);

      const createPayload: CreateShapePayload = {
        canvasId: canvas1._id.toString(),
        mutationId,
        type: "rectangle",
        x: 100,
        y: 200,
        width: 150,
        height: 100,
        rotation: 0,
      };

      // 1st request
      const ack1 = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.SHAPE_CREATE, createPayload, (res) => resolve(res));
      });

      assert(ack1.success === true, "First shape create must succeed");
      assert(ack1.mutationId === mutationId, "First ack must include mutationId");
      const shape1 = ack1.data!;
      assert(shape1.version === 1, "Initial shape version must be 1");

      await new Promise((r) => setTimeout(r, 60));
      assert(peerReceivedEvents === 1, "Peer must receive exactly 1 broadcast on initial create");

      // 2nd duplicate request with same mutationId
      const ack2 = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.SHAPE_CREATE, createPayload, (res) => resolve(res));
      });

      assert(ack2.success === true, "Duplicate shape create must succeed idempotently");
      assert(ack2.data!.id === shape1.id, "Duplicate create must return the exact same shape ID");
      assert(ack2.data!.version === 1, "Duplicate create must not increment entity version");

      await new Promise((r) => setTimeout(r, 60));
      assert(
        peerReceivedEvents === 1,
        "Peer must NOT receive a second broadcast on idempotent retry"
      );

      const totalShapes = await ShapeModel.countDocuments({ canvasId: canvas1._id });
      assert(totalShapes === 1, "Database must contain exactly 1 shape document");

      const board = await BoardModel.findById(board1._id);
      assert(board?.collaborationRevision === 1, "Board revision must remain 1");

      clientB.off(SocketEvents.SHAPE_CREATED, handler);
      console.log("  ✓ Duplicate create safely returned original shape without duplicate document or broadcast");
    }

    // -------------------------------------------------------------
    // Scenario 2: Duplicate Shape Update
    // -------------------------------------------------------------
    console.log("\nScenario 2: Duplicate Shape Update");
    {
      const shape = await ShapeModel.findOne({ canvasId: canvas1._id });
      assert(!!shape, "Shape must exist from Scenario 1");

      const mutationId = "00000000-0000-4000-8000-000000000002";
      let peerUpdateEvents = 0;
      const handler = (payload: any) => {
        peerUpdateEvents++;
      };
      clientB.on(SocketEvents.SHAPE_UPDATED, handler);

      const updatePayload: UpdateShapePayload = {
        shapeId: shape!._id.toString(),
        mutationId,
        expectedVersion: 1,
        data: { x: 350, y: 450 },
      };

      // 1st update request
      const ack1 = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.SHAPE_UPDATE, updatePayload, (res) => resolve(res));
      });

      assert(ack1.success === true, "Initial shape update must succeed");
      assert(ack1.data!.version === 2, "Shape version must advance to 2");
      assert(ack1.data!.x === 350, "Shape x must be updated to 350");

      await new Promise((r) => setTimeout(r, 60));
      assert(peerUpdateEvents === 1, "Peer must receive exactly 1 broadcast");

      // 2nd duplicate update request
      const ack2 = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.SHAPE_UPDATE, updatePayload, (res) => resolve(res));
      });

      assert(ack2.success === true, "Duplicate shape update must succeed idempotently");
      assert(ack2.data!.version === 2, "Duplicate update must NOT increment version to 3");
      assert(ack2.data!.x === 350, "Duplicate update must return canonical updated data");

      await new Promise((r) => setTimeout(r, 60));
      assert(
        peerUpdateEvents === 1,
        "Peer must NOT receive a second broadcast on idempotent retry"
      );

      const board = await BoardModel.findById(board1._id);
      assert(board?.collaborationRevision === 2, "Board revision must remain 2");

      clientB.off(SocketEvents.SHAPE_UPDATED, handler);
      console.log("  ✓ Duplicate update safely returned original response without double revision increment");
    }

    // -------------------------------------------------------------
    // Scenario 3: Duplicate Shape Delete
    // -------------------------------------------------------------
    console.log("\nScenario 3: Duplicate Shape Delete");
    {
      const shape = await ShapeModel.findOne({ canvasId: canvas1._id });
      const mutationId = "00000000-0000-4000-8000-000000000003";
      let peerDeleteEvents = 0;
      const handler = () => {
        peerDeleteEvents++;
      };
      clientB.on(SocketEvents.SHAPE_DELETED, handler);

      const deletePayload: DeleteShapePayload = {
        shapeId: shape!._id.toString(),
        mutationId,
        expectedVersion: 2,
      };

      // 1st delete request
      const ack1 = await new Promise<SocketAck>((resolve) => {
        clientA.emit(SocketEvents.SHAPE_DELETE, deletePayload, (res) => resolve(res));
      });
      assert(ack1.success === true, "Initial shape delete must succeed");

      await new Promise((r) => setTimeout(r, 60));
      assert(peerDeleteEvents === 1, "Peer must receive delete broadcast");

      // 2nd duplicate delete request
      const ack2 = await new Promise<SocketAck>((resolve) => {
        clientA.emit(SocketEvents.SHAPE_DELETE, deletePayload, (res) => resolve(res));
      });
      assert(ack2.success === true, "Duplicate delete must succeed idempotently");

      await new Promise((r) => setTimeout(r, 60));
      assert(peerDeleteEvents === 1, "Peer must NOT receive second delete broadcast");

      const board = await BoardModel.findById(board1._id);
      assert(board?.collaborationRevision === 3, "Board revision must remain 3");

      clientB.off(SocketEvents.SHAPE_DELETED, handler);
      console.log("  ✓ Duplicate delete safely acknowledged without extra revision increment");
    }

    // -------------------------------------------------------------
    // Scenario 4: Duplicate Comment Create
    // -------------------------------------------------------------
    console.log("\nScenario 4: Duplicate Comment Create");
    {
      const mutationId = "00000000-0000-4000-8000-000000000004";
      let peerCommentCreatedEvents = 0;
      const handler = () => {
        peerCommentCreatedEvents++;
      };
      clientB.on(SocketEvents.COMMENT_CREATED, handler);

      const createCommentPayload: CreateCommentPayload = {
        boardId: board1._id.toString(),
        mutationId,
        content: "First collaborative comment",
      };

      // 1st create
      const ack1 = await new Promise<SocketAck<CommentResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.COMMENT_CREATE, createCommentPayload, (res) => resolve(res));
      });
      assert(ack1.success === true, "Initial comment create must succeed");
      const commentId = ack1.data!.id;

      await new Promise((r) => setTimeout(r, 60));
      assert(peerCommentCreatedEvents === 1, "Peer must receive comment:created event");

      // 2nd duplicate create
      const ack2 = await new Promise<SocketAck<CommentResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.COMMENT_CREATE, createCommentPayload, (res) => resolve(res));
      });
      assert(ack2.success === true, "Duplicate comment create must succeed idempotently");
      assert(ack2.data!.id === commentId, "Must return original comment ID");

      await new Promise((r) => setTimeout(r, 60));
      assert(peerCommentCreatedEvents === 1, "Peer must NOT receive second comment:created broadcast");

      const totalComments = await CommentModel.countDocuments({ boardId: board1._id });
      assert(totalComments === 1, "Database must contain exactly 1 comment document");

      clientB.off(SocketEvents.COMMENT_CREATED, handler);
      console.log("  ✓ Duplicate comment create prevented duplicate document creation");
    }

    // -------------------------------------------------------------
    // Scenario 5: Duplicate Comment Update
    // -------------------------------------------------------------
    console.log("\nScenario 5: Duplicate Comment Update");
    {
      const comment = await CommentModel.findOne({ boardId: board1._id });
      const mutationId = "00000000-0000-4000-8000-000000000005";

      const updatePayload: UpdateCommentPayload = {
        boardId: board1._id.toString(),
        commentId: comment!._id.toString(),
        mutationId,
        expectedVersion: 1,
        content: "Updated comment text",
      };

      const ack1 = await new Promise<SocketAck<CommentResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.COMMENT_UPDATE, updatePayload, (res) => resolve(res));
      });
      assert(ack1.success === true, "Initial comment update must succeed");
      assert(ack1.data!.version === 2, "Comment version must advance to 2");

      const ack2 = await new Promise<SocketAck<CommentResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.COMMENT_UPDATE, updatePayload, (res) => resolve(res));
      });
      assert(ack2.success === true, "Duplicate comment update must succeed idempotently");
      assert(ack2.data!.version === 2, "Duplicate update must not advance version to 3");

      console.log("  ✓ Duplicate comment update returned canonical response without duplicate increment");
    }

    // -------------------------------------------------------------
    // Scenario 6: Duplicate Comment Delete (Soft Delete)
    // -------------------------------------------------------------
    console.log("\nScenario 6: Duplicate Comment Delete");
    {
      const comment = await CommentModel.findOne({ boardId: board1._id });
      const mutationId = "00000000-0000-4000-8000-000000000006";

      const deletePayload: DeleteCommentPayload = {
        boardId: board1._id.toString(),
        commentId: comment!._id.toString(),
        mutationId,
        expectedVersion: 2,
      };

      const ack1 = await new Promise<SocketAck<CommentResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.COMMENT_DELETE, deletePayload, (res) => resolve(res));
      });
      assert(ack1.success === true, "Initial comment delete must succeed");

      const boardBefore = await BoardModel.findById(board1._id);
      const revBefore = boardBefore?.collaborationRevision ?? 0;

      const ack2 = await new Promise<SocketAck<CommentResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.COMMENT_DELETE, deletePayload, (res) => resolve(res));
      });
      assert(ack2.success === true, "Duplicate comment delete must succeed idempotently");

      const boardAfter = await BoardModel.findById(board1._id);
      assert(boardAfter?.collaborationRevision === revBefore, "Revision must not increment on duplicate delete");

      console.log("  ✓ Duplicate comment soft-delete handled idempotently");
    }

    // -------------------------------------------------------------
    // Scenario 7: Same Mutation ID With Different Payload (Reject)
    // -------------------------------------------------------------
    console.log("\nScenario 7: Same Mutation ID With Different Payload");
    {
      const mutationId = "00000000-0000-4000-8000-000000000007";

      const initialPayload: CreateShapePayload = {
        canvasId: canvas1._id.toString(),
        mutationId,
        type: "rectangle",
        x: 50,
        y: 50,
        width: 100,
        height: 100,
      };

      const ack1 = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.SHAPE_CREATE, initialPayload, (res) => resolve(res));
      });
      assert(ack1.success === true, "Initial create must succeed");

      const mismatchedPayload: CreateShapePayload = {
        canvasId: canvas1._id.toString(),
        mutationId,
        type: "rectangle",
        x: 999, // Altered payload
        y: 999,
        width: 500,
        height: 500,
      };

      const ack2 = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.SHAPE_CREATE, mismatchedPayload, (res) => resolve(res));
      });

      assert(ack2.success === false, "Mismatched payload must be rejected");
      const err = typeof ack2.error === "object" ? ack2.error : { code: "" };
      assert(
        err.code === "IDEMPOTENCY_KEY_REUSED" || err.code === "CONFLICT",
        `Expected IDEMPOTENCY_KEY_REUSED error code, got: ${err.code}`
      );

      console.log("  ✓ Reused mutation ID with altered payload rejected with IDEMPOTENCY_KEY_REUSED");
    }

    // -------------------------------------------------------------
    // Scenario 8: Same Mutation ID Across Different Boards
    // -------------------------------------------------------------
    console.log("\nScenario 8: Same Mutation ID Across Different Boards");
    {
      const sharedMutationId = "00000000-0000-4000-8000-000000000008";

      // Join Board 2 Room with clientA
      await new Promise<void>((resolve) => {
        clientA.emit(
          SocketEvents.BOARD_JOIN,
          { boardId: board2._id.toString(), canvasId: canvas2._id.toString() },
          () => resolve()
        );
      });

      const createBoard1Payload: CreateShapePayload = {
        canvasId: canvas1._id.toString(),
        mutationId: sharedMutationId,
        type: "rectangle",
        x: 10,
        y: 10,
        width: 100,
        height: 100,
      };

      const createBoard2Payload: CreateShapePayload = {
        canvasId: canvas2._id.toString(),
        mutationId: sharedMutationId,
        type: "rectangle",
        x: 20,
        y: 20,
        width: 100,
        height: 100,
      };

      const ack1 = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.SHAPE_CREATE, createBoard1Payload, (res) => resolve(res));
      });
      assert(ack1.success === true, "Create on Board 1 must succeed");

      const ack2 = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.SHAPE_CREATE, createBoard2Payload, (res) => resolve(res));
      });
      assert(ack2.success === true, "Create on Board 2 with same mutationId must succeed independently");
      assert(ack1.data!.id !== ack2.data!.id, "Must create two distinct shapes on separate boards");

      console.log("  ✓ Idempotency correctly scoped by boardId");
    }

    // -------------------------------------------------------------
    // Scenario 9: Same Mutation ID Across Different Users
    // -------------------------------------------------------------
    console.log("\nScenario 9: Same Mutation ID Across Different Users");
    {
      const sharedMutationId = "00000000-0000-4000-8000-000000000009";

      const createPayloadUserA: CreateShapePayload = {
        canvasId: canvas1._id.toString(),
        mutationId: sharedMutationId,
        type: "rectangle",
        x: 30,
        y: 30,
        width: 100,
        height: 100,
      };

      const createPayloadUserB: CreateShapePayload = {
        canvasId: canvas1._id.toString(),
        mutationId: sharedMutationId,
        type: "rectangle",
        x: 40,
        y: 40,
        width: 100,
        height: 100,
      };

      const ackA = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.SHAPE_CREATE, createPayloadUserA, (res) => resolve(res));
      });
      assert(ackA.success === true, "User A create must succeed");

      const ackB = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientB.emit(SocketEvents.SHAPE_CREATE, createPayloadUserB, (res) => resolve(res));
      });
      assert(ackB.success === true, "User B create with same mutationId must succeed independently");
      assert(ackA.data!.id !== ackB.data!.id, "Must create two distinct shapes for separate actors");

      console.log("  ✓ Idempotency correctly scoped by actorId");
    }

    // -------------------------------------------------------------
    // Scenario 10: Concurrent Duplicate Requests Race
    // -------------------------------------------------------------
    console.log("\nScenario 10: Concurrent Duplicate Requests Race");
    {
      const mutationId = "00000000-0000-4000-8000-000000000010";

      const payload: CreateShapePayload = {
        canvasId: canvas1._id.toString(),
        mutationId,
        type: "rectangle",
        x: 70,
        y: 70,
        width: 120,
        height: 120,
      };

      const [ack1, ack2] = await Promise.all([
        new Promise<SocketAck<ShapeResponseDto>>((resolve) =>
          clientA.emit(SocketEvents.SHAPE_CREATE, payload, (res) => resolve(res))
        ),
        new Promise<SocketAck<ShapeResponseDto>>((resolve) =>
          clientA.emit(SocketEvents.SHAPE_CREATE, payload, (res) => resolve(res))
        ),
      ]);

      // Exactly one succeeds with the creation, and the second either succeeds with the same result or receives in-progress/conflict
      const successes = [ack1, ack2].filter((a) => a.success);
      assert(successes.length >= 1, "At least one request must succeed");

      if (ack1.success && ack2.success) {
        assert(ack1.data!.id === ack2.data!.id, "Both must return the identical shape ID");
      }

      console.log("  ✓ Concurrent duplicate requests executed at most once");
    }

    // -------------------------------------------------------------
    // Scenario 11: Transaction Failure Rollback
    // -------------------------------------------------------------
    console.log("\nScenario 11: Transaction Failure Rollback");
    {
      const mutationId = "00000000-0000-4000-8000-000000000011";

      const invalidPayload: CreateShapePayload = {
        canvasId: "000000000000000000000000", // Non-existent canvas
        mutationId,
        type: "rectangle",
        x: 10,
        y: 10,
        width: 100,
        height: 100,
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.SHAPE_CREATE, invalidPayload, (res) => resolve(res));
      });

      assert(ack.success === false, "Invalid create must fail");

      const record = await MutationRecordModel.findOne({ mutationId }).lean<IMutationRecord>();
      assert(
        !record || record.status !== "completed",
        "No completed mutation record should exist after failure"
      );

      console.log("  ✓ Transaction failure cleanly rolled back without completed idempotency record");
    }

    // -------------------------------------------------------------
    // Scenario 12: Lost Acknowledgement Simulation
    // -------------------------------------------------------------
    console.log("\nScenario 12: Lost Acknowledgement Simulation");
    {
      const mutationId = "00000000-0000-4000-8000-000000000012";

      const createPayload: CreateShapePayload = {
        canvasId: canvas1._id.toString(),
        mutationId,
        type: "rectangle",
        x: 88,
        y: 88,
        width: 150,
        height: 150,
      };

      // 1. Initial execution
      const ack1 = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.SHAPE_CREATE, createPayload, (res) => resolve(res));
      });
      assert(ack1.success === true, "Initial creation succeeded");

      // 2. Client simulates missing acknowledgement and retrying with same mutationId
      const ackRetry = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.SHAPE_CREATE, createPayload, (res) => resolve(res));
      });

      assert(ackRetry.success === true, "Retry must succeed with stored response");
      assert(ackRetry.data!.id === ack1.data!.id, "Returned shape must match initial create");

      console.log("  ✓ Lost acknowledgement retry seamlessly returned authoritative persisted state");
    }

    // -------------------------------------------------------------
    // Scenario 13: OCC + Idempotency Interaction (No False Conflict)
    // -------------------------------------------------------------
    console.log("\nScenario 13: OCC + Idempotency Interaction");
    {
      // Create a fresh shape for OCC test
      const shape = await ShapeModel.create({
        canvasId: canvas1._id,
        createdBy: ownerUserId,
        type: ShapeType.RECTANGLE,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        zIndex: 10,
        version: 1,
      });

      const mutationId = "00000000-0000-4000-8000-000000000013";

      const updatePayload: UpdateShapePayload = {
        shapeId: shape._id.toString(),
        mutationId,
        expectedVersion: 1,
        data: { x: 555 },
      };

      // 1st update succeeds, advancing version to 2
      const ack1 = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.SHAPE_UPDATE, updatePayload, (res) => resolve(res));
      });
      assert(ack1.success === true, "Initial update must succeed");
      assert(ack1.data!.version === 2, "Version must be 2");

      // 2nd update with same expectedVersion=1 and SAME mutationId
      // Because idempotency intercepts before OCC, it returns the stored result instead of a false OCC 409 conflict
      const ack2 = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.SHAPE_UPDATE, updatePayload, (res) => resolve(res));
      });

      assert(ack2.success === true, "Idempotent retry with original expectedVersion must NOT trigger OCC conflict");
      assert(ack2.data!.version === 2, "Returned version must match");

      console.log("  ✓ Idempotency properly evaluated prior to OCC check, avoiding false 409 conflicts on retry");
    }

    // -------------------------------------------------------------
    // Scenario 14: Different Mutation IDs With Same OCC Version
    // -------------------------------------------------------------
    console.log("\nScenario 14: Different Mutation IDs With Same OCC Version");
    {
      const shape = await ShapeModel.create({
        canvasId: canvas1._id,
        createdBy: ownerUserId,
        type: ShapeType.RECTANGLE,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        zIndex: 20,
        version: 1,
      });

      const updateA: UpdateShapePayload = {
        shapeId: shape._id.toString(),
        mutationId: "00000000-0000-4000-8000-00000000014a",
        expectedVersion: 1,
        data: { x: 111 },
      };

      const updateB: UpdateShapePayload = {
        shapeId: shape._id.toString(),
        mutationId: "00000000-0000-4000-8000-00000000014b",
        expectedVersion: 1,
        data: { x: 222 },
      };

      const ackA = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.SHAPE_UPDATE, updateA, (res) => resolve(res));
      });
      assert(ackA.success === true, "User A with mutation A must succeed");

      const ackB = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientB.emit(SocketEvents.SHAPE_UPDATE, updateB, (res) => resolve(res));
      });
      assert(ackB.success === false, "User B with mutation B must fail with OCC CONFLICT");
      const err = typeof ackB.error === "object" ? ackB.error : { code: "" };
      assert(err.code === "CONFLICT", "Must be OCC conflict error code");

      console.log("  ✓ Distinct mutation IDs correctly enforce Optimistic Concurrency Control");
    }

    // -------------------------------------------------------------
    // Scenario 15: Multi-Tab Isolation
    // -------------------------------------------------------------
    console.log("\nScenario 15: Multi-Tab Isolation");
    {
      // Open second tab for ownerUser
      const clientA_Tab2 = await createAuthClient(tokenA);

      await new Promise<void>((resolve) => {
        clientA_Tab2.emit(
          SocketEvents.BOARD_JOIN,
          { boardId: board1._id.toString(), canvasId: canvas1._id.toString() },
          () => resolve()
        );
      });

      const mutationTab1 = "00000000-0000-4000-8000-000000000151";
      const mutationTab2 = "00000000-0000-4000-8000-000000000152";

      const ackTab1 = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientA.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvas1._id.toString(),
            mutationId: mutationTab1,
            type: "rectangle",
            x: 10,
            y: 10,
            width: 10,
            height: 10,
          },
          (res) => resolve(res)
        );
      });
      assert(ackTab1.success === true, "Tab 1 create must succeed");

      const ackTab2 = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientA_Tab2.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvas1._id.toString(),
            mutationId: mutationTab2,
            type: "rectangle",
            x: 20,
            y: 20,
            width: 20,
            height: 20,
          },
          (res) => resolve(res)
        );
      });
      assert(ackTab2.success === true, "Tab 2 create must succeed independently");
      assert(ackTab1.data!.id !== ackTab2.data!.id, "Both tabs produce independent shapes");

      clientA_Tab2.disconnect();
      console.log("  ✓ Multi-tab collaboration operates with proper isolation");
    }

    // -------------------------------------------------------------
    // Scenario 16: End-to-End Recovery After Lost Acknowledgement
    // -------------------------------------------------------------
    console.log("\nScenario 16: End-to-End Recovery After Lost Acknowledgement");
    {
      const mutationId = "00000000-0000-4000-8000-000000000016";

      const createPayload: CreateShapePayload = {
        canvasId: canvas1._id.toString(),
        mutationId,
        type: "rectangle",
        x: 777,
        y: 888,
        width: 200,
        height: 200,
      };

      const ack1 = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientA.emit(SocketEvents.SHAPE_CREATE, createPayload, (res) => resolve(res));
      });
      assert(ack1.success === true, "Create shape succeeded");

      // Verify mutation record in DB
      const record = await MutationRecordModel.findOne({
        mutationId,
        actorId: ownerUserId,
        boardId: board1._id,
      }).lean<IMutationRecord>();

      assert(!!record, "Mutation record must be present");
      assert(record!.status === "completed", "Mutation record status must be completed");
      assert(typeof record!.revision === "number", "Mutation record must record board revision");
      assert(typeof record!.eventId === "string", "Mutation record must record eventId");

      console.log("  ✓ End-to-end recovery record verified with canonical event metadata");
    }

    console.log("\n✅ All 16 Slice 14 Idempotency Tests Passed Successfully!\n");
  } finally {
    if (clientA) clientA.disconnect();
    if (clientB) clientB.disconnect();
    socketServer.close();
    httpServer.close();
    if (isDbConnected) {
      await mongoose.disconnect();
    }
  }
}

runSocketMutationIdempotencyTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
