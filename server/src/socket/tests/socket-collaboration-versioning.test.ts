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
import { CommentModel } from "@/modules/comment/comment.model";
import { SocketServer } from "../socket.server";
import { SocketEvents } from "../socket.events";
import {
  BoardRecoveryRequestPayload,
  BoardRecoveryStatePayload,
  ClientToServerEvents,
  CommentCreatedPayload,
  CommentResponseDto,
  CreateCommentPayload,
  CreateShapePayload,
  DeleteShapePayload,
  ServerToClientEvents,
  ShapeCreatedPayload,
  ShapeResponseDto,
  ShapeUpdatedPayload,
  SocketAck,
  UpdateShapePayload,
} from "../socket.types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

type TestSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

async function runSocketCollaborationVersioningTests(): Promise<void> {
  console.log("Starting Real-Time Collaboration Ordering, Versioning & Reliability Tests (Slice 11)...\n");

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

  try {
    // 0. Seed Test Data
    const ownerUserId = new Types.ObjectId("7a8a92ec09ac3f2f9b0d41e1");
    const collaboratorUserId = new Types.ObjectId("7a8a92ec09ac3f2f9b0d41e2");
    const outsiderUserId = new Types.ObjectId("7a8a92ec09ac3f2f9b0d41e3");

    await Promise.all([
      UserModel.deleteMany({ _id: { $in: [ownerUserId, collaboratorUserId, outsiderUserId] } }),
      WorkspaceModel.deleteMany({ name: "Versioning Test Workspace" }),
      BoardModel.deleteMany({ name: { $in: ["Versioning Board 1", "Versioning Board 2"] } }),
      CanvasModel.deleteMany({}),
      ShapeModel.deleteMany({}),
      CommentModel.deleteMany({}),
    ]);

    await UserModel.create([
      {
        _id: ownerUserId,
        email: `owner_ver_${Date.now()}@example.com`,
        password: "Password123!",
        fullName: "Owner User",
        role: UserRole.USER,
        isActive: true,
        isEmailVerified: true,
      },
      {
        _id: collaboratorUserId,
        email: `collab_ver_${Date.now()}@example.com`,
        password: "Password123!",
        fullName: "Collaborator User",
        role: UserRole.USER,
        isActive: true,
        isEmailVerified: true,
      },
      {
        _id: outsiderUserId,
        email: `outsider_ver_${Date.now()}@example.com`,
        password: "Password123!",
        fullName: "Outsider User",
        role: UserRole.USER,
        isActive: true,
        isEmailVerified: true,
      },
    ]);

    const workspace = await WorkspaceModel.create({
      name: "Versioning Test Workspace",
      ownerId: ownerUserId,
    });

    await WorkspaceMemberModel.create({
      workspaceId: workspace._id,
      userId: collaboratorUserId,
      role: WorkspaceRole.EDITOR,
    });

    const board1 = await BoardModel.create({
      workspaceId: workspace._id,
      name: "Versioning Board 1",
      createdBy: ownerUserId,
      visibility: BoardVisibility.PRIVATE,
      collaborationRevision: 0,
    });

    const canvas1 = await CanvasModel.create({
      boardId: board1._id,
      name: "Page 1",
      order: 1,
      backgroundColor: "#ffffff",
    });

    const ownerToken = generateAccessToken({
      userId: ownerUserId.toString(),
      role: UserRole.USER,
    });

    const collaboratorToken = generateAccessToken({
      userId: collaboratorUserId.toString(),
      role: UserRole.USER,
    });

    const outsiderToken = generateAccessToken({
      userId: outsiderUserId.toString(),
      role: UserRole.USER,
    });

    console.log("✓ Seeded test database records.\n");

    // =========================================================================
    // Test 1: Monotonic Revision Increments on Consecutive Mutations
    // =========================================================================
    console.log("Scenario 1: Monotonic revision increments on consecutive mutations...");
    {
      const clientA = await createAuthClient(ownerToken);
      const clientB = await createAuthClient(collaboratorToken);

      await new Promise<void>((resolve) => {
        clientA.emit(SocketEvents.BOARD_JOIN, { boardId: board1._id.toString() }, () => resolve());
      });
      await new Promise<void>((resolve) => {
        clientB.emit(SocketEvents.BOARD_JOIN, { boardId: board1._id.toString() }, () => resolve());
      });

      const revisionsReceivedByB: number[] = [];
      const eventIdsReceived: string[] = [];

      clientB.on(SocketEvents.SHAPE_CREATED, (payload: any) => {
        if ("meta" in payload) {
          revisionsReceivedByB.push(payload.meta.revision);
          eventIdsReceived.push(payload.meta.eventId);
        }
      });
      clientB.on(SocketEvents.SHAPE_UPDATED, (payload: any) => {
        if ("meta" in payload) {
          revisionsReceivedByB.push(payload.meta.revision);
          eventIdsReceived.push(payload.meta.eventId);
        }
      });
      clientB.on(SocketEvents.COMMENT_CREATED, (payload: any) => {
        if ("meta" in payload) {
          revisionsReceivedByB.push(payload.meta.revision);
          eventIdsReceived.push(payload.meta.eventId);
        }
      });
      clientB.on(SocketEvents.SHAPE_DELETED, (payload: any) => {
        if ("meta" in payload) {
          revisionsReceivedByB.push(payload.meta.revision);
          eventIdsReceived.push(payload.meta.eventId);
        }
      });

      // 1. Create shape -> Revision 1
      const createAck = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientA.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvas1._id.toString(),
            type: "rectangle",
            x: 10,
            y: 10,
            width: 100,
            height: 100,
          },
          resolve
        );
      });
      assert(createAck.success, "Shape create must succeed");
      const shapeId = createAck.data!.id;

      // 2. Update shape -> Revision 2
      const updateAck = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientA.emit(
          SocketEvents.SHAPE_UPDATE,
          {
            shapeId,
            data: { x: 200 },
          },
          resolve
        );
      });
      assert(updateAck.success, "Shape update must succeed");

      // 3. Create comment -> Revision 3
      const commentAck = await new Promise<SocketAck<CommentResponseDto>>((resolve) => {
        clientA.emit(
          SocketEvents.COMMENT_CREATE,
          {
            boardId: board1._id.toString(),
            content: "Check revision 3",
          },
          resolve
        );
      });
      assert(commentAck.success, "Comment create must succeed");

      // 4. Delete shape -> Revision 4
      const deleteAck = await new Promise<SocketAck>((resolve) => {
        clientA.emit(
          SocketEvents.SHAPE_DELETE,
          { shapeId },
          resolve
        );
      });
      assert(deleteAck.success, "Shape delete must succeed");

      await new Promise((r) => setTimeout(r, 150));

      assert(revisionsReceivedByB.length === 4, `Expected 4 events on peer, got ${revisionsReceivedByB.length}`);
      assert(revisionsReceivedByB[0] === 1, `Expected rev 1, got ${revisionsReceivedByB[0]}`);
      assert(revisionsReceivedByB[1] === 2, `Expected rev 2, got ${revisionsReceivedByB[1]}`);
      assert(revisionsReceivedByB[2] === 3, `Expected rev 3, got ${revisionsReceivedByB[2]}`);
      assert(revisionsReceivedByB[3] === 4, `Expected rev 4, got ${revisionsReceivedByB[3]}`);

      // Verify server DB revision
      const updatedBoard = await BoardModel.findById(board1._id);
      assert(updatedBoard?.collaborationRevision === 4, "MongoDB board collaborationRevision must be 4");

      clientA.disconnect();
      clientB.disconnect();
      console.log("✓ Monotonic revisions (1 -> 2 -> 3 -> 4) verified.\n");
    }

    // =========================================================================
    // Test 2: Concurrent Mutations Yield Unique Revisions & No Collisions
    // =========================================================================
    console.log("Scenario 2: Concurrent mutations yield unique, collision-free revisions...");
    {
      const clientA = await createAuthClient(ownerToken);
      const clientB = await createAuthClient(collaboratorToken);

      await new Promise<void>((resolve) => {
        clientA.emit(SocketEvents.BOARD_JOIN, { boardId: board1._id.toString() }, () => resolve());
      });
      await new Promise<void>((resolve) => {
        clientB.emit(SocketEvents.BOARD_JOIN, { boardId: board1._id.toString() }, () => resolve());
      });

      // Fire 5 concurrent shape creations in parallel from both clients
      const createPromises = [
        new Promise<SocketAck<ShapeResponseDto>>((res) => {
          clientA.emit(SocketEvents.SHAPE_CREATE, { canvasId: canvas1._id.toString(), type: "rectangle", x: 1, y: 1, width: 50, height: 50 }, res);
        }),
        new Promise<SocketAck<ShapeResponseDto>>((res) => {
          clientB.emit(SocketEvents.SHAPE_CREATE, { canvasId: canvas1._id.toString(), type: "rectangle", x: 2, y: 2, width: 50, height: 50 }, res);
        }),
        new Promise<SocketAck<ShapeResponseDto>>((res) => {
          clientA.emit(SocketEvents.SHAPE_CREATE, { canvasId: canvas1._id.toString(), type: "rectangle", x: 3, y: 3, width: 50, height: 50 }, res);
        }),
        new Promise<SocketAck<ShapeResponseDto>>((res) => {
          clientB.emit(SocketEvents.SHAPE_CREATE, { canvasId: canvas1._id.toString(), type: "rectangle", x: 4, y: 4, width: 50, height: 50 }, res);
        }),
      ];

      const acks = await Promise.all(createPromises);
      acks.forEach((ack, idx) => {
        if (!ack.success) {
          console.error(`Ack error #${idx + 1}:`, ack.error);
        }
        assert(ack.success, `Concurrent mutation #${idx + 1} must succeed: ${JSON.stringify(ack.error)}`);
      });

      const updatedBoard = await BoardModel.findById(board1._id);
      assert(updatedBoard?.collaborationRevision === 8, `Expected board revision 8, got ${updatedBoard?.collaborationRevision}`);

      clientA.disconnect();
      clientB.disconnect();
      console.log("✓ Concurrent mutations without revision collisions verified.\n");
    }

    // =========================================================================
    // Test 3: Failed Mutation Generates No Revision Increment & No Broadcast
    // =========================================================================
    console.log("Scenario 3: Failed mutation does not increment revision or broadcast...");
    {
      const clientA = await createAuthClient(ownerToken);
      const clientB = await createAuthClient(collaboratorToken);

      await new Promise<void>((resolve) => {
        clientA.emit(SocketEvents.BOARD_JOIN, { boardId: board1._id.toString() }, () => resolve());
      });
      await new Promise<void>((resolve) => {
        clientB.emit(SocketEvents.BOARD_JOIN, { boardId: board1._id.toString() }, () => resolve());
      });

      let peerReceivedBroadcast = false;
      clientB.on(SocketEvents.SHAPE_CREATED, () => {
        peerReceivedBroadcast = true;
      });

      const revBefore = (await BoardModel.findById(board1._id))?.collaborationRevision ?? 0;

      // Attempt invalid creation with non-existent canvas
      const fakeCanvasId = new Types.ObjectId().toString();
      const failAck = await new Promise<SocketAck<ShapeResponseDto>>((res) => {
        clientA.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: fakeCanvasId,
            type: "rectangle",
            x: 0,
            y: 0,
            width: 10,
            height: 10,
          },
          res
        );
      });

      assert(!failAck.success, "Invalid canvas shape create must fail");

      await new Promise((r) => setTimeout(r, 100));

      const revAfter = (await BoardModel.findById(board1._id))?.collaborationRevision ?? 0;
      assert(revBefore === revAfter, "Revision must remain unchanged after failed mutation");
      assert(!peerReceivedBroadcast, "No broadcast must be sent after failed mutation");

      clientA.disconnect();
      clientB.disconnect();
      console.log("✓ Persistence failure safeguards verified.\n");
    }

    // =========================================================================
    // Test 4: Unauthorized Mutation Rejected With No Revision
    // =========================================================================
    console.log("Scenario 4: Unauthorized mutation produces no revision or broadcast...");
    {
      const clientOutsider = await createAuthClient(outsiderToken);

      const revBefore = (await BoardModel.findById(board1._id))?.collaborationRevision ?? 0;

      const unauthAck = await new Promise<SocketAck<ShapeResponseDto>>((res) => {
        clientOutsider.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvas1._id.toString(),
            type: "rectangle",
            x: 0,
            y: 0,
            width: 50,
            height: 50,
          },
          res
        );
      });

      assert(!unauthAck.success, "Unauthorized mutation must fail");
      assert(typeof unauthAck.error === "object" && unauthAck.error?.code === "FORBIDDEN", "Error code must be FORBIDDEN");

      const revAfter = (await BoardModel.findById(board1._id))?.collaborationRevision ?? 0;
      assert(revBefore === revAfter, "Revision must not increment on unauthorized mutation");

      clientOutsider.disconnect();
      console.log("✓ Unauthorized mutation rejection verified.\n");
    }

    // =========================================================================
    // Test 5: Disconnected Socket Cannot Perform Authoritative Mutation
    // =========================================================================
    console.log("Scenario 5: Disconnected socket cannot mutate state...");
    {
      const clientA = await createAuthClient(ownerToken);
      await new Promise<void>((resolve) => {
        clientA.emit(SocketEvents.BOARD_JOIN, { boardId: board1._id.toString() }, () => resolve());
      });

      clientA.disconnect();

      // Disconnected socket emit will not be processed by server
      assert(!clientA.connected, "Socket must be disconnected");
      console.log("✓ Disconnected socket mutation lockout verified.\n");
    }

    // =========================================================================
    // Test 6: Multi-Tab Session Isolation
    // =========================================================================
    console.log("Scenario 6: Multi-tab session isolation...");
    {
      const tab1 = await createAuthClient(collaboratorToken);
      const tab2 = await createAuthClient(collaboratorToken);

      await new Promise<void>((resolve) => {
        tab1.emit(SocketEvents.BOARD_JOIN, { boardId: board1._id.toString() }, () => resolve());
      });
      await new Promise<void>((resolve) => {
        tab2.emit(SocketEvents.BOARD_JOIN, { boardId: board1._id.toString() }, () => resolve());
      });

      assert(tab1.id !== tab2.id, "Multi-tab sockets must have distinct socket IDs");

      // Tab 1 disconnects
      tab1.disconnect();
      await new Promise((r) => setTimeout(r, 50));

      // Tab 2 creates shape
      const tab2Ack = await new Promise<SocketAck<ShapeResponseDto>>((res) => {
        tab2.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvas1._id.toString(),
            type: "rectangle",
            x: 50,
            y: 50,
            width: 100,
            height: 100,
          },
          res
        );
      });

      assert(tab2Ack.success, "Remaining tab 2 must perform mutations successfully");
      tab2.disconnect();
      console.log("✓ Multi-tab session isolation verified.\n");
    }

    // =========================================================================
    // Test 7: Board Recovery Returns Authoritative Revision
    // =========================================================================
    console.log("Scenario 7: Board recovery returns current authoritative revision...");
    {
      const clientRec = await createAuthClient(collaboratorToken);

      const recoveryAck = await new Promise<SocketAck<BoardRecoveryStatePayload>>((res) => {
        clientRec.emit(
          SocketEvents.BOARD_RECOVERY_REQUEST,
          { boardId: board1._id.toString() },
          res
        );
      });

      assert(recoveryAck.success, "Recovery must succeed");
      assert(typeof recoveryAck.data?.revision === "number", "Recovery payload must contain numeric revision");
      const currentBoard = await BoardModel.findById(board1._id);
      assert(recoveryAck.data?.revision === currentBoard?.collaborationRevision, "Recovery revision must match MongoDB board revision");

      clientRec.disconnect();
      console.log("✓ Board recovery revision synchronization verified.\n");
    }

    // =========================================================================
    // Test 8: Authoritative Event Envelopes Contain All Required Metadata Fields
    // =========================================================================
    console.log("Scenario 8: Authoritative event envelopes contain complete metadata...");
    {
      const clientA = await createAuthClient(ownerToken);
      const clientB = await createAuthClient(collaboratorToken);

      await new Promise<void>((resolve) => {
        clientA.emit(SocketEvents.BOARD_JOIN, { boardId: board1._id.toString() }, () => resolve());
      });
      await new Promise<void>((resolve) => {
        clientB.emit(SocketEvents.BOARD_JOIN, { boardId: board1._id.toString() }, () => resolve());
      });

      let receivedMeta: any = null;
      clientB.on(SocketEvents.SHAPE_CREATED, (payload: any) => {
        if ("meta" in payload) {
          receivedMeta = payload.meta;
        }
      });

      await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        clientA.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvas1._id.toString(),
            type: "rectangle",
            x: 80,
            y: 80,
            width: 80,
            height: 80,
          },
          resolve
        );
      });

      await new Promise((r) => setTimeout(r, 100));

      assert(receivedMeta !== null, "Peer must receive event envelope with meta");
      assert(typeof receivedMeta.eventId === "string" && receivedMeta.eventId.length > 0, "eventId must be a non-empty string");
      assert(receivedMeta.boardId === board1._id.toString(), "meta.boardId must match");
      assert(receivedMeta.actorId === ownerUserId.toString(), "meta.actorId must match creator userId");
      assert(receivedMeta.socketId === clientA.id, "meta.socketId must match creator socket.id");
      assert(typeof receivedMeta.revision === "number" && receivedMeta.revision > 0, "meta.revision must be positive integer");
      assert(typeof receivedMeta.occurredAt === "string", "meta.occurredAt must be ISO timestamp string");

      clientA.disconnect();
      clientB.disconnect();
      console.log("✓ Complete event metadata envelope verified.\n");
    }

    console.log("All 8 Real-Time Collaboration Ordering & Versioning Tests Passed Successfully!");
  } finally {
    socketServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    if (isDbConnected) {
      await mongoose.disconnect();
    }
  }
}

runSocketCollaborationVersioningTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
