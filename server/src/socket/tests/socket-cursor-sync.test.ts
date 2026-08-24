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

import {
  CursorMovedPayload,
  SocketEvents,
  SocketServer,
} from "../index";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runSocketCursorSyncTests(): Promise<void> {
  console.log("Starting Live Collaborator Cursor Synchronization Integration Tests...\n");

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

  let workspace2Id: Types.ObjectId | null = null;
  let board2Id: Types.ObjectId | null = null;
  let canvas2Id: Types.ObjectId | null = null;

  try {
    // 1. Seed Board 1 (Shared between User A and User B)
    const ws1 = await WorkspaceModel.create({
      name: "Cursor Workspace 1",
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
      name: "Cursor Board 1",
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

    // 2. Seed Board 2 (Owned exclusively by User C)
    const ws2 = await WorkspaceModel.create({
      name: "Cursor Workspace 2",
      ownerId: userCId,
      visibility: WorkspaceVisibility.PRIVATE,
    });
    workspace2Id = ws2._id as Types.ObjectId;

    const b2 = await BoardModel.create({
      workspaceId: workspace2Id,
      name: "Cursor Board 2",
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

    console.log("✓ Seeded workspaces, boards, and canvases in MongoDB.");

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

    // Test 1: User A moves cursor -> User B receives cursor:moved, User A excluded
    console.log("\nTest 1: User A moves cursor -> User B receives cursor:moved, sender excluded...");
    let bReceivedCursor: CursorMovedPayload | null = null;
    let aReceivedCursor: CursorMovedPayload | null = null;

    clientB.on(SocketEvents.CURSOR_MOVED, (payload: CursorMovedPayload) => {
      bReceivedCursor = payload;
    });

    clientA.on(SocketEvents.CURSOR_MOVED, (payload: CursorMovedPayload) => {
      aReceivedCursor = payload;
    });

    clientA.emit(SocketEvents.CURSOR_MOVE, {
      boardId: board1Id!.toString(),
      x: 150.5,
      y: 300.25,
    });

    await new Promise((r) => setTimeout(r, 100));

    assert(bReceivedCursor !== null, "User B must receive cursor:moved event");
    assert(
      (bReceivedCursor as any).userId === userAId.toString(),
      "Server-derived userId must match User A"
    );
    assert(
      (bReceivedCursor as any).boardId === board1Id!.toString(),
      "boardId must match Board 1"
    );
    assert((bReceivedCursor as any).x === 150.5, "Cursor x coordinate must match");
    assert((bReceivedCursor as any).y === 300.25, "Cursor y coordinate must match");

    assert(
      aReceivedCursor === null,
      "User A (sender) must NOT receive their own cursor:moved event"
    );
    console.log("✓ Live cursor movement delivered to room collaborators with sender excluded.");

    // Test 2: User identity is server-derived, client cannot spoof another userId
    console.log("\nTest 2: Verifying client cannot spoof userId in cursor payload...");
    bReceivedCursor = null;

    // Even if client passes spoofed userId in payload, server derives it strictly from socket.data.user
    (clientA as any).emit(SocketEvents.CURSOR_MOVE, {
      boardId: board1Id!.toString(),
      x: 200,
      y: 400,
      userId: "spoofed-user-id",
    });

    await new Promise((r) => setTimeout(r, 100));

    assert(bReceivedCursor !== null, "User B received cursor update");
    assert(
      (bReceivedCursor as any).userId === userAId.toString(),
      "userId was verified from socket session, spoofed payload ignored"
    );
    console.log("✓ Zero client trust: userId strictly derived from authenticated JWT session.");

    // Test 3: Board Room Isolation: Board 1 cursor events NEVER reach Board 2
    console.log("\nTest 3: Board room isolation (Board 1 cursor never reaches Board 2 client)...");
    let cReceivedCursor: CursorMovedPayload | null = null;
    clientC.on(SocketEvents.CURSOR_MOVED, (payload: CursorMovedPayload) => {
      cReceivedCursor = payload;
    });

    clientA.emit(SocketEvents.CURSOR_MOVE, {
      boardId: board1Id!.toString(),
      x: 500,
      y: 600,
    });

    await new Promise((r) => setTimeout(r, 100));

    assert(
      cReceivedCursor === null,
      "User C on Board 2 must NOT receive cursor events from Board 1"
    );
    console.log("✓ Board room isolation verified: no cross-board cursor leakage.");

    // Test 4: Socket not joined to board room cannot emit cursor events
    console.log("\nTest 4: Rejecting cursor movement from socket not joined to board room...");
    const unjoinedClient = await createAuthClient(tokenA);
    bReceivedCursor = null;

    unjoinedClient.emit(SocketEvents.CURSOR_MOVE, {
      boardId: board1Id!.toString(),
      x: 777,
      y: 888,
    });

    await new Promise((r) => setTimeout(r, 100));

    assert(
      bReceivedCursor === null,
      "Unjoined socket cursor movement must be dropped by server"
    );
    unjoinedClient.disconnect();
    console.log("✓ Unjoined socket cursor movements dropped securely.");

    // Test 5: Invalid boardId format / malformed payload handling
    console.log("\nTest 5: Rejecting malformed and invalid payloads without crashing server...");
    bReceivedCursor = null;

    clientA.emit(SocketEvents.CURSOR_MOVE, {
      boardId: "invalid-id",
      x: 100,
      y: 100,
    });

    clientA.emit(SocketEvents.CURSOR_MOVE, {
      boardId: board1Id!.toString(),
      x: NaN,
      y: 100,
    });

    clientA.emit(SocketEvents.CURSOR_MOVE, {
      boardId: board1Id!.toString(),
      x: 100,
      y: Infinity,
    });

    clientA.emit(SocketEvents.CURSOR_MOVE, null as any);

    await new Promise((r) => setTimeout(r, 100));

    assert(
      bReceivedCursor === null,
      "Malformed cursor payloads must be dropped without crashing server"
    );
    console.log("✓ Malformed cursor payloads dropped cleanly.");

    // Disconnect clients
    clientA.disconnect();
    clientB.disconnect();
    clientC.disconnect();

  } finally {
    // Cleanup DB
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

  console.log("\nAll Live Collaborator Cursor Synchronization Integration Tests Passed Successfully!\n");
}

runSocketCursorSyncTests().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
