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
  DeleteShapePayload,
  ShapeResponseDto,
  SocketAck,
  SocketEvents,
  SocketServer,
} from "../index";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runSocketShapeSyncTests(): Promise<void> {
  console.log("Starting Real-Time Shape Synchronization Integration Tests...\n");

  try {
    await mongoose.connect(env.MONGODB_URI);
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

  // Test User Identifiers
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

  // DB entities
  let workspace1Id: Types.ObjectId | null = null;
  let workspace2Id: Types.ObjectId | null = null;
  let board1Id: Types.ObjectId | null = null;
  let board2Id: Types.ObjectId | null = null;
  let canvas1Id: Types.ObjectId | null = null;
  let canvas2Id: Types.ObjectId | null = null;
  let preExistingShapeId: Types.ObjectId | null = null;

  try {
    // 1. Seed Workspace 1 (Shared with Member)
    const ws1 = await WorkspaceModel.create({
      name: "Sync Test Workspace 1",
      ownerId: ownerUserId,
      visibility: WorkspaceVisibility.PRIVATE,
    });
    workspace1Id = ws1._id as Types.ObjectId;

    await WorkspaceMemberModel.create({
      workspaceId: workspace1Id,
      userId: memberUserId,
      role: WorkspaceRole.EDITOR,
    });

    const b1 = await BoardModel.create({
      workspaceId: workspace1Id,
      name: "Sync Test Board 1",
      createdBy: ownerUserId,
      visibility: BoardVisibility.PRIVATE,
      isArchived: false,
    });
    board1Id = b1._id as Types.ObjectId;

    const c1 = await CanvasModel.create({
      boardId: board1Id,
      name: "Page 1",
      order: 1,
      backgroundColor: "#FFFFFF",
    });
    canvas1Id = c1._id as Types.ObjectId;

    // 2. Seed Workspace 2 & Board 2 (Owned exclusively by Outsider)
    const ws2 = await WorkspaceModel.create({
      name: "Sync Test Workspace 2",
      ownerId: outsiderUserId,
      visibility: WorkspaceVisibility.PRIVATE,
    });
    workspace2Id = ws2._id as Types.ObjectId;

    const b2 = await BoardModel.create({
      workspaceId: workspace2Id,
      name: "Sync Test Board 2",
      createdBy: outsiderUserId,
      visibility: BoardVisibility.PRIVATE,
      isArchived: false,
    });
    board2Id = b2._id as Types.ObjectId;

    const c2 = await CanvasModel.create({
      boardId: board2Id,
      name: "Page 1",
      order: 1,
      backgroundColor: "#FFFFFF",
    });
    canvas2Id = c2._id as Types.ObjectId;

    // Pre-seed a shape in Canvas 1
    const preShape = await ShapeModel.create({
      canvasId: canvas1Id,
      type: ShapeType.RECTANGLE,
      x: 10,
      y: 20,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: 1,
      style: {
        fill: "#ffffff",
        stroke: "#000000",
        strokeWidth: 2,
        opacity: 1,
      },
      createdBy: ownerUserId,
    });
    preExistingShapeId = preShape._id as Types.ObjectId;

    console.log("✓ Seeded workspaces, boards, canvases, and initial shape in MongoDB.");

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

    // Connect clients
    const clientOwner = await createAuthClient(ownerToken);
    const clientMember = await createAuthClient(memberToken);
    const clientOutsider = await createAuthClient(outsiderToken);

    // Join Board 1 for Owner and Member
    await new Promise<void>((resolve) => {
      clientOwner.emit(
        SocketEvents.BOARD_JOIN,
        { boardId: board1Id!.toString() },
        () => resolve()
      );
    });

    await new Promise<void>((resolve) => {
      clientMember.emit(
        SocketEvents.BOARD_JOIN,
        { boardId: board1Id!.toString() },
        () => resolve()
      );
    });

    // -------------------------------------------------------------
    // CREATE TESTS
    // -------------------------------------------------------------
    console.log("\n--- SHAPE CREATE TESTS ---");

    // Test 1: Invalid payload rejection
    console.log("Test 1: Rejecting invalid shape:create payload...");
    await new Promise<void>((resolve) => {
      clientOwner.emit(
        SocketEvents.SHAPE_CREATE,
        { canvasId: "invalid-id", width: -10 } as any,
        (ack: SocketAck<ShapeResponseDto>) => {
          assert(ack.success === false, "Ack must indicate failure");
          assert(
            typeof ack.error === "object" && ack.error?.code === "BAD_REQUEST",
            "Error code must be BAD_REQUEST"
          );
          resolve();
        }
      );
    });
    console.log("✓ Invalid create payload rejected with BAD_REQUEST.");

    // Test 2: Invalid canvasId rejection
    console.log("Test 2: Rejecting non-existent canvasId...");
    const nonExistentCanvasId = new Types.ObjectId().toString();
    await new Promise<void>((resolve) => {
      clientOwner.emit(
        SocketEvents.SHAPE_CREATE,
        {
          canvasId: nonExistentCanvasId,
          type: "rectangle",
          x: 0,
          y: 0,
          width: 50,
          height: 50,
        },
        (ack: SocketAck<ShapeResponseDto>) => {
          assert(ack.success === false, "Ack must indicate failure");
          assert(
            typeof ack.error === "object" && ack.error?.code === "NOT_FOUND",
            "Error code must be NOT_FOUND"
          );
          resolve();
        }
      );
    });
    console.log("✓ Non-existent canvasId rejected with NOT_FOUND.");

    // Test 3: User outside board room cannot create shape
    console.log("Test 3: Rejecting shape:create if user has not joined board room...");
    const unjoinedClient = await createAuthClient(ownerToken);
    await new Promise<void>((resolve) => {
      unjoinedClient.emit(
        SocketEvents.SHAPE_CREATE,
        {
          canvasId: canvas1Id!.toString(),
          type: "rectangle",
          x: 10,
          y: 10,
          width: 50,
          height: 50,
        },
        (ack: SocketAck<ShapeResponseDto>) => {
          assert(ack.success === false, "Ack must indicate failure");
          assert(
            typeof ack.error === "object" && ack.error?.code === "FORBIDDEN",
            "Error code must be FORBIDDEN when not joined to room"
          );
          resolve();
        }
      );
    });
    unjoinedClient.disconnect();
    console.log("✓ Socket not joined to board room rejected with FORBIDDEN.");

    // Test 4: Unauthorized outsider cannot create shape in Board 1
    console.log("Test 4: Rejecting shape:create by unauthorized user...");
    // Join outsider to Board 2 first to test room membership isolation
    await new Promise<void>((resolve) => {
      clientOutsider.emit(
        SocketEvents.BOARD_JOIN,
        { boardId: board2Id!.toString() },
        () => resolve()
      );
    });

    await new Promise<void>((resolve) => {
      clientOutsider.emit(
        SocketEvents.SHAPE_CREATE,
        {
          canvasId: canvas1Id!.toString(),
          type: "rectangle",
          x: 0,
          y: 0,
          width: 50,
          height: 50,
        },
        (ack: SocketAck<ShapeResponseDto>) => {
          assert(ack.success === false, "Outsider create must fail");
          assert(
            typeof ack.error === "object" && ack.error?.code === "FORBIDDEN",
            "Error code must be FORBIDDEN for unauthorized board"
          );
          resolve();
        }
      );
    });
    console.log("✓ Unauthorized create rejected with FORBIDDEN.");

    // Test 5: Authorized creation, persistence, DTO ack, and room broadcast with sender exclusion
    console.log("Test 5: Authorized shape create, DTO ack, broadcast to Member, sender excluded...");
    let memberReceivedCreated: ShapeResponseDto | null = null;
    let ownerReceivedCreated: ShapeResponseDto | null = null;

    clientMember.on(SocketEvents.SHAPE_CREATED, (shape: ShapeResponseDto) => {
      memberReceivedCreated = shape;
    });

    clientOwner.on(SocketEvents.SHAPE_CREATED, (shape: ShapeResponseDto) => {
      ownerReceivedCreated = shape;
    });

    let createdShapeId: string | null = null;

    const createAck = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
      clientOwner.emit(
        SocketEvents.SHAPE_CREATE,
        {
          canvasId: canvas1Id!.toString(),
          type: "rectangle",
          x: 100,
          y: 200,
          width: 300,
          height: 150,
          rotation: 45,
          style: {
            fill: "#3b82f6",
            stroke: "#1e40af",
            strokeWidth: 4,
            opacity: 0.9,
          },
        },
        (ack: SocketAck<ShapeResponseDto>) => resolve(ack)
      );
    });

    assert(createAck.success === true, "Create ack must succeed");
    assert(createAck.data !== undefined, "Create ack must contain data");
    createdShapeId = createAck.data!.id;

    assert(typeof createAck.data!.id === "string", "ID must be string");
    assert(createAck.data!.x === 100, "x must match");
    assert(createAck.data!.y === 200, "y must match");
    assert(createAck.data!.width === 300, "width must match");
    assert(createAck.data!.height === 150, "height must match");
    assert(createAck.data!.rotation === 45, "rotation must match");
    if (createAck.data!.type === "rectangle") {
      assert(createAck.data!.style.fill === "#3b82f6", "fill style must match");
    }

    // Verify DB persistence
    const targetShapeId = createdShapeId as string;
    const dbShape = await ShapeModel.findById(new Types.ObjectId(targetShapeId));
    assert(dbShape !== null, "Shape must be persisted in MongoDB");
    assert(dbShape!.width === 300, "Persisted width must match");

    // Wait for socket broadcast delivery
    await new Promise((r) => setTimeout(r, 100));

    assert(
      memberReceivedCreated !== null,
      "Member in Board 1 room must receive shape:created"
    );
    assert(
      (memberReceivedCreated as any).id === createdShapeId,
      "Broadcast shape ID must match created shape"
    );
    assert(
      ownerReceivedCreated === null,
      "Creator (sender) must NOT receive their own shape:created broadcast"
    );
    console.log("✓ Shape created, persisted in DB, DTO ack returned, broadcast delivered with sender excluded.");

    // -------------------------------------------------------------
    // UPDATE TESTS
    // -------------------------------------------------------------
    console.log("\n--- SHAPE UPDATE TESTS ---");

    // Test 6: Invalid shapeId format rejection
    console.log("Test 6: Rejecting invalid shapeId on shape:update...");
    await new Promise<void>((resolve) => {
      clientOwner.emit(
        SocketEvents.SHAPE_UPDATE,
        { shapeId: "bad-id", data: { x: 50 } },
        (ack: SocketAck<ShapeResponseDto>) => {
          assert(ack.success === false, "Ack must fail");
          assert(
            typeof ack.error === "object" && ack.error?.code === "BAD_REQUEST",
            "Error code must be BAD_REQUEST"
          );
          resolve();
        }
      );
    });
    console.log("✓ Invalid shapeId rejected with BAD_REQUEST.");

    // Test 7: Non-existent shapeId rejection
    console.log("Test 7: Rejecting non-existent shapeId...");
    const nonExistentShapeId = new Types.ObjectId().toString();
    await new Promise<void>((resolve) => {
      clientOwner.emit(
        SocketEvents.SHAPE_UPDATE,
        { shapeId: nonExistentShapeId, data: { x: 50 } },
        (ack: SocketAck<ShapeResponseDto>) => {
          assert(ack.success === false, "Ack must fail");
          assert(
            typeof ack.error === "object" && ack.error?.code === "NOT_FOUND",
            "Error code must be NOT_FOUND"
          );
          resolve();
        }
      );
    });
    console.log("✓ Non-existent shapeId rejected with NOT_FOUND.");

    // Test 8: Cross-board update rejection (Outsider trying to update Shape in Board 1)
    console.log("Test 8: Cross-board update rejected (Outsider joined to Board 2 cannot update Board 1 shape)...");
    await new Promise<void>((resolve) => {
      clientOutsider.emit(
        SocketEvents.SHAPE_UPDATE,
        { shapeId: createdShapeId!, data: { x: 999 } },
        (ack: SocketAck<ShapeResponseDto>) => {
          assert(ack.success === false, "Cross-board update must fail");
          assert(
            typeof ack.error === "object" && ack.error?.code === "FORBIDDEN",
            "Error code must be FORBIDDEN"
          );
          resolve();
        }
      );
    });
    console.log("✓ Cross-board update rejected with FORBIDDEN.");

    // Test 9: Member updates shape in Board 1 -> Owner receives shape:updated broadcast, Member excluded
    console.log("Test 9: Member updates shape -> Owner receives shape:updated broadcast, Member excluded...");
    let ownerReceivedUpdated: ShapeResponseDto | null = null;
    let memberReceivedUpdated: ShapeResponseDto | null = null;

    clientOwner.on(SocketEvents.SHAPE_UPDATED, (shape: ShapeResponseDto) => {
      ownerReceivedUpdated = shape;
    });

    clientMember.on(SocketEvents.SHAPE_UPDATED, (shape: ShapeResponseDto) => {
      memberReceivedUpdated = shape;
    });

    const updateAck = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
      clientMember.emit(
        SocketEvents.SHAPE_UPDATE,
        {
          shapeId: createdShapeId!,
          data: {
            x: 250,
            y: 350,
            width: 400,
            rotation: 90,
          },
        },
        (ack: SocketAck<ShapeResponseDto>) => resolve(ack)
      );
    });

    assert(updateAck.success === true, "Update ack must succeed");
    assert(updateAck.data!.x === 250, "Updated x must be 250");
    assert(updateAck.data!.y === 350, "Updated y must be 350");
    assert(updateAck.data!.width === 400, "Updated width must be 400");
    assert(updateAck.data!.rotation === 90, "Updated rotation must be 90");

    // Verify DB update
    const updatedDbShape = await ShapeModel.findById(new Types.ObjectId(createdShapeId!));
    assert(updatedDbShape!.x === 250, "DB x must match updated value");
    assert(updatedDbShape!.rotation === 90, "DB rotation must match updated value");

    await new Promise((r) => setTimeout(r, 100));

    assert(
      ownerReceivedUpdated !== null,
      "Owner in Board 1 room must receive shape:updated"
    );
    assert(
      (ownerReceivedUpdated as any).x === 250,
      "Broadcasted updated x must match"
    );
    assert(
      memberReceivedUpdated === null,
      "Member (sender) must NOT receive their own shape:updated broadcast"
    );
    console.log("✓ Shape updated, persisted, DTO returned, and broadcast delivered to collaborators only.");

    // -------------------------------------------------------------
    // DELETE TESTS
    // -------------------------------------------------------------
    console.log("\n--- SHAPE DELETE TESTS ---");

    // Test 10: Invalid shapeId on delete
    console.log("Test 10: Rejecting invalid shapeId on shape:delete...");
    await new Promise<void>((resolve) => {
      clientOwner.emit(
        SocketEvents.SHAPE_DELETE,
        { shapeId: "invalid-id" },
        (ack: SocketAck) => {
          assert(ack.success === false, "Ack must fail");
          assert(
            typeof ack.error === "object" && ack.error?.code === "BAD_REQUEST",
            "Error code must be BAD_REQUEST"
          );
          resolve();
        }
      );
    });
    console.log("✓ Invalid shapeId on delete rejected with BAD_REQUEST.");

    // Test 11: Unauthorized delete rejection
    console.log("Test 11: Rejecting unauthorized delete by outsider...");
    await new Promise<void>((resolve) => {
      clientOutsider.emit(
        SocketEvents.SHAPE_DELETE,
        { shapeId: createdShapeId! },
        (ack: SocketAck) => {
          assert(ack.success === false, "Outsider delete must fail");
          assert(
            typeof ack.error === "object" && ack.error?.code === "FORBIDDEN",
            "Error code must be FORBIDDEN"
          );
          resolve();
        }
      );
    });
    console.log("✓ Unauthorized delete rejected with FORBIDDEN.");

    // Test 12: Authorized delete, removed from MongoDB, broadcast to Member, sender excluded
    console.log("Test 12: Owner deletes shape -> DB removed -> Member receives shape:deleted, Owner excluded...");
    let memberReceivedDeleted: DeleteShapePayload | null = null;
    let ownerReceivedDeleted: DeleteShapePayload | null = null;

    clientMember.on(SocketEvents.SHAPE_DELETED, (payload: DeleteShapePayload) => {
      memberReceivedDeleted = payload;
    });

    clientOwner.on(SocketEvents.SHAPE_DELETED, (payload: DeleteShapePayload) => {
      ownerReceivedDeleted = payload;
    });

    const deleteAck = await new Promise<SocketAck>((resolve) => {
      clientOwner.emit(
        SocketEvents.SHAPE_DELETE,
        { shapeId: createdShapeId! },
        (ack: SocketAck) => resolve(ack)
      );
    });

    assert(deleteAck.success === true, "Delete ack must succeed");

    // Verify DB deletion
    const deletedDbShape = await ShapeModel.findById(new Types.ObjectId(createdShapeId!));
    assert(deletedDbShape === null, "Shape must be deleted from MongoDB");

    await new Promise((r) => setTimeout(r, 100));

    assert(
      memberReceivedDeleted !== null,
      "Member must receive shape:deleted"
    );
    assert(
      (memberReceivedDeleted as any).shapeId === createdShapeId,
      "Deleted shapeId must match"
    );
    assert(
      ownerReceivedDeleted === null,
      "Owner (sender) must NOT receive their own shape:deleted broadcast"
    );
    console.log("✓ Shape deleted, removed from MongoDB, ack returned, and broadcast delivered exclusively to other members.");

    // Cleanup client connections
    clientOwner.disconnect();
    clientMember.disconnect();
    clientOutsider.disconnect();

  } finally {
    // Cleanup DB Data
    await ShapeModel.deleteMany({
      canvasId: { $in: [canvas1Id, canvas2Id].filter(Boolean) },
    });
    if (canvas1Id) await CanvasModel.findByIdAndDelete(canvas1Id);
    if (canvas2Id) await CanvasModel.findByIdAndDelete(canvas2Id);
    if (board1Id) await BoardModel.findByIdAndDelete(board1Id);
    if (board2Id) await BoardModel.findByIdAndDelete(board2Id);
    if (workspace1Id) {
      await WorkspaceMemberModel.deleteMany({ workspaceId: workspace1Id });
      await WorkspaceModel.findByIdAndDelete(workspace1Id);
    }
    if (workspace2Id) {
      await WorkspaceMemberModel.deleteMany({ workspaceId: workspace2Id });
      await WorkspaceModel.findByIdAndDelete(workspace2Id);
    }

    await socketServer.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
    await mongoose.disconnect();
  }

  console.log("\nAll Real-Time Shape Synchronization Integration Tests Passed Successfully!\n");
}

runSocketShapeSyncTests().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
