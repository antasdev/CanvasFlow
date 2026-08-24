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
  SelectionChangedPayload,
  SocketEvents,
  SocketServer,
} from "../index";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runSocketSelectionSyncTests(): Promise<void> {
  console.log("Starting Live Collaborator Selection Synchronization Integration Tests...\n");

  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log("Connected to MongoDB for workspace/board setup.");
  } catch (err) {
    console.warn("MongoDB connection unavailable, skipping test:", err);
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
  const userAId = new Types.ObjectId();
  const userBId = new Types.ObjectId();
  const userCId = new Types.ObjectId(); // User on separate Board 2

  const tokenA = generateAccessToken({
    userId: userAId.toString(),
    role: UserRole.USER,
  });

  const tokenB = generateAccessToken({
    userId: userBId.toString(),
    role: UserRole.USER,
  });

  const tokenC = generateAccessToken({
    userId: userCId.toString(),
    role: UserRole.USER,
  });

  let workspace1Id: Types.ObjectId | null = null;
  let board1Id: Types.ObjectId | null = null;
  let canvas1Id: Types.ObjectId | null = null;
  let shape1Id: Types.ObjectId | null = null;
  let shape2Id: Types.ObjectId | null = null;

  let workspace2Id: Types.ObjectId | null = null;
  let board2Id: Types.ObjectId | null = null;
  let canvas2Id: Types.ObjectId | null = null;
  let shape3Id: Types.ObjectId | null = null;

  try {
    // 1. Seed Board 1 (Shared between User A and User B) with two shapes
    const ws1 = await WorkspaceModel.create({
      name: "Selection Workspace 1",
      ownerId: userAId,
      visibility: WorkspaceVisibility.PRIVATE,
    });
    workspace1Id = ws1._id as Types.ObjectId;

    await WorkspaceMemberModel.create({
      workspaceId: workspace1Id,
      userId: userBId,
      role: WorkspaceRole.EDITOR,
    });

    const b1 = await BoardModel.create({
      workspaceId: workspace1Id,
      name: "Selection Board 1",
      createdBy: userAId,
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

    const s1 = await ShapeModel.create({
      canvasId: canvas1Id,
      type: ShapeType.RECTANGLE,
      x: 100,
      y: 100,
      width: 150,
      height: 100,
      rotation: 0,
      zIndex: 1,
      style: { fill: "#3b82f6", stroke: "#000000", strokeWidth: 2, opacity: 1 },
      createdBy: userAId,
    });
    shape1Id = s1._id as Types.ObjectId;

    const s2 = await ShapeModel.create({
      canvasId: canvas1Id,
      type: ShapeType.RECTANGLE,
      x: 300,
      y: 100,
      width: 150,
      height: 100,
      rotation: 0,
      zIndex: 2,
      style: { fill: "#10b981", stroke: "#000000", strokeWidth: 2, opacity: 1 },
      createdBy: userAId,
    });
    shape2Id = s2._id as Types.ObjectId;

    // 2. Seed Board 2 (Owned exclusively by User C) with one shape
    const ws2 = await WorkspaceModel.create({
      name: "Selection Workspace 2",
      ownerId: userCId,
      visibility: WorkspaceVisibility.PRIVATE,
    });
    workspace2Id = ws2._id as Types.ObjectId;

    const b2 = await BoardModel.create({
      workspaceId: workspace2Id,
      name: "Selection Board 2",
      createdBy: userCId,
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

    const s3 = await ShapeModel.create({
      canvasId: canvas2Id,
      type: ShapeType.RECTANGLE,
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: 1,
      style: { fill: "#ef4444", stroke: "#000000", strokeWidth: 2, opacity: 1 },
      createdBy: userCId,
    });
    shape3Id = s3._id as Types.ObjectId;

    console.log("✓ Seeded workspaces, boards, canvases, and shapes in MongoDB.");

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

    const clientA = await createAuthClient(tokenA);
    const clientB = await createAuthClient(tokenB);
    const clientC = await createAuthClient(tokenC);

    // Join Board 1 for User A and User B
    await new Promise<void>((resolve) => {
      clientA.emit(
        SocketEvents.BOARD_JOIN,
        { boardId: board1Id!.toString() },
        () => resolve()
      );
    });

    await new Promise<void>((resolve) => {
      clientB.emit(
        SocketEvents.BOARD_JOIN,
        { boardId: board1Id!.toString() },
        () => resolve()
      );
    });

    // Join Board 2 for User C
    await new Promise<void>((resolve) => {
      clientC.emit(
        SocketEvents.BOARD_JOIN,
        { boardId: board2Id!.toString() },
        () => resolve()
      );
    });

    // Test 1: User A selects Shape 1 -> User B receives selection:changed, User A excluded
    console.log("\nTest 1: User A selects Shape 1 -> User B receives selection:changed, sender excluded...");
    let bReceivedSelection: SelectionChangedPayload | null = null;
    let aReceivedSelection: SelectionChangedPayload | null = null;

    clientB.on(SocketEvents.SELECTION_CHANGED, (payload: SelectionChangedPayload) => {
      bReceivedSelection = payload;
    });

    clientA.on(SocketEvents.SELECTION_CHANGED, (payload: SelectionChangedPayload) => {
      aReceivedSelection = payload;
    });

    clientA.emit(SocketEvents.SELECTION_CHANGE, {
      boardId: board1Id!.toString(),
      shapeIds: [shape1Id!.toString()],
    });

    await new Promise((r) => setTimeout(r, 100));

    assert(bReceivedSelection !== null, "User B must receive selection:changed event");
    assert(
      (bReceivedSelection as any).userId === userAId.toString(),
      "Server-derived userId must match User A"
    );
    assert(
      (bReceivedSelection as any).boardId === board1Id!.toString(),
      "boardId must match Board 1"
    );
    assert(
      (bReceivedSelection as any).shapeIds.length === 1 &&
        (bReceivedSelection as any).shapeIds[0] === shape1Id!.toString(),
      "shapeIds must contain Shape 1"
    );

    assert(
      aReceivedSelection === null,
      "User A (sender) must NOT receive their own selection:changed event"
    );
    console.log("✓ Live selection delivered to room collaborators with sender excluded.");

    // Test 2: User A multi-selects Shape 1 and Shape 2 -> User B receives updated selection
    console.log("\nTest 2: Multi-selection broadcast (Shape 1 + Shape 2)...");
    bReceivedSelection = null;

    clientA.emit(SocketEvents.SELECTION_CHANGE, {
      boardId: board1Id!.toString(),
      shapeIds: [shape1Id!.toString(), shape2Id!.toString()],
    });

    await new Promise((r) => setTimeout(r, 100));

    assert(bReceivedSelection !== null, "User B must receive updated multi-selection");
    assert(
      (bReceivedSelection as any).shapeIds.length === 2 &&
        (bReceivedSelection as any).shapeIds.includes(shape1Id!.toString()) &&
        (bReceivedSelection as any).shapeIds.includes(shape2Id!.toString()),
      "shapeIds must contain both selected shapes"
    );
    console.log("✓ Multi-selection synchronized accurately.");

    // Test 3: User identity is server-derived, client cannot spoof another userId
    console.log("\nTest 3: Verifying client cannot spoof userId in selection payload...");
    bReceivedSelection = null;

    (clientA as any).emit(SocketEvents.SELECTION_CHANGE, {
      boardId: board1Id!.toString(),
      shapeIds: [shape1Id!.toString()],
      userId: "spoofed-user-id",
    });

    await new Promise((r) => setTimeout(r, 100));

    assert(bReceivedSelection !== null, "User B received selection update");
    assert(
      (bReceivedSelection as any).userId === userAId.toString(),
      "userId was verified from socket session, spoofed payload ignored"
    );
    console.log("✓ Zero client trust: userId strictly derived from authenticated JWT session.");

    // Test 4: Board Room Isolation: Board 1 selection events NEVER reach Board 2
    console.log("\nTest 4: Board room isolation (Board 1 selection never reaches Board 2 client)...");
    let cReceivedSelection: SelectionChangedPayload | null = null;
    clientC.on(SocketEvents.SELECTION_CHANGED, (payload: SelectionChangedPayload) => {
      cReceivedSelection = payload;
    });

    clientA.emit(SocketEvents.SELECTION_CHANGE, {
      boardId: board1Id!.toString(),
      shapeIds: [shape2Id!.toString()],
    });

    await new Promise((r) => setTimeout(r, 100));

    assert(
      cReceivedSelection === null,
      "User C on Board 2 must NOT receive selection events from Board 1"
    );
    console.log("✓ Board room isolation verified: no cross-board selection leakage.");

    // Test 5: Cross-board shape selection rejection
    console.log("\nTest 5: Rejecting cross-board shape selection (Shape 3 belongs to Board 2)...");
    bReceivedSelection = null;

    clientA.emit(SocketEvents.SELECTION_CHANGE, {
      boardId: board1Id!.toString(),
      shapeIds: [shape3Id!.toString()],
    });

    await new Promise((r) => setTimeout(r, 100));

    assert(
      bReceivedSelection === null,
      "Selection containing foreign shape from Board 2 must be rejected by server"
    );
    console.log("✓ Cross-board foreign shape selection rejected securely.");

    // Test 6: Socket not joined to board room cannot emit selection events
    console.log("\nTest 6: Rejecting selection from socket not joined to board room...");
    const unjoinedClient = await createAuthClient(tokenA);
    bReceivedSelection = null;

    unjoinedClient.emit(SocketEvents.SELECTION_CHANGE, {
      boardId: board1Id!.toString(),
      shapeIds: [shape1Id!.toString()],
    });

    await new Promise((r) => setTimeout(r, 100));

    assert(
      bReceivedSelection === null,
      "Unjoined socket selection change must be dropped by server"
    );
    unjoinedClient.disconnect();
    console.log("✓ Unjoined socket selection change dropped securely.");

    // Test 7: Duplicate shape IDs and excessive selection rejection
    console.log("\nTest 7: Rejecting duplicate shape IDs and excessive array sizes...");
    bReceivedSelection = null;

    // Duplicate shape IDs
    clientA.emit(SocketEvents.SELECTION_CHANGE, {
      boardId: board1Id!.toString(),
      shapeIds: [shape1Id!.toString(), shape1Id!.toString()],
    });

    // Exceeding 100 shape IDs
    const excessiveIds = Array.from(
      { length: 101 },
      () => new Types.ObjectId().toString()
    );
    clientA.emit(SocketEvents.SELECTION_CHANGE, {
      boardId: board1Id!.toString(),
      shapeIds: excessiveIds,
    });

    // Invalid shape ID format
    clientA.emit(SocketEvents.SELECTION_CHANGE, {
      boardId: board1Id!.toString(),
      shapeIds: ["invalid-shape-id"],
    });

    await new Promise((r) => setTimeout(r, 100));

    assert(
      bReceivedSelection === null,
      "Invalid selection payloads must be dropped without crashing server"
    );
    console.log("✓ Invalid and excessive selection payloads dropped cleanly.");

    // Test 8: Empty selection broadcast clears remote selection
    console.log("\nTest 8: Empty selection broadcast clears selection across collaborators...");
    bReceivedSelection = null;

    clientA.emit(SocketEvents.SELECTION_CHANGE, {
      boardId: board1Id!.toString(),
      shapeIds: [],
    });

    await new Promise((r) => setTimeout(r, 100));

    assert(bReceivedSelection !== null, "User B received empty selection event");
    assert(
      (bReceivedSelection as any).shapeIds.length === 0,
      "shapeIds must be empty array"
    );
    console.log("✓ Empty selection cleared remote selection state.");

    // Disconnect clients
    clientA.disconnect();
    clientB.disconnect();
    clientC.disconnect();

  } finally {
    // Cleanup DB
    if (shape1Id) await ShapeModel.findByIdAndDelete(shape1Id);
    if (shape2Id) await ShapeModel.findByIdAndDelete(shape2Id);
    if (shape3Id) await ShapeModel.findByIdAndDelete(shape3Id);
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

  console.log("\nAll Live Collaborator Selection Synchronization Integration Tests Passed Successfully!\n");
}

runSocketSelectionSyncTests().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
