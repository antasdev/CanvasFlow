import { createServer } from "http";
import mongoose, { Types } from "mongoose";
import { io as clientIO, Socket as ClientSocket } from "socket.io-client";

import env from "@/config/env";
import { generateAccessToken } from "@/modules/auth/auth.tokens";
import { UserRole } from "@/modules/user/user.types";
import { UserModel } from "@/modules/user/user.model";
import { WorkspaceModel } from "@/modules/workspace/workspace.model";
import { WorkspaceMemberModel } from "@/modules/workspace/workspaceMember.model";
import { WorkspaceRole, WorkspaceVisibility } from "@/modules/workspace/workspace.types";
import { BoardModel } from "@/modules/board/board.model";
import { BoardVisibility } from "@/modules/board/board.types";
import { CanvasModel } from "@/modules/canvas/canvas.model";
import { ShapeModel } from "@/modules/shape/shape.model";
import { ShapeType } from "@/modules/shape/shape.types";

import {
  ShapeLockedPayload,
  ShapeUnlockedPayload,
  SocketEvents,
  SocketServer,
} from "../index";
import { shapeLockManager } from "../locks/shape-lock.manager";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runSocketLockSyncTests(): Promise<void> {
  console.log("Starting Collaborative Soft-Locking Integration Tests...\n");

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

  // Create users in MongoDB for display names
  await UserModel.create([
    {
      _id: userAId,
      fullName: "Alice Developer",
      email: `alice.${Date.now()}@test.com`,
      password: "password123",
      role: UserRole.USER,
    },
    {
      _id: userBId,
      fullName: "Bob Designer",
      email: `bob.${Date.now()}@test.com`,
      password: "password123",
      role: UserRole.USER,
    },
    {
      _id: userCId,
      fullName: "Charlie Viewer",
      email: `charlie.${Date.now()}@test.com`,
      password: "password123",
      role: UserRole.USER,
    },
  ]);

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
    // 1. Seed Board 1 (Shared between User A and User B)
    const ws1 = await WorkspaceModel.create({
      name: "Lock Sync Workspace 1",
      slug: `lock-sync-ws1-${Date.now()}`,
      ownerId: userAId,
      visibility: WorkspaceVisibility.PRIVATE,
    });
    workspace1Id = ws1._id;

    await WorkspaceMemberModel.create({
      workspaceId: ws1._id,
      userId: userBId,
      role: WorkspaceRole.EDITOR,
      joinedAt: new Date(),
    });

    const b1 = await BoardModel.create({
      workspaceId: ws1._id,
      name: "Lock Sync Board 1",
      createdBy: userAId,
      visibility: BoardVisibility.PRIVATE,
      isArchived: false,
    });
    board1Id = b1._id;

    const c1 = await CanvasModel.create({
      boardId: b1._id,
      name: "Page 1",
      order: 1,
    });
    canvas1Id = c1._id;

    const s1 = await ShapeModel.create({
      canvasId: c1._id,
      type: ShapeType.RECTANGLE,
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      rotation: 0,
      zIndex: 1,
      createdBy: userAId,
      style: {
        fill: "#ff0000",
        stroke: "#000000",
        strokeWidth: 2,
        opacity: 1,
      },
    });
    shape1Id = s1._id;

    const s2 = await ShapeModel.create({
      canvasId: c1._id,
      type: ShapeType.RECTANGLE,
      x: 400,
      y: 100,
      width: 200,
      height: 150,
      rotation: 0,
      zIndex: 2,
      createdBy: userAId,
      style: {
        fill: "#00ff00",
        stroke: "#000000",
        strokeWidth: 2,
        opacity: 1,
      },
    });
    shape2Id = s2._id;

    // 2. Seed Board 2 (Owned by User C)
    const ws2 = await WorkspaceModel.create({
      name: "Lock Sync Workspace 2",
      slug: `lock-sync-ws2-${Date.now()}`,
      ownerId: userCId,
      visibility: WorkspaceVisibility.PRIVATE,
    });
    workspace2Id = ws2._id;

    const b2 = await BoardModel.create({
      workspaceId: ws2._id,
      name: "Lock Sync Board 2",
      createdBy: userCId,
      visibility: BoardVisibility.PRIVATE,
      isArchived: false,
    });
    board2Id = b2._id;

    const c2 = await CanvasModel.create({
      boardId: b2._id,
      name: "Page 1",
      order: 1,
    });
    canvas2Id = c2._id;

    const s3 = await ShapeModel.create({
      canvasId: c2._id,
      type: ShapeType.RECTANGLE,
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: 1,
      createdBy: userCId,
      style: {
        fill: "#0000ff",
        stroke: "#000000",
        strokeWidth: 1,
        opacity: 1,
      },
    });
    shape3Id = s3._id;

    console.log("✓ Seeded workspaces, boards, canvases, shapes, and user profiles in MongoDB.");

    // Connect Client Sockets
    const socketA: ClientSocket = clientIO(serverUrl, {
      auth: { token: tokenA },
      transports: ["websocket"],
      forceNew: true,
    });

    const socketB: ClientSocket = clientIO(serverUrl, {
      auth: { token: tokenB },
      transports: ["websocket"],
      forceNew: true,
    });

    const socketC: ClientSocket = clientIO(serverUrl, {
      auth: { token: tokenC },
      transports: ["websocket"],
      forceNew: true,
    });

    await Promise.all([
      new Promise<void>((resolve) => socketA.on("connect", () => resolve())),
      new Promise<void>((resolve) => socketB.on("connect", () => resolve())),
      new Promise<void>((resolve) => socketC.on("connect", () => resolve())),
    ]);

    // Join boards
    await new Promise<void>((resolve) => {
      socketA.emit(SocketEvents.BOARD_JOIN, { boardId: board1Id!.toString() }, () => resolve());
    });

    await new Promise<void>((resolve) => {
      socketB.emit(SocketEvents.BOARD_JOIN, { boardId: board1Id!.toString() }, () => resolve());
    });

    await new Promise<void>((resolve) => {
      socketC.emit(SocketEvents.BOARD_JOIN, { boardId: board2Id!.toString() }, () => resolve());
    });

    // -------------------------------------------------------------
    // Test 1: User A acquires lock on Shape 1 -> Ack received, User B receives shape:locked broadcast
    // -------------------------------------------------------------
    console.log("\nTest 1: User A locks Shape 1 -> User B receives shape:locked broadcast, User A excluded...");
    let userAReceivedBroadcast = false;
    socketA.on(SocketEvents.SHAPE_LOCKED, () => {
      userAReceivedBroadcast = true;
    });

    const lockPromiseUserB = new Promise<ShapeLockedPayload>((resolve) => {
      socketB.once(SocketEvents.SHAPE_LOCKED, (payload: ShapeLockedPayload) => {
        resolve(payload);
      });
    });

    const lockAck = await new Promise<any>((resolve) => {
      socketA.emit(
        SocketEvents.SHAPE_LOCK,
        {
          boardId: board1Id!.toString(),
          shapeId: shape1Id!.toString(),
        },
        (res: any) => resolve(res)
      );
    });

    assert(lockAck.success === true, "Lock acquisition ack must succeed.");
    assert(lockAck.data.shapeId === shape1Id!.toString(), "Ack must contain correct shapeId.");
    assert(lockAck.data.userId === userAId.toString(), "Ack must contain userA userId.");
    assert(lockAck.data.fullName === "Alice Developer", "Ack must contain userA fullName.");
    assert(typeof lockAck.data.color === "string", "Ack must contain color.");

    const broadcastToB = await lockPromiseUserB;
    assert(broadcastToB.shapeId === shape1Id!.toString(), "User B must receive broadcast for Shape 1.");
    assert(broadcastToB.userId === userAId.toString(), "Broadcast to B must have userA userId.");
    assert(broadcastToB.fullName === "Alice Developer", "Broadcast to B must have Alice's fullName.");
    assert(!userAReceivedBroadcast, "User A (sender) must NOT receive own lock broadcast.");
    console.log("✓ Soft-lock acquired, acked, and broadcast to collaborators with sender excluded.");

    // -------------------------------------------------------------
    // Test 2: Concurrency collision -> User B tries to lock Shape 1 while User A holds lock
    // -------------------------------------------------------------
    console.log("\nTest 2: User B attempts to lock Shape 1 -> Rejection with structured SHAPE_LOCKED...");
    const collisionAck = await new Promise<any>((resolve) => {
      socketB.emit(
        SocketEvents.SHAPE_LOCK,
        {
          boardId: board1Id!.toString(),
          shapeId: shape1Id!.toString(),
        },
        (res: any) => resolve(res)
      );
    });

    assert(collisionAck.success === false, "Lock request by User B must fail while User A holds lock.");
    assert(collisionAck.error?.code === "SHAPE_LOCKED", "Error code must be SHAPE_LOCKED.");
    console.log("✓ Concurrent lock conflict rejected securely with structured SHAPE_LOCKED code.");

    // -------------------------------------------------------------
    // Test 3: User A refreshes lock -> Refresh succeeds
    // -------------------------------------------------------------
    console.log("\nTest 3: User A refreshes lock on Shape 1...");
    const refreshAckA = await new Promise<any>((resolve) => {
      socketA.emit(
        SocketEvents.SHAPE_LOCK_REFRESH,
        {
          boardId: board1Id!.toString(),
          shapeId: shape1Id!.toString(),
        },
        (res: any) => resolve(res)
      );
    });
    assert(refreshAckA.success === true, "Lock owner must be able to refresh active lock.");

    // User B cannot refresh User A's lock
    const refreshAckB = await new Promise<any>((resolve) => {
      socketB.emit(
        SocketEvents.SHAPE_LOCK_REFRESH,
        {
          boardId: board1Id!.toString(),
          shapeId: shape1Id!.toString(),
        },
        (res: any) => resolve(res)
      );
    });
    assert(refreshAckB.success === false, "Non-owner must NOT be able to refresh lock.");
    console.log("✓ Lock refresh authorized for owner and rejected for non-owner.");

    // -------------------------------------------------------------
    // Test 4: User A unlocks Shape 1 -> User B receives shape:unlocked
    // -------------------------------------------------------------
    console.log("\nTest 4: User A unlocks Shape 1 -> User B receives shape:unlocked...");
    const unlockPromiseUserB = new Promise<ShapeUnlockedPayload>((resolve) => {
      socketB.once(SocketEvents.SHAPE_UNLOCKED, (payload: ShapeUnlockedPayload) => {
        resolve(payload);
      });
    });

    const unlockAck = await new Promise<any>((resolve) => {
      socketA.emit(
        SocketEvents.SHAPE_UNLOCK,
        {
          boardId: board1Id!.toString(),
          shapeId: shape1Id!.toString(),
        },
        (res: any) => resolve(res)
      );
    });

    assert(unlockAck.success === true, "Unlock ack must succeed.");

    const unlockBroadcastToB = await unlockPromiseUserB;
    assert(unlockBroadcastToB.shapeId === shape1Id!.toString(), "User B must receive unlock event for Shape 1.");
    console.log("✓ Shape unlocked successfully and broadcast to peer collaborators.");

    // -------------------------------------------------------------
    // Test 5: User B can now acquire lock on Shape 1 after release
    // -------------------------------------------------------------
    console.log("\nTest 5: User B acquires lock on Shape 1 after release...");
    const lockBAck = await new Promise<any>((resolve) => {
      socketB.emit(
        SocketEvents.SHAPE_LOCK,
        {
          boardId: board1Id!.toString(),
          shapeId: shape1Id!.toString(),
        },
        (res: any) => resolve(res)
      );
    });
    assert(lockBAck.success === true, "User B must be able to acquire newly freed lock.");
    assert(lockBAck.data.userId === userBId.toString(), "Lock must now belong to User B.");
    console.log("✓ User B successfully acquired lock on freed shape.");

    // -------------------------------------------------------------
    // Test 6: Cross-board shape lock rejection (Shape 3 belongs to Board 2)
    // -------------------------------------------------------------
    console.log("\nTest 6: Rejecting cross-board shape lock (Shape 3 belongs to Board 2)...");
    const crossBoardAck = await new Promise<any>((resolve) => {
      socketA.emit(
        SocketEvents.SHAPE_LOCK,
        {
          boardId: board1Id!.toString(),
          shapeId: shape3Id!.toString(), // Shape 3 is in Board 2
        },
        (res: any) => resolve(res)
      );
    });

    assert(crossBoardAck.success === false, "Cross-board lock must be rejected.");
    assert(crossBoardAck.error?.code === "NOT_FOUND", "Error code must be NOT_FOUND.");
    console.log("✓ Cross-board foreign shape lock rejected securely.");

    // -------------------------------------------------------------
    // Test 7: Unjoined socket cannot acquire lock
    // -------------------------------------------------------------
    console.log("\nTest 7: Rejecting lock request from socket not joined to board room...");
    const unjoinedSocket = clientIO(serverUrl, {
      auth: { token: tokenA },
      transports: ["websocket"],
      forceNew: true,
    });
    await new Promise<void>((resolve) => unjoinedSocket.on("connect", () => resolve()));

    const unjoinedAck = await new Promise<any>((resolve) => {
      unjoinedSocket.emit(
        SocketEvents.SHAPE_LOCK,
        {
          boardId: board1Id!.toString(),
          shapeId: shape2Id!.toString(),
        },
        (res: any) => resolve(res)
      );
    });

    assert(unjoinedAck.success === false, "Unjoined socket must be rejected.");
    assert(unjoinedAck.error?.code === "FORBIDDEN", "Error code must be FORBIDDEN.");
    unjoinedSocket.disconnect();
    console.log("✓ Unjoined socket lock request dropped securely.");

    // -------------------------------------------------------------
    // Test 8: Disconnect releases all locks held by disconnected socket
    // -------------------------------------------------------------
    console.log("\nTest 8: User B disconnects -> User A receives shape:unlocked for Shape 1...");
    const disconnectUnlockPromise = new Promise<ShapeUnlockedPayload>((resolve) => {
      socketA.once(SocketEvents.SHAPE_UNLOCKED, (payload: ShapeUnlockedPayload) => {
        resolve(payload);
      });
    });

    socketB.disconnect();

    const disconnectUnlock = await disconnectUnlockPromise;
    assert(disconnectUnlock.shapeId === shape1Id!.toString(), "Disconnect must release Shape 1 lock.");
    console.log("✓ Disconnecting socket automatically released held locks and notified collaborators.");

    // Close sockets
    socketA.disconnect();
    socketC.disconnect();
  } finally {
    // Clean up MongoDB test data
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
      await WorkspaceModel.findByIdAndDelete(workspace2Id);
    }
    await UserModel.deleteMany({ _id: { $in: [userAId, userBId, userCId] } });

    await socketServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await mongoose.disconnect();
  }

  console.log("\nAll Collaborative Soft-Locking Integration Tests Passed Successfully!");
}

runSocketLockSyncTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
