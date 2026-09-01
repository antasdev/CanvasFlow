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
import { CanvasModel } from "@/modules/canvas/canvas.model";
import { ShapeModel } from "@/modules/shape/shape.model";
import { ShapeType } from "@/modules/shape/shape.types";
import { SocketEvents } from "../socket.events";
import { SocketServer } from "../socket.server";
import {
  CreateShapePayload,
  UpdateShapePayload,
  DeleteShapePayload,
  ShapeResponseDto,
  SocketAck,
  ShapeLockedPayload,
  ShapeUnlockedPayload,
} from "../socket.types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runTextAndStickyShapeTests(): Promise<void> {
  console.log("Starting Real-Time Text & Sticky Note Synchronization Tests...");

  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB for integration testing.");

  // Clear test collections
  await Promise.all([
    UserModel.deleteMany({ email: { $regex: /@slice7-test\.com$/ } }),
    WorkspaceModel.deleteMany({ name: { $regex: /Slice 7/ } }),
    WorkspaceMemberModel.deleteMany({}),
    BoardModel.deleteMany({ title: { $regex: /Slice 7/ } }),
    CanvasModel.deleteMany({ name: { $regex: /Page/ } }),
    ShapeModel.deleteMany({}),
  ]);

  // Seed Users
  const user1 = await UserModel.create({
    email: "user1@slice7-test.com",
    password: "Password123!",
    fullName: "Alice Editor",
  });

  const user2 = await UserModel.create({
    email: "user2@slice7-test.com",
    password: "Password123!",
    fullName: "Bob Collaborator",
  });

  const user3 = await UserModel.create({
    email: "user3@slice7-test.com",
    password: "Password123!",
    fullName: "Charlie Outside",
  });

  const token1 = generateAccessToken({
    userId: (user1._id as Types.ObjectId).toString(),
    role: UserRole.USER,
  });

  const token2 = generateAccessToken({
    userId: (user2._id as Types.ObjectId).toString(),
    role: UserRole.USER,
  });

  const token3 = generateAccessToken({
    userId: (user3._id as Types.ObjectId).toString(),
    role: UserRole.USER,
  });

  // Seed Workspaces & Boards
  const ws1 = await WorkspaceModel.create({
    name: "Slice 7 Workspace 1",
    ownerId: user1._id,
    visibility: "PUBLIC",
  });

  await WorkspaceMemberModel.create([
    {
      workspaceId: ws1._id,
      userId: user2._id,
      role: WorkspaceRole.EDITOR,
    },
    {
      workspaceId: ws1._id,
      userId: user3._id,
      role: WorkspaceRole.EDITOR,
    },
  ]);

  const board1 = await BoardModel.create({
    workspaceId: ws1._id,
    name: "Slice 7 Board 1",
    createdBy: user1._id,
    visibility: "PUBLIC",
  });

  const canvas1 = await CanvasModel.create({
    boardId: board1._id,
    name: "Page 1",
    order: 1,
  });

  const board2 = await BoardModel.create({
    workspaceId: ws1._id,
    name: "Slice 7 Board 2",
    createdBy: user1._id,
    visibility: "PUBLIC",
  });

  const canvas2 = await CanvasModel.create({
    boardId: board2._id,
    name: "Page 1",
    order: 1,
  });

  const board1Id = board1._id.toString();
  const board2Id = board2._id.toString();
  const canvas1Id = canvas1._id.toString();
  const canvas2Id = canvas2._id.toString();

  // Spin up SocketServer
  const httpServer = createServer();
  const socketServer = new SocketServer(httpServer);

  const port = 4057;
  await new Promise<void>((resolve) => httpServer.listen(port, resolve));
  const serverUrl = `http://localhost:${port}`;

  // Helper client creator
  const createClient = (token: string): ClientSocket => {
    return clientIO(serverUrl, {
      auth: { token: `Bearer ${token}` },
      transports: ["websocket"],
      forceNew: true,
    });
  };

  const client1 = createClient(token1);
  const client2 = createClient(token2);
  const client3 = createClient(token3);

  await Promise.all([
    new Promise<void>((resolve) => client1.on("connect", resolve)),
    new Promise<void>((resolve) => client2.on("connect", resolve)),
    new Promise<void>((resolve) => client3.on("connect", resolve)),
  ]);

  // Join clients to board rooms
  // Client 1 & 2 join Board 1
  await new Promise<void>((resolve) => {
    client1.emit(SocketEvents.BOARD_JOIN, { boardId: board1Id }, () => resolve());
  });
  await new Promise<void>((resolve) => {
    client2.emit(SocketEvents.BOARD_JOIN, { boardId: board1Id }, () => resolve());
  });
  // Client 3 joins Board 2 (Isolation test)
  await new Promise<void>((resolve) => {
    client3.emit(SocketEvents.BOARD_JOIN, { boardId: board2Id }, () => resolve());
  });

  let textShapeId = "";
  let stickyShapeId = "";

  // ----------------------------------------------------
  // TEST 1: Text Shape Creation & Broadcast
  // ----------------------------------------------------
  console.log("\nTest 1: User 1 creates Text Shape -> Persisted -> User 2 receives shape:created...");

  let user2ReceivedCreated: any = null;
  let user3ReceivedCreated: any = null;

  client2.on(SocketEvents.SHAPE_CREATED, (payload: any) => {
    user2ReceivedCreated = "shape" in payload ? payload.shape : payload;
  });
  client3.on(SocketEvents.SHAPE_CREATED, (payload: any) => {
    user3ReceivedCreated = "shape" in payload ? payload.shape : payload;
  });

  const createTextPayload: CreateShapePayload = {
    canvasId: canvas1Id,
    type: "text",
    x: 150,
    y: 250,
    width: 200,
    height: 60,
    rotation: 0,
    style: {
      text: "Hello World Text",
      fontSize: 24,
      fontFamily: "Inter",
      fontWeight: "bold",
      fontStyle: "normal",
      textAlign: "left",
      fill: "#1f2937",
      opacity: 1,
    },
  };

  const createTextAck = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
    client1.emit(SocketEvents.SHAPE_CREATE, createTextPayload, resolve);
  });

  assert(createTextAck.success === true, "Text create ack must be successful");
  assert(createTextAck.data !== undefined, "Text create ack must contain data");
  assert(createTextAck.data!.type === "text", "Ack DTO type must be 'text'");
  if (createTextAck.data!.type === "text") {
    assert(createTextAck.data!.text === "Hello World Text", "Text content must match");
    assert(createTextAck.data!.style.fontSize === 24, "Font size must match");
    assert(createTextAck.data!.style.fontWeight === "bold", "Font weight must match");
  }

  textShapeId = createTextAck.data!.id;

  // Verify MongoDB
  const textDb = await ShapeModel.findById(new Types.ObjectId(textShapeId));
  assert(textDb !== null, "Text shape must exist in MongoDB");
  assert(textDb!.type === ShapeType.TEXT, "Persisted type must be TEXT");
  assert((textDb!.text ?? (textDb!.style as any)?.text) === "Hello World Text", "Persisted text must match");

  await new Promise((r) => setTimeout(r, 100));

  assert(user2ReceivedCreated !== null, "User 2 in Board 1 must receive shape:created");
  assert((user2ReceivedCreated as any).id === textShapeId, "Broadcasted ID must match");
  assert((user2ReceivedCreated as any).type === "text", "Broadcasted type must be text");
  assert(user3ReceivedCreated === null, "User 3 in Board 2 must NOT receive broadcast (room isolation)");
  console.log("✓ Text shape created, persisted, and broadcast with room isolation.");

  // ----------------------------------------------------
  // TEST 2: Sticky Note Creation & Broadcast
  // ----------------------------------------------------
  console.log("\nTest 2: User 1 creates Sticky Note -> Persisted -> User 2 receives shape:created...");

  user2ReceivedCreated = null;

  const createStickyPayload: CreateShapePayload = {
    canvasId: canvas1Id,
    type: "sticky_note",
    x: 400,
    y: 300,
    width: 200,
    height: 200,
    rotation: 0,
    text: "Remember to test Slice 7",
    style: {
      text: "Remember to test Slice 7",
      fontSize: 18,
      backgroundColor: "#fef08a",
      textColor: "#1f2937",
      opacity: 1,
    },
  };

  const createStickyAck = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
    client1.emit(SocketEvents.SHAPE_CREATE, createStickyPayload, resolve);
  });

  assert(createStickyAck.success === true, "Sticky note create ack must be successful");
  assert(createStickyAck.data !== undefined, "Sticky note create ack must contain data");
  assert(createStickyAck.data!.type === "sticky_note", "Ack DTO type must be 'sticky_note'");
  if (createStickyAck.data!.type === "sticky_note") {
    assert(createStickyAck.data!.style.text === "Remember to test Slice 7", "Sticky text must match");
    assert(createStickyAck.data!.style.backgroundColor === "#fef08a", "Sticky background color must match");
    assert(createStickyAck.data!.style.textColor === "#1f2937", "Sticky text color must match");
  }

  stickyShapeId = createStickyAck.data!.id;

  const stickyDb = await ShapeModel.findById(new Types.ObjectId(stickyShapeId));
  assert(stickyDb !== null, "Sticky note shape must exist in MongoDB");
  assert(stickyDb!.type === ShapeType.STICKY_NOTE, "Persisted type must be STICKY_NOTE");

  await new Promise((r) => setTimeout(r, 100));
  assert(user2ReceivedCreated !== null, "User 2 must receive shape:created for sticky note");
  assert((user2ReceivedCreated as any).type === "sticky_note", "Broadcasted type must be sticky_note");
  console.log("✓ Sticky note created, persisted, and broadcast.");

  // ----------------------------------------------------
  // TEST 3: Validation Constraints (Text Length & Font Size)
  // ----------------------------------------------------
  console.log("\nTest 3: Rejecting invalid text length (>10000 chars) and invalid font sizes...");

  const oversizedTextPayload: CreateShapePayload = {
    canvasId: canvas1Id,
    type: "text",
    x: 100,
    y: 100,
    width: 200,
    height: 50,
    text: "A".repeat(10001),
  };

  const oversizedAck = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
    client1.emit(SocketEvents.SHAPE_CREATE, oversizedTextPayload, resolve);
  });

  assert(oversizedAck.success === false, "Oversized text must be rejected");
  assert(
    (oversizedAck.error as any).code === "BAD_REQUEST",
    "Oversized text error code must be BAD_REQUEST"
  );

  const invalidFontSizePayload: CreateShapePayload = {
    canvasId: canvas1Id,
    type: "text",
    x: 100,
    y: 100,
    width: 200,
    height: 50,
    style: {
      fontSize: 500, // max is 200
    },
  };

  const fontSizeAck = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
    client1.emit(SocketEvents.SHAPE_CREATE, invalidFontSizePayload, resolve);
  });

  assert(fontSizeAck.success === false, "Font size > 200 must be rejected");
  assert(
    (fontSizeAck.error as any).code === "BAD_REQUEST",
    "Invalid font size error code must be BAD_REQUEST"
  );
  console.log("✓ Payload bounds (text length, font size) rejected with BAD_REQUEST.");

  // ----------------------------------------------------
  // TEST 4: Soft-Lock Acquisition Before Text Editing
  // ----------------------------------------------------
  console.log("\nTest 4: User 1 acquires soft-lock on Text Shape -> User 2 receives shape:locked...");

  let user2ReceivedLocked: ShapeLockedPayload | null = null;
  client2.on(SocketEvents.SHAPE_LOCKED, (payload: ShapeLockedPayload) => {
    user2ReceivedLocked = payload;
  });

  const lockAck = await new Promise<SocketAck<ShapeLockedPayload>>((resolve) => {
    client1.emit(
      SocketEvents.SHAPE_LOCK,
      { boardId: board1Id, shapeId: textShapeId },
      resolve
    );
  });

  assert(lockAck.success === true, "Lock acquisition must succeed");
  assert(lockAck.data!.shapeId === textShapeId, "Locked shapeId must match");
  assert(lockAck.data!.fullName === "Alice Editor", "Locked user fullName must match");

  await new Promise((r) => setTimeout(r, 100));

  assert(user2ReceivedLocked !== null, "User 2 must receive shape:locked broadcast");
  assert((user2ReceivedLocked as any).shapeId === textShapeId, "Broadcasted lock shapeId must match");
  console.log("✓ Soft-lock acquired and broadcast before editing.");

  // ----------------------------------------------------
  // TEST 5: Concurrent Edit Conflict Rejection (SHAPE_LOCKED)
  // ----------------------------------------------------
  console.log("\nTest 5: User 2 attempts to edit same Text Shape -> Rejection with SHAPE_LOCKED...");

  const conflictAck = await new Promise<SocketAck<ShapeLockedPayload>>((resolve) => {
    client2.emit(
      SocketEvents.SHAPE_LOCK,
      { boardId: board1Id, shapeId: textShapeId },
      resolve
    );
  });

  assert(conflictAck.success === false, "Concurrent lock acquisition must fail");
  assert(
    (conflictAck.error as any).code === "SHAPE_LOCKED",
    "Error code must be SHAPE_LOCKED"
  );
  console.log("✓ Concurrent editing conflict rejected with structured SHAPE_LOCKED.");

  // ----------------------------------------------------
  // TEST 6: Lock Refresh Heartbeat
  // ----------------------------------------------------
  console.log("\nTest 6: User 1 refreshes lock heartbeat during editing...");

  const refreshAck = await new Promise<SocketAck>((resolve) => {
    client1.emit(
      SocketEvents.SHAPE_LOCK_REFRESH,
      { boardId: board1Id, shapeId: textShapeId },
      resolve
    );
  });

  assert(refreshAck.success === true, "Lock refresh must succeed for lock owner");
  console.log("✓ Lock heartbeat refresh succeeded.");

  // ----------------------------------------------------
  // TEST 7: Text Shape Commit & Broadcast via shape:update
  // ----------------------------------------------------
  console.log("\nTest 7: User 1 commits text update -> Persisted in MongoDB -> User 2 receives shape:updated...");

  let user2ReceivedUpdated: any = null;
  client2.on(SocketEvents.SHAPE_UPDATED, (payload: any) => {
    user2ReceivedUpdated = "shape" in payload ? payload.shape : payload;
  });

  const updateTextPayload: UpdateShapePayload = {
    shapeId: textShapeId,
    data: {
      text: "Updated Canonical Content",
      style: {
        fontSize: 28,
        fontWeight: "600",
      },
    },
  };

  const updateTextAck = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
    client1.emit(SocketEvents.SHAPE_UPDATE, updateTextPayload, resolve);
  });

  assert(updateTextAck.success === true, "Update ack must succeed");
  assert(updateTextAck.data!.type === "text", "Updated type must be text");
  if (updateTextAck.data!.type === "text") {
    assert(
      updateTextAck.data!.text === "Updated Canonical Content",
      "Updated text must match"
    );
    assert(updateTextAck.data!.style.fontSize === 28, "Updated fontSize must match");
  }

  // Verify MongoDB
  const textUpdatedDb = await ShapeModel.findById(new Types.ObjectId(textShapeId));
  assert((textUpdatedDb!.text ?? (textUpdatedDb!.style as any)?.text) === "Updated Canonical Content", "DB text must be updated");

  await new Promise((r) => setTimeout(r, 100));

  assert(user2ReceivedUpdated !== null, "User 2 must receive shape:updated");
  assert(
    (user2ReceivedUpdated as any).text === "Updated Canonical Content" || (user2ReceivedUpdated as any).style?.text === "Updated Canonical Content",
    "User 2 broadcast must contain updated text"
  );
  console.log("✓ Committed text update persisted in MongoDB and broadcast.");

  // ----------------------------------------------------
  // TEST 8: Lock Release After Edit Commit
  // ----------------------------------------------------
  console.log("\nTest 8: User 1 unlocks Text Shape -> User 2 receives shape:unlocked...");

  let user2ReceivedUnlocked: ShapeUnlockedPayload | null = null;
  client2.on(SocketEvents.SHAPE_UNLOCKED, (payload: ShapeUnlockedPayload) => {
    user2ReceivedUnlocked = payload;
  });

  const unlockAck = await new Promise<SocketAck>((resolve) => {
    client1.emit(
      SocketEvents.SHAPE_UNLOCK,
      { boardId: board1Id, shapeId: textShapeId },
      resolve
    );
  });

  assert(unlockAck.success === true, "Unlock ack must succeed");

  await new Promise((r) => setTimeout(r, 100));

  assert(user2ReceivedUnlocked !== null, "User 2 must receive shape:unlocked");
  assert((user2ReceivedUnlocked as any).shapeId === textShapeId, "Unlocked shapeId must match");
  console.log("✓ Shape unlocked and broadcast to collaborators.");

  // ----------------------------------------------------
  // TEST 9: Sticky Note Update & Color Change
  // ----------------------------------------------------
  console.log("\nTest 9: User 2 updates Sticky Note content and background color...");

  user2ReceivedUpdated = null;
  let user1ReceivedUpdated: any = null;
  client1.on(SocketEvents.SHAPE_UPDATED, (payload: any) => {
    user1ReceivedUpdated = "shape" in payload ? payload.shape : payload;
  });

  const updateStickyPayload: UpdateShapePayload = {
    shapeId: stickyShapeId,
    data: {
      text: "Updated Note by Bob",
      style: {
        text: "Updated Note by Bob",
        backgroundColor: "#bbf7d0", // Light green
        textColor: "#065f46",
      },
    },
  };

  const updateStickyAck = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
    client2.emit(SocketEvents.SHAPE_UPDATE, updateStickyPayload, resolve);
  });

  assert(updateStickyAck.success === true, "Sticky note update must succeed");
  if (updateStickyAck.data!.type === "sticky_note") {
    assert(updateStickyAck.data!.style.text === "Updated Note by Bob", "Sticky text must match");
    assert(updateStickyAck.data!.style.backgroundColor === "#bbf7d0", "Sticky background color must match");
  }

  await new Promise((r) => setTimeout(r, 100));

  assert(user1ReceivedUpdated !== null, "User 1 must receive sticky shape:updated");
  assert((user1ReceivedUpdated as any).style.backgroundColor === "#bbf7d0", "User 1 must see new color");
  console.log("✓ Sticky note content and background color updated and synchronized.");

  // ----------------------------------------------------
  // TEST 10: Shape Deletion for Text & Sticky Notes
  // ----------------------------------------------------
  console.log("\nTest 10: Deleting Text Shape and Sticky Note -> MongoDB removed -> shape:deleted broadcast...");

  let user2ReceivedDeleted: any = null;
  client2.on(SocketEvents.SHAPE_DELETED, (payload: any) => {
    user2ReceivedDeleted = payload;
  });

  const deleteAck = await new Promise<SocketAck>((resolve) => {
    client1.emit(
      SocketEvents.SHAPE_DELETE,
      { shapeId: textShapeId },
      resolve
    );
  });

  assert(deleteAck.success === true, "Delete text shape must succeed");

  const deletedTextDb = await ShapeModel.findById(new Types.ObjectId(textShapeId));
  assert(deletedTextDb === null, "Text shape must be removed from MongoDB");

  await new Promise((r) => setTimeout(r, 100));
  assert(user2ReceivedDeleted !== null, "User 2 must receive shape:deleted for text shape");
  const resolvedShapeId =
    "shapeId" in user2ReceivedDeleted
      ? user2ReceivedDeleted.shapeId
      : user2ReceivedDeleted;
  assert(resolvedShapeId === textShapeId, "Deleted shapeId must match");

  console.log("✓ Text shape deleted, removed from DB, and broadcast.");

  // Cleanup connections and server
  client1.disconnect();
  client2.disconnect();
  client3.disconnect();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  await mongoose.disconnect();

  console.log("\nAll Real-Time Text & Sticky Note Synchronization Tests Passed Successfully!\n");
}

runTextAndStickyShapeTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
