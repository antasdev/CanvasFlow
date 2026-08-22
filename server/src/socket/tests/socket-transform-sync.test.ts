import { createServer } from "http";
import mongoose, { Types } from "mongoose";
import { io as ioc, type Socket as ClientSocket } from "socket.io-client";
import { generateAccessToken } from "@/modules/auth/auth.tokens";
import env from "@/config/env";
import { BoardModel } from "@/modules/board/board.model";
import { CanvasModel } from "@/modules/canvas/canvas.model";
import { ShapeModel } from "@/modules/shape/shape.model";
import { ShapeType } from "@/modules/shape/shape.types";
import { UserModel } from "@/modules/user/user.model";
import { UserRole } from "@/modules/user/user.types";
import { WorkspaceModel } from "@/modules/workspace/workspace.model";
import { shapeLockManager } from "../locks/shape-lock.manager";
import { SocketEvents } from "../socket.events";
import { SocketServer } from "../socket.server";
import {
  ClientToServerEvents,
  ServerToClientEvents,
  ShapeTransformEndPayload,
  ShapeTransformingPayload,
} from "../socket.types";

type TestClientSocket = ClientSocket<
  ServerToClientEvents,
  ClientToServerEvents
>;

async function runTests(): Promise<void> {
  console.log("Starting Real-Time Shape Transform Synchronization Tests...");

  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB for integration testing.");

  // Clean test collections
  await UserModel.deleteMany({ email: /@slice8-test\.com$/ });
  await WorkspaceModel.deleteMany({ name: /Slice 8 Workspace/ });
  await BoardModel.deleteMany({ name: /Slice 8 Board/ });
  await CanvasModel.deleteMany({});
  await ShapeModel.deleteMany({});
  shapeLockManager.clear();

  // Create HTTP & SocketServer
  const httpServer = createServer();
  const socketServer = new SocketServer(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve());
  });

  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const serverUrl = `http://localhost:${port}`;

  // Seed Users
  const user1 = await UserModel.create({
    email: "user1@slice8-test.com",
    password: "Password123!",
    fullName: "Alice Transformer",
  });

  const user2 = await UserModel.create({
    email: "user2@slice8-test.com",
    password: "Password123!",
    fullName: "Bob Collaborator",
  });

  const user3 = await UserModel.create({
    email: "user3@slice8-test.com",
    password: "Password123!",
    fullName: "Charlie Outsider",
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
    name: "Slice 8 Workspace 1",
    ownerId: user1._id,
    visibility: "PUBLIC",
  });

  const ws2 = await WorkspaceModel.create({
    name: "Slice 8 Workspace 2",
    ownerId: user3._id,
    visibility: "PUBLIC",
  });

  const board1 = await BoardModel.create({
    workspaceId: ws1._id,
    name: "Slice 8 Board 1",
    createdBy: user1._id,
    visibility: "PUBLIC",
  });

  const board2 = await BoardModel.create({
    workspaceId: ws2._id,
    name: "Slice 8 Board 2",
    createdBy: user3._id,
    visibility: "PUBLIC",
  });

  const canvas1 = await CanvasModel.create({
    boardId: board1._id,
    name: "Canvas 1",
    order: 1,
  });

  const shape1 = await ShapeModel.create({
    canvasId: canvas1._id,
    type: ShapeType.RECTANGLE,
    x: 100,
    y: 100,
    width: 200,
    height: 150,
    rotation: 0,
    zIndex: 1,
    style: {
      fill: "#ffffff",
      stroke: "#000000",
      strokeWidth: 2,
      opacity: 1,
    },
    createdBy: user1._id,
  });

  // Helper for connecting test clients
  const createClient = (token: string): TestClientSocket => {
    return ioc(serverUrl, {
      auth: { token: `Bearer ${token}` },
      transports: ["websocket"],
      forceNew: true,
    }) as TestClientSocket;
  };

  const client1 = createClient(token1);
  const client2 = createClient(token2);
  const client3 = createClient(token3);

  await Promise.all([
    new Promise<void>((resolve) => client1.on("connect", () => resolve())),
    new Promise<void>((resolve) => client2.on("connect", () => resolve())),
    new Promise<void>((resolve) => client3.on("connect", () => resolve())),
  ]);

  // Join board rooms
  const boardId1 = board1._id.toString();
  const boardId2 = board2._id.toString();
  const shapeId1 = shape1._id.toString();

  await new Promise<void>((resolve) => {
    client1.emit("board:join", { boardId: boardId1 }, () => resolve());
  });

  await new Promise<void>((resolve) => {
    client2.emit("board:join", { boardId: boardId1 }, () => resolve());
  });

  await new Promise<void>((resolve) => {
    client3.emit("board:join", { boardId: boardId2 }, () => resolve());
  });

  // -------------------------------------------------------------
  // Test 1: User 1 locks Shape 1 -> Emits shape:transforming -> User 2 receives event
  // -------------------------------------------------------------
  console.log("\nTest 1: User 1 locks Shape 1 -> Emits shape:transforming -> User 2 receives event...");

  await new Promise<void>((resolve, reject) => {
    client1.emit("shape:lock", { boardId: boardId1, shapeId: shapeId1 }, (res) => {
      if (res.success) {
        resolve();
      } else {
        reject(new Error("Failed to acquire lock in Test 1"));
      }
    });
  });

  let client1ReceivedSelfTransform = false;
  client1.on("shape:transforming", () => {
    client1ReceivedSelfTransform = true;
  });

  const transformReceivedPromise = new Promise<ShapeTransformingPayload>((resolve) => {
    client2.once("shape:transforming", (payload) => {
      resolve(payload);
    });
  });

  client1.emit("shape:transforming", {
    boardId: boardId1,
    shapeId: shapeId1,
    x: 150,
    y: 180,
    width: 250,
    height: 180,
    rotation: 45,
  });

  const receivedTransform = await transformReceivedPromise;

  if (
    receivedTransform.shapeId !== shapeId1 ||
    receivedTransform.x !== 150 ||
    receivedTransform.y !== 180 ||
    receivedTransform.width !== 250 ||
    receivedTransform.height !== 180 ||
    receivedTransform.rotation !== 45 ||
    receivedTransform.userId !== (user1._id as Types.ObjectId).toString() ||
    receivedTransform.fullName !== "Alice Transformer"
  ) {
    throw new Error(`Test 1 Failed: unexpected transform payload: ${JSON.stringify(receivedTransform)}`);
  }

  if (client1ReceivedSelfTransform) {
    throw new Error("Test 1 Failed: sender received its own transform frame.");
  }

  // Verify MongoDB was NOT modified by intermediate transform frame
  const dbShapeAfterTransform = await ShapeModel.findById(shape1._id as Types.ObjectId);
  if (dbShapeAfterTransform?.x !== 100 || dbShapeAfterTransform?.y !== 100) {
    throw new Error("Test 1 Failed: MongoDB was mutated during ephemeral transform stream.");
  }
  console.log("✓ Live transform broadcast delivered to collaborator, sender excluded, DB untouched.");

  // -------------------------------------------------------------
  // Test 2: User 2 emits shape:transforming on User 1's locked shape -> Dropped/Ignored
  // -------------------------------------------------------------
  console.log("\nTest 2: Non-owner User 2 emits shape:transforming -> Dropped by server...");

  let user1ReceivedInvalidTransform = false;
  client1.once("shape:transforming", () => {
    user1ReceivedInvalidTransform = true;
  });

  client2.emit("shape:transforming", {
    boardId: boardId1,
    shapeId: shapeId1,
    x: 999,
    y: 999,
    width: 300,
    height: 300,
    rotation: 90,
  });

  await new Promise((resolve) => setTimeout(resolve, 150));

  if (user1ReceivedInvalidTransform) {
    throw new Error("Test 2 Failed: Non-owner was permitted to broadcast shape transformations.");
  }
  console.log("✓ Lock ownership strictly enforced: non-owner transform frames dropped.");

  // -------------------------------------------------------------
  // Test 3: Board room isolation (User 3 on Board 2 receives no transform events)
  // -------------------------------------------------------------
  console.log("\nTest 3: Board room isolation (Board 1 transforms never leak to Board 2)...");

  let user3ReceivedTransform = false;
  client3.once("shape:transforming", () => {
    user3ReceivedTransform = true;
  });

  client1.emit("shape:transforming", {
    boardId: boardId1,
    shapeId: shapeId1,
    x: 200,
    y: 220,
    width: 220,
    height: 160,
    rotation: 15,
  });

  await new Promise((resolve) => setTimeout(resolve, 150));

  if (user3ReceivedTransform) {
    throw new Error("Test 3 Failed: Transform frame leaked to another board room.");
  }
  console.log("✓ Board room isolation verified.");

  // -------------------------------------------------------------
  // Test 4: Rejecting invalid payloads (NaN, Infinity, negative dimensions, bad IDs)
  // -------------------------------------------------------------
  console.log("\nTest 4: Rejecting malformed and invalid transform payloads...");

  let receivedMalformed = false;
  client2.once("shape:transforming", () => {
    receivedMalformed = true;
  });

  // Emit negative width
  client1.emit("shape:transforming", {
    boardId: boardId1,
    shapeId: shapeId1,
    x: 100,
    y: 100,
    width: -50,
    height: 100,
    rotation: 0,
  });

  // Emit NaN
  client1.emit("shape:transforming", {
    boardId: boardId1,
    shapeId: shapeId1,
    x: NaN,
    y: 100,
    width: 100,
    height: 100,
    rotation: 0,
  });

  await new Promise((resolve) => setTimeout(resolve, 150));

  if (receivedMalformed) {
    throw new Error("Test 4 Failed: Malformed payload was broadcast to room.");
  }
  console.log("✓ Malformed transform payloads safely dropped by validation schema.");

  // -------------------------------------------------------------
  // Test 5: User 1 emits shape:transform-end -> User 2 receives event
  // -------------------------------------------------------------
  console.log("\nTest 5: User 1 emits shape:transform-end -> User 2 receives shape:transform-end...");

  let client1ReceivedSelfEnd = false;
  client1.on("shape:transform-end", () => {
    client1ReceivedSelfEnd = true;
  });

  const endReceivedPromise = new Promise<ShapeTransformEndPayload>((resolve) => {
    client2.once("shape:transform-end", (payload) => {
      resolve(payload);
    });
  });

  client1.emit("shape:transform-end", {
    boardId: boardId1,
    shapeId: shapeId1,
  });

  const receivedEnd = await endReceivedPromise;
  if (receivedEnd.boardId !== boardId1 || receivedEnd.shapeId !== shapeId1) {
    throw new Error(`Test 5 Failed: unexpected transform-end payload: ${JSON.stringify(receivedEnd)}`);
  }

  if (client1ReceivedSelfEnd) {
    throw new Error("Test 5 Failed: sender received its own transform-end broadcast.");
  }
  console.log("✓ shape:transform-end broadcast delivered to collaborators, sender excluded.");

  // -------------------------------------------------------------
  // Test 6: Final transform persistence via shape:update + shape:unlock
  // -------------------------------------------------------------
  console.log("\nTest 6: Committing final shape update to MongoDB and releasing lock...");

  await new Promise<void>((resolve, reject) => {
    client1.emit(
      "shape:update",
      {
        shapeId: shapeId1,
        data: {
          x: 350,
          y: 400,
          width: 250,
          height: 180,
          rotation: 45,
        },
      },
      (res) => {
        if (res.success) {
          resolve();
        } else {
          reject(new Error("Failed to persist final shape update"));
        }
      }
    );
  });

  const dbShapeFinal = await ShapeModel.findById(shape1._id as Types.ObjectId);
  if (dbShapeFinal?.x !== 350 || dbShapeFinal?.y !== 400 || dbShapeFinal?.rotation !== 45) {
    throw new Error("Test 6 Failed: final shape update was not persisted in MongoDB.");
  }

  await new Promise<void>((resolve, reject) => {
    client1.emit("shape:unlock", { boardId: boardId1, shapeId: shapeId1 }, (res) => {
      if (res.success) {
        resolve();
      } else {
        reject(new Error("Failed to unlock shape"));
      }
    });
  });
  console.log("✓ Final shape transform successfully persisted in MongoDB and unlocked.");

  // -------------------------------------------------------------
  // Test 7: User 2 acquires lock -> Streams transform -> Disconnects -> Lock released
  // -------------------------------------------------------------
  console.log("\nTest 7: User 2 acquires lock -> Streams transform -> Disconnects -> Lock released...");

  await new Promise<void>((resolve, reject) => {
    client2.emit("shape:lock", { boardId: boardId1, shapeId: shapeId1 }, (res) => {
      if (res.success) {
        resolve();
      } else {
        reject(new Error("User 2 failed to acquire lock in Test 7"));
      }
    });
  });

  const unlockOnDisconnectPromise = new Promise<void>((resolve) => {
    client1.once("shape:unlocked", (payload) => {
      if (payload.shapeId === shapeId1) {
        resolve();
      }
    });
  });

  client2.disconnect();

  await unlockOnDisconnectPromise;
  console.log("✓ Disconnecting transforming socket automatically releases lock and notifies room.");

  // Cleanup
  client1.disconnect();
  client3.disconnect();
  await socketServer.close();
  await mongoose.disconnect();

  console.log("\nAll Real-Time Shape Transform Synchronization Tests Passed Successfully!\n");
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
