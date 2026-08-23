import { createServer } from "http";
import mongoose, { Types } from "mongoose";
import { io as clientIO, Socket as ClientSocket } from "socket.io-client";

import env from "@/config/env";
import { generateAccessToken } from "@/modules/auth/auth.tokens";
import { UserRole } from "@/modules/user/user.types";
import { UserModel } from "@/modules/user/user.model";
import { WorkspaceModel } from "@/modules/workspace/workspace.model";
import { WorkspaceMemberModel } from "@/modules/workspace/workspaceMember.model";
import { BoardModel } from "@/modules/board/board.model";
import { BoardVisibility } from "@/modules/board/board.types";
import { CanvasModel } from "@/modules/canvas/canvas.model";
import { ShapeModel } from "@/modules/shape/shape.model";
import { ShapeType } from "@/modules/shape/shape.types";
import { CommentModel } from "@/modules/comment/comment.model";
import { SocketServer } from "../socket.server";
import { SocketEvents } from "../socket.events";
import { presenceManager } from "../presence/presence.manager";
import { shapeLockManager } from "../locks/shape-lock.manager";
import {
  BoardRecoveryRequestPayload,
  BoardRecoveryStatePayload,
  ClientToServerEvents,
  CreateShapePayload,
  ServerToClientEvents,
  ShapeResponseDto,
  SocketAck,
  UserJoinedPayload,
  UserLeftPayload,
} from "../socket.types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

type TestSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

async function runSocketRecoverySyncTests(): Promise<void> {
  console.log("Starting Real-Time Reconnection & Board Recovery Integration Tests (Slice 10)...\n");

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
  const port = typeof address === "object" && address ? address.port : 0;
  const serverUrl = `http://localhost:${port}`;

  const ownerUserId = new Types.ObjectId();
  const memberUserId = new Types.ObjectId();
  const outsiderUserId = new Types.ObjectId();

  const ownerToken = generateAccessToken({
    userId: ownerUserId.toString(),
    role: UserRole.USER,
  });
  const memberToken = generateAccessToken({
    userId: memberUserId.toString(),
    role: UserRole.USER,
  });
  const outsiderToken = generateAccessToken({
    userId: outsiderUserId.toString(),
    role: UserRole.USER,
  });

  const createClient = (token: string): Promise<TestSocket> => {
    return new Promise((resolve, reject) => {
      const client = clientIO(serverUrl, {
        auth: { token: `Bearer ${token}` },
        transports: ["websocket"],
        forceNew: true,
        reconnection: false,
      }) as TestSocket;

      client.on("connect", () => {
        resolve(client);
      });

      client.on("connect_error", (err) => {
        reject(err);
      });
    });
  };

  const workspaceId = new Types.ObjectId();
  const board1Id = new Types.ObjectId();
  const board2Id = new Types.ObjectId();
  const canvas1Id = new Types.ObjectId();

  try {
    // Seed DB
    await UserModel.create([
      {
        _id: ownerUserId,
        email: `recovery_owner_${Date.now()}@example.com`,
        fullName: "Owner User",
        role: UserRole.USER,
        password: "Password123!",
        isEmailVerified: true,
      },
      {
        _id: memberUserId,
        email: `recovery_member_${Date.now()}@example.com`,
        fullName: "Member User",
        role: UserRole.USER,
        password: "Password123!",
        isEmailVerified: true,
      },
      {
        _id: outsiderUserId,
        email: `recovery_outsider_${Date.now()}@example.com`,
        fullName: "Outsider User",
        role: UserRole.USER,
        password: "Password123!",
        isEmailVerified: true,
      },
    ]);

    await WorkspaceModel.create({
      _id: workspaceId,
      name: "Recovery Workspace",
      ownerId: ownerUserId,
      visibility: "PRIVATE",
    });

    await WorkspaceMemberModel.create({
      workspaceId,
      userId: memberUserId,
      role: "EDITOR",
      joinedAt: new Date(),
    });

    await BoardModel.create({
      _id: board1Id,
      workspaceId,
      name: "Board 1",
      createdBy: ownerUserId,
      visibility: BoardVisibility.PRIVATE,
      isArchived: false,
    });

    await BoardModel.create({
      _id: board2Id,
      workspaceId: new Types.ObjectId(),
      name: "Board 2 (Outsider)",
      createdBy: outsiderUserId,
      visibility: BoardVisibility.PRIVATE,
      isArchived: false,
    });

    await CanvasModel.create({
      _id: canvas1Id,
      boardId: board1Id,
      name: "Page 1",
      order: 1,
    });

    const initialShape = await ShapeModel.create({
      canvasId: canvas1Id,
      type: ShapeType.RECTANGLE,
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      rotation: 0,
      style: {
        fill: "#3B82F6",
        stroke: "#1D4ED8",
        strokeWidth: 2,
        opacity: 1,
      },
      zIndex: 1,
      createdBy: ownerUserId,
    });

    console.log("✓ Seeded test database records.\n");

    // -------------------------------------------------------------
    // Scenario 1: Valid board recovery & presence snapshot
    // -------------------------------------------------------------
    console.log("Scenario 1: Valid board recovery, room rejoining & presence snapshot...");
    {
      const ownerClient = await createClient(ownerToken);
      const memberClient = await createClient(memberToken);

      // Member joins board first
      const joinAck = await new Promise<SocketAck<any>>((res) => {
        memberClient.emit(
          SocketEvents.BOARD_JOIN,
          { boardId: board1Id.toString(), canvasId: canvas1Id.toString() },
          (ack) => res(ack)
        );
      });
      assert(joinAck.success, "Member join must succeed");

      let userJoinedCapturedByMember = false;
      memberClient.on(SocketEvents.USER_JOINED, (payload: UserJoinedPayload) => {
        if (payload.userId === ownerUserId.toString()) {
          userJoinedCapturedByMember = true;
        }
      });

      let recoveryStatePushed = false;
      ownerClient.on(SocketEvents.BOARD_RECOVERY_STATE, (payload) => {
        if (payload.boardId === board1Id.toString()) {
          recoveryStatePushed = true;
        }
      });

      const recoveryAck = await new Promise<SocketAck<BoardRecoveryStatePayload>>((res) => {
        ownerClient.emit(
          SocketEvents.BOARD_RECOVERY_REQUEST,
          { boardId: board1Id.toString() },
          (response) => res(response)
        );
      });

      assert(recoveryAck.success, "Recovery ack must be successful");
      assert(recoveryAck.data !== undefined, "Recovery data must be returned");
      assert(recoveryAck.data?.boardId === board1Id.toString(), "BoardId matches");
      assert(Boolean(recoveryAck.data?.recoveredAt), "recoveredAt timestamp exists");
      assert(recoveryAck.data?.presence.activeUsers.length === 2, "Both active users present");

      await new Promise((res) => setTimeout(res, 50));
      assert(recoveryStatePushed, "Recovery state pushed over socket");
      assert(userJoinedCapturedByMember, "Member received user:joined broadcast");

      ownerClient.disconnect();
      memberClient.disconnect();
      presenceManager.clear();
      console.log("✓ Valid board recovery verified.");
    }

    // -------------------------------------------------------------
    // Scenario 2: Unauthorized board recovery attempt rejected
    // -------------------------------------------------------------
    console.log("\nScenario 2: Unauthorized board recovery attempt rejected with FORBIDDEN...");
    {
      const outsiderClient = await createClient(outsiderToken);

      const unauthorizedAck = await new Promise<SocketAck<BoardRecoveryStatePayload>>((res) => {
        outsiderClient.emit(
          SocketEvents.BOARD_RECOVERY_REQUEST,
          { boardId: board1Id.toString() },
          (response) => res(response)
        );
      });

      assert(unauthorizedAck.success === false, "Unauthorized recovery must be rejected");
      assert(
        typeof unauthorizedAck.error === "object" &&
          unauthorizedAck.error?.code === "FORBIDDEN",
        "Error code must be FORBIDDEN"
      );

      outsiderClient.disconnect();
      console.log("✓ Unauthorized board recovery rejection verified.");
    }

    // -------------------------------------------------------------
    // Scenario 3: Invalid boardId payload rejected with BAD_REQUEST
    // -------------------------------------------------------------
    console.log("\nScenario 3: Invalid boardId payload rejected with BAD_REQUEST...");
    {
      const ownerClient = await createClient(ownerToken);

      const invalidAck = await new Promise<SocketAck<BoardRecoveryStatePayload>>((res) => {
        ownerClient.emit(
          SocketEvents.BOARD_RECOVERY_REQUEST,
          { boardId: "invalid-id-format" },
          (response) => res(response)
        );
      });

      assert(invalidAck.success === false, "Invalid boardId must be rejected");
      assert(
        typeof invalidAck.error === "object" &&
          invalidAck.error?.code === "BAD_REQUEST",
        "Error code must be BAD_REQUEST"
      );

      ownerClient.disconnect();
      console.log("✓ Invalid boardId format rejection verified.");
    }

    // -------------------------------------------------------------
    // Scenario 4: Idempotent recovery requests
    // -------------------------------------------------------------
    console.log("\nScenario 4: Idempotent recovery requests do not duplicate presence or room joins...");
    {
      const ownerClient = await createClient(ownerToken);

      const ack1 = await new Promise<SocketAck<BoardRecoveryStatePayload>>((res) => {
        ownerClient.emit(
          SocketEvents.BOARD_RECOVERY_REQUEST,
          { boardId: board1Id.toString() },
          (response) => res(response)
        );
      });
      assert(ack1.success === true, "First recovery must succeed");
      assert(ack1.data?.presence.activeUsers.length === 1, "Only 1 user present");

      const ack2 = await new Promise<SocketAck<BoardRecoveryStatePayload>>((res) => {
        ownerClient.emit(
          SocketEvents.BOARD_RECOVERY_REQUEST,
          { boardId: board1Id.toString() },
          (response) => res(response)
        );
      });
      assert(ack2.success === true, "Second recovery must succeed");
      assert(ack2.data?.presence.activeUsers.length === 1, "Presence remains deduplicated to 1 user");

      ownerClient.disconnect();
      presenceManager.clear();
      console.log("✓ Idempotent recovery verified.");
    }

    // -------------------------------------------------------------
    // Scenario 5: Multi-tab session isolation during tab reconnect
    // -------------------------------------------------------------
    console.log("\nScenario 5: Multi-tab session isolation during tab reconnect...");
    {
      const memberTab1 = await createClient(memberToken);
      const memberTab2 = await createClient(memberToken);

      await new Promise<SocketAck<any>>((res) => {
        memberTab1.emit(
          SocketEvents.BOARD_JOIN,
          { boardId: board1Id.toString() },
          (ack) => res(ack)
        );
      });
      await new Promise<SocketAck<any>>((res) => {
        memberTab2.emit(
          SocketEvents.BOARD_JOIN,
          { boardId: board1Id.toString() },
          (ack) => res(ack)
        );
      });

      const activeUsersBefore = presenceManager.getActiveUsers(board1Id.toString());
      assert(activeUsersBefore.length === 1, "Presence is deduplicated per user");

      // Tab 1 simulates disconnect
      memberTab1.disconnect();
      await new Promise((res) => setTimeout(res, 50));

      const activeUsersAfterTab1Disconnect = presenceManager.getActiveUsers(board1Id.toString());
      assert(activeUsersAfterTab1Disconnect.length === 1, "User still present via Tab 2");

      // Tab 1 reconnects as a fresh socket and recovers
      const memberTab1Reconnected = await createClient(memberToken);

      const recoveryAck = await new Promise<SocketAck<BoardRecoveryStatePayload>>((res) => {
        memberTab1Reconnected.emit(
          SocketEvents.BOARD_RECOVERY_REQUEST,
          { boardId: board1Id.toString() },
          (response) => res(response)
        );
      });

      assert(recoveryAck.success, "Tab 1 recovery succeeds");
      assert(recoveryAck.data?.presence.activeUsers.length === 1, "User presence remains exactly 1");

      memberTab1Reconnected.disconnect();
      memberTab2.disconnect();
      presenceManager.clear();
      console.log("✓ Multi-tab session isolation verified.");
    }

    // -------------------------------------------------------------
    // Scenario 6: Disconnect cleanup during recovery releases locks
    // -------------------------------------------------------------
    console.log("\nScenario 6: Disconnect cleanup during recovery releases locks and cleans presence...");
    {
      const ownerClient = await createClient(ownerToken);
      const memberClient = await createClient(memberToken);

      await new Promise<SocketAck<any>>((res) => {
        ownerClient.emit(
          SocketEvents.BOARD_JOIN,
          { boardId: board1Id.toString() },
          (ack) => res(ack)
        );
      });
      await new Promise<SocketAck<any>>((res) => {
        memberClient.emit(
          SocketEvents.BOARD_JOIN,
          { boardId: board1Id.toString() },
          (ack) => res(ack)
        );
      });

      // Member locks the initial shape
      await new Promise<SocketAck<any>>((res) => {
        memberClient.emit(
          SocketEvents.SHAPE_LOCK,
          { boardId: board1Id.toString(), shapeId: initialShape._id.toString() },
          (ack) => res(ack)
        );
      });

      let unlockedReceivedOnOwner = false;
      ownerClient.on(SocketEvents.SHAPE_UNLOCKED, (payload) => {
        if (payload.shapeId === initialShape._id.toString()) {
          unlockedReceivedOnOwner = true;
        }
      });

      let userLeftReceivedOnOwner = false;
      ownerClient.on(SocketEvents.USER_LEFT, (payload: UserLeftPayload) => {
        if (payload.userId === memberUserId.toString()) {
          userLeftReceivedOnOwner = true;
        }
      });

      // Member disconnects
      memberClient.disconnect();

      await new Promise((res) => setTimeout(res, 100));
      assert(unlockedReceivedOnOwner, "Owner received shape:unlocked on member disconnect");
      assert(userLeftReceivedOnOwner, "Owner received user:left on member disconnect");

      ownerClient.disconnect();
      presenceManager.clear();
      shapeLockManager.clear();
      console.log("✓ Disconnect cleanup and lock release verified.");
    }

    // -------------------------------------------------------------
    // Scenario 7: Collaboration continuity after recovery
    // -------------------------------------------------------------
    console.log("\nScenario 7: Full collaboration resume after recovery...");
    {
      const ownerClient = await createClient(ownerToken);
      const memberClient = await createClient(memberToken);

      // Member recovers board
      const recAck = await new Promise<SocketAck<BoardRecoveryStatePayload>>((res) => {
        memberClient.emit(
          SocketEvents.BOARD_RECOVERY_REQUEST,
          { boardId: board1Id.toString() },
          (ack) => res(ack)
        );
      });
      assert(recAck.success, "Member recovery must succeed");

      // Owner joins board
      const joinAck = await new Promise<SocketAck<any>>((res) => {
        ownerClient.emit(
          SocketEvents.BOARD_JOIN,
          { boardId: board1Id.toString() },
          (ack) => res(ack)
        );
      });
      assert(joinAck.success, "Owner join must succeed");

      // Member creates shape
      let shapeCreatedReceivedOnOwner = false;
      ownerClient.on(SocketEvents.SHAPE_CREATED, (shape) => {
        if (shape.type === "rectangle") {
          shapeCreatedReceivedOnOwner = true;
        }
      });

      const createPayload: CreateShapePayload = {
        canvasId: canvas1Id.toString(),
        type: "rectangle",
        x: 450,
        y: 450,
        width: 150,
        height: 120,
        style: {
          fill: "#8B5CF6",
          stroke: "#6D28D9",
          strokeWidth: 2,
          opacity: 1,
        },
      };

      const createAck = await new Promise<SocketAck<ShapeResponseDto>>((res) => {
        memberClient.emit(
          SocketEvents.SHAPE_CREATE,
          createPayload,
          (ack) => res(ack)
        );
      });

      assert(
        createAck.success,
        `Shape creation after recovery must succeed: ${JSON.stringify(createAck.error)}`
      );
      await new Promise((res) => setTimeout(res, 50));
      assert(shapeCreatedReceivedOnOwner, "Collaborator received shape:created broadcast");

      if (createAck.data?.id) {
        await ShapeModel.deleteOne({ _id: createAck.data.id });
      }

      ownerClient.disconnect();
      memberClient.disconnect();
      console.log("✓ Collaboration continuity after recovery verified.");
    }

    console.log("\nAll 7 Real-Time Reconnection & Board Recovery Tests Passed Successfully!");
  } finally {
    // Cleanup DB
    await ShapeModel.deleteMany({ canvasId: canvas1Id });
    await CommentModel.deleteMany({ boardId: { $in: [board1Id, board2Id] } });
    await CanvasModel.deleteMany({ _id: canvas1Id });
    await BoardModel.deleteMany({ _id: { $in: [board1Id, board2Id] } });
    await WorkspaceMemberModel.deleteMany({ workspaceId });
    await WorkspaceModel.deleteMany({ _id: workspaceId });
    await UserModel.deleteMany({
      _id: { $in: [ownerUserId, memberUserId, outsiderUserId] },
    });

    await socketServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    if (isDbConnected) {
      await mongoose.disconnect();
    }
  }
}

runSocketRecoverySyncTests().catch((err) => {
  console.error("Test failed:", err);
  process.exit(1);
});
