import { createServer } from "http";
import mongoose, { Types } from "mongoose";
import { io as clientIO, Socket as ClientSocket } from "socket.io-client";

import env from "@/config/env";
import { generateAccessToken } from "@/modules/auth/auth.tokens";
import { UserRole } from "@/modules/user/user.types";
import { WorkspaceModel } from "@/modules/workspace/workspace.model";
import { WorkspaceMemberModel } from "@/modules/workspace/workspaceMember.model";
import { WorkspaceRole, WorkspaceVisibility } from "@/modules/workspace/workspace.types";
import { BoardModel } from "@/modules/board/board.model";
import { BoardVisibility } from "@/modules/board/board.types";
import { CanvasModel } from "@/modules/canvas/canvas.model";
import { ShapeModel } from "@/modules/shape/shape.model";
import { ShapeType } from "@/modules/shape/shape.types";

import {
  CanvasSyncPayload,
  getBoardRoom,
  presenceManager,
  SocketAck,
  SocketEvents,
  SocketServer,
  UserJoinedPayload,
  UserLeftPayload,
} from "../index";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runSocketBoardRoomTests(): Promise<void> {
  console.log("Starting Socket.IO Board Room & Authorization Tests...\n");

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

  // Test Data Identifiers
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

  let testWorkspaceId: Types.ObjectId | null = null;
  let testBoardId: Types.ObjectId | null = null;
  let testCanvasId: Types.ObjectId | null = null;
  let testShapeId: Types.ObjectId | null = null;

  try {
    // 1. Seed Workspace, Board, Canvas, and Shape
    const workspace = await WorkspaceModel.create({
      name: "Realtime Test Workspace",
      ownerId: ownerUserId,
      visibility: WorkspaceVisibility.PRIVATE,
    });
    testWorkspaceId = workspace._id as Types.ObjectId;

    await WorkspaceMemberModel.create({
      workspaceId: testWorkspaceId,
      userId: memberUserId,
      role: WorkspaceRole.EDITOR,
    });

    const board = await BoardModel.create({
      workspaceId: testWorkspaceId,
      name: "Realtime Test Board",
      createdBy: ownerUserId,
      visibility: BoardVisibility.PRIVATE,
      isArchived: false,
    });
    testBoardId = board._id as Types.ObjectId;

    const canvas = await CanvasModel.create({
      boardId: testBoardId,
      name: "Page 1",
      order: 1,
      backgroundColor: "#FFFFFF",
    });
    testCanvasId = canvas._id as Types.ObjectId;

    const shape = await ShapeModel.create({
      canvasId: testCanvasId,
      type: ShapeType.RECTANGLE,
      x: 50,
      y: 80,
      width: 200,
      height: 120,
      rotation: 0,
      zIndex: 1,
      style: {
        fill: "#ff0000",
        stroke: "#000000",
        strokeWidth: 2,
        opacity: 1,
      },
      createdBy: ownerUserId,
    });
    testShapeId = shape._id as Types.ObjectId;

    console.log("✓ Seeded test workspace, board, canvas, and shape in MongoDB.");

    // Helper to create authenticated client
    const createAuthClient = (token: string): Promise<ClientSocket> => {
      return new Promise((resolve, reject) => {
        const client = clientIO(serverUrl, {
          auth: { token: `Bearer ${token}` },
          transports: ["websocket"],
          reconnection: false,
        });

        client.on("connect", () => resolve(client));
        client.on("connect_error", (err) => reject(err));
      });
    };

    // Test 1: Invalid boardId rejection
    console.log("\nTest 1: Rejecting invalid boardId format...");
    const clientOwner = await createAuthClient(ownerToken);

    await new Promise<void>((resolve) => {
      clientOwner.emit(
        SocketEvents.BOARD_JOIN,
        { boardId: "invalid-id" },
        (ack: SocketAck) => {
          assert(ack.success === false, "Ack should indicate failure");
          assert(
            typeof ack.error === "object" && ack.error?.code === "BAD_REQUEST",
            "Error code should be BAD_REQUEST"
          );
          resolve();
        }
      );
    });
    console.log("✓ Invalid boardId format rejected with BAD_REQUEST.");

    // Test 2: Missing board 404
    console.log("\nTest 2: Non-existent board returns NOT_FOUND...");
    const nonExistentBoardId = new Types.ObjectId().toString();

    await new Promise<void>((resolve) => {
      clientOwner.emit(
        SocketEvents.BOARD_JOIN,
        { boardId: nonExistentBoardId },
        (ack: SocketAck) => {
          assert(ack.success === false, "Ack should indicate failure");
          assert(
            typeof ack.error === "object" && ack.error?.code === "NOT_FOUND",
            "Error code should be NOT_FOUND"
          );
          resolve();
        }
      );
    });
    console.log("✓ Non-existent board rejected with NOT_FOUND.");

    // Test 3: Unauthorized user forbidden
    console.log("\nTest 3: Outsider user is rejected with FORBIDDEN...");
    const clientOutsider = await createAuthClient(outsiderToken);

    await new Promise<void>((resolve) => {
      clientOutsider.emit(
        SocketEvents.BOARD_JOIN,
        { boardId: testBoardId!.toString() },
        (ack: SocketAck) => {
          assert(ack.success === false, "Ack should indicate failure");
          assert(
            typeof ack.error === "object" && ack.error?.code === "FORBIDDEN",
            "Error code should be FORBIDDEN"
          );
          resolve();
        }
      );
    });
    clientOutsider.disconnect();
    console.log("✓ Unauthorized user rejected with FORBIDDEN.");

    // Test 4: Board creator connects & receives canvas:sync with clean DTOs
    console.log("\nTest 4: Board creator joins room and receives canvas:sync...");
    let receivedSyncPayload: CanvasSyncPayload | null = null;

    clientOwner.on(SocketEvents.CANVAS_SYNC, (payload: CanvasSyncPayload) => {
      receivedSyncPayload = payload;
    });

    const joinAck = await new Promise<SocketAck<any>>((resolve) => {
      clientOwner.emit(
        SocketEvents.BOARD_JOIN,
        { boardId: testBoardId!.toString() },
        (ack: SocketAck) => resolve(ack)
      );
    });

    assert(joinAck.success === true, "Join ack must succeed for owner");
    assert(
      joinAck.data?.boardId === testBoardId!.toString(),
      "Ack boardId must match"
    );
    assert(
      joinAck.data?.canvasId === testCanvasId!.toString(),
      "Ack canvasId must match default canvas"
    );
    assert(
      joinAck.data?.activeUsers?.length === 1,
      "Active users should contain owner"
    );
    assert(
      joinAck.data?.activeUsers[0].userId === ownerUserId.toString(),
      "Active user ID should match owner"
    );

    assert(receivedSyncPayload !== null, "canvas:sync event must be received");
    assert(
      (receivedSyncPayload as any).shapes.length === 1,
      "canvas:sync must contain seeded shape"
    );
    const syncShape = (receivedSyncPayload as any).shapes[0];
    assert(
      typeof syncShape.id === "string",
      "Shape ID in DTO must be string (not ObjectId)"
    );
    assert(
      typeof syncShape.canvasId === "string",
      "Shape canvasId in DTO must be string"
    );
    assert(
      syncShape.type === "rectangle",
      "Shape type must be rectangle"
    );
    assert(syncShape.x === 50, "Shape x must match");
    assert(syncShape.style.fill === "#ff0000", "Shape fill must match");
    console.log("✓ Owner joined room, received canvas:sync with clean ShapeResponseDto.");

    // Test 5: Workspace Member joins room -> existing owner receives user:joined
    console.log("\nTest 5: Member joins -> Owner receives user:joined...");
    const clientMember = await createAuthClient(memberToken);

    let ownerReceivedUserJoined: UserJoinedPayload | null = null;
    let memberReceivedUserJoined: UserJoinedPayload | null = null;

    clientOwner.on(SocketEvents.USER_JOINED, (payload: UserJoinedPayload) => {
      ownerReceivedUserJoined = payload;
    });

    clientMember.on(SocketEvents.USER_JOINED, (payload: UserJoinedPayload) => {
      memberReceivedUserJoined = payload;
    });

    const memberJoinAck = await new Promise<SocketAck<any>>((resolve) => {
      clientMember.emit(
        SocketEvents.BOARD_JOIN,
        { boardId: testBoardId!.toString() },
        (ack: SocketAck) => resolve(ack)
      );
    });

    assert(memberJoinAck.success === true, "Member join ack must succeed");
    assert(
      memberJoinAck.data?.activeUsers?.length === 2,
      "Active users must now be 2"
    );

    // Wait a tick for event delivery
    await new Promise((r) => setTimeout(r, 100));

    assert(
      ownerReceivedUserJoined !== null,
      "Owner must receive user:joined event"
    );
    assert(
      (ownerReceivedUserJoined as any).userId === memberUserId.toString(),
      "user:joined userId must match member"
    );
    assert(
      memberReceivedUserJoined === null,
      "Joining member must NOT receive their own user:joined event"
    );
    console.log("✓ user:joined broadcast exclusively to other room members.");

    // Test 6: Multi-Tab Presence Behavior
    console.log("\nTest 6: Multi-tab presence tracking (Member opens Tab 2)...");
    const clientMemberTab2 = await createAuthClient(memberToken);

    const tab2JoinAck = await new Promise<SocketAck<any>>((resolve) => {
      clientMemberTab2.emit(
        SocketEvents.BOARD_JOIN,
        { boardId: testBoardId!.toString() },
        (ack: SocketAck) => resolve(ack)
      );
    });

    assert(tab2JoinAck.success === true, "Tab 2 join ack must succeed");
    // Distinct users should still be 2 (owner + member)
    assert(
      tab2JoinAck.data?.activeUsers?.length === 2,
      "Active users count should deduplicate multi-tab user"
    );

    // Close Tab 1 of Member
    console.log("  Closing Member Tab 1 (Tab 2 still open)...");
    let ownerReceivedUserLeftOnTab1 = false;
    clientOwner.on(SocketEvents.USER_LEFT, () => {
      ownerReceivedUserLeftOnTab1 = true;
    });

    await new Promise<void>((resolve) => {
      clientMember.emit(
        SocketEvents.BOARD_LEAVE,
        { boardId: testBoardId!.toString() },
        () => {
          clientMember.disconnect();
          resolve();
        }
      );
    });

    await new Promise((r) => setTimeout(r, 100));

    assert(
      ownerReceivedUserLeftOnTab1 === false,
      "Closing Tab 1 of multi-tab user must NOT emit user:left"
    );
    console.log("  ✓ Closing 1 of 2 tabs did not trigger user:left.");

    // Close Tab 2 of Member (last tab) -> user:left should now be emitted
    console.log("  Closing Member Tab 2 (final tab)...");
    let ownerReceivedUserLeftOnTab2: UserLeftPayload | null = null;
    clientOwner.on(SocketEvents.USER_LEFT, (payload: UserLeftPayload) => {
      ownerReceivedUserLeftOnTab2 = payload;
    });

    clientMemberTab2.disconnect();

    await new Promise((r) => setTimeout(r, 100));

    assert(
      ownerReceivedUserLeftOnTab2 !== null,
      "Disconnecting final tab of member must emit user:left"
    );
    assert(
      (ownerReceivedUserLeftOnTab2 as any).userId === memberUserId.toString(),
      "user:left userId must match member"
    );
    console.log("  ✓ Disconnecting final tab emitted user:left.");

    // Test 7: Owner leaves board
    console.log("\nTest 7: Owner leaves board...");
    await new Promise<void>((resolve) => {
      clientOwner.emit(
        SocketEvents.BOARD_LEAVE,
        { boardId: testBoardId!.toString() },
        (ack: SocketAck) => {
          assert(ack.success === true, "Leave ack must succeed");
          clientOwner.disconnect();
          resolve();
        }
      );
    });

    assert(
      presenceManager.getActiveUsers(testBoardId!.toString()).length === 0,
      "Presence manager should have 0 active users for the board"
    );
    console.log("✓ Owner left cleanly and presence is cleared.");

  } finally {
    // Cleanup MongoDB Test Data
    if (testShapeId) {
      await ShapeModel.findByIdAndDelete(testShapeId);
    }
    if (testCanvasId) {
      await CanvasModel.findByIdAndDelete(testCanvasId);
    }
    if (testBoardId) {
      await BoardModel.findByIdAndDelete(testBoardId);
    }
    if (testWorkspaceId) {
      await WorkspaceMemberModel.deleteMany({ workspaceId: testWorkspaceId });
      await WorkspaceModel.findByIdAndDelete(testWorkspaceId);
    }

    await socketServer.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
    await mongoose.disconnect();
  }

  console.log("\nAll Socket.IO Board Room & Authorization Tests Passed Successfully!\n");
}

runSocketBoardRoomTests().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
