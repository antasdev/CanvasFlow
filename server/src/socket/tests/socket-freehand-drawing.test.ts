import crypto from "crypto";
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
import { ShapeMapper } from "@/modules/shape/shape.mapper";
import { MutationRecordModel } from "@/modules/mutation/mutation.model";
import { FreehandShapeResponseDto } from "@/modules/shape/shape.dto";
import { SocketEvents } from "../socket.events";
import { SocketServer } from "../socket.server";
import {
  CreateShapePayload,
  UpdateShapePayload,
  DeleteShapePayload,
  SocketAck,
  InteractionStartPayload,
  InteractionUpdatePayload,
  InteractionEndPayload,
  InteractionBroadcastPayload,
  InteractionSnapshotPayload,
} from "../socket.types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

async function runFreehandDrawingTests(): Promise<void> {
  console.log("Starting Slice 17: Collaborative Freehand Drawing Integration Tests...\n");

  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB for Slice 17 test fixture setup.");

  // Clear test fixtures
  await Promise.all([
    UserModel.deleteMany({ email: { $regex: /@slice17-test\.com$/ } }),
    WorkspaceModel.deleteMany({ name: { $regex: /Slice 17/ } }),
    WorkspaceMemberModel.deleteMany({}),
    BoardModel.deleteMany({ title: { $regex: /Slice 17/ } }),
    CanvasModel.deleteMany({ name: { $regex: /Slice 17/ } }),
    ShapeModel.deleteMany({}),
    MutationRecordModel.deleteMany({}),
  ]);

  // Seed Users
  const ownerUser = await UserModel.create({
    email: "owner@slice17-test.com",
    password: "Password123!",
    fullName: "Alice Owner",
  });

  const adminUser = await UserModel.create({
    email: "admin@slice17-test.com",
    password: "Password123!",
    fullName: "Bob Admin",
  });

  const editorUser = await UserModel.create({
    email: "editor@slice17-test.com",
    password: "Password123!",
    fullName: "Charlie Editor",
  });

  const viewerUser = await UserModel.create({
    email: "viewer@slice17-test.com",
    password: "Password123!",
    fullName: "David Viewer",
  });

  // Seed Workspace
  const workspace = await WorkspaceModel.create({
    name: "Slice 17 Drawing Workspace",
    ownerId: ownerUser._id,
  });

  // Seed Workspace Members
  await Promise.all([
    WorkspaceMemberModel.create({
      workspaceId: workspace._id,
      userId: ownerUser._id,
      role: WorkspaceRole.OWNER,
    }),
    WorkspaceMemberModel.create({
      workspaceId: workspace._id,
      userId: adminUser._id,
      role: WorkspaceRole.ADMIN,
    }),
    WorkspaceMemberModel.create({
      workspaceId: workspace._id,
      userId: editorUser._id,
      role: WorkspaceRole.EDITOR,
    }),
    WorkspaceMemberModel.create({
      workspaceId: workspace._id,
      userId: viewerUser._id,
      role: WorkspaceRole.VIEWER,
    }),
  ]);

  // Seed Board & Canvas
  const board = await BoardModel.create({
    workspaceId: workspace._id,
    name: "Slice 17 Drawing Board",
    createdBy: ownerUser._id,
    collaborationRevision: 0,
  });

  const canvas = await CanvasModel.create({
    boardId: board._id,
    name: "Slice 17 Canvas",
    order: 1,
  });

  const boardId = board._id.toString();
  const canvasId = canvas._id.toString();

  // JWT Tokens
  const ownerToken = generateAccessToken({ userId: ownerUser._id.toString(), role: UserRole.USER });
  const adminToken = generateAccessToken({ userId: adminUser._id.toString(), role: UserRole.USER });
  const editorToken = generateAccessToken({ userId: editorUser._id.toString(), role: UserRole.USER });
  const viewerToken = generateAccessToken({ userId: viewerUser._id.toString(), role: UserRole.USER });

  // Spin up test HTTP & Socket.IO server
  const httpServer = createServer();
  const socketServer = new SocketServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as any).port;
  const serverUrl = `http://localhost:${port}`;

  const createClientSocket = (token: string): Promise<ClientSocket> => {
    return new Promise((resolve, reject) => {
      const socket = clientIO(serverUrl, {
        auth: { token },
        transports: ["websocket"],
        reconnection: false,
      });
      socket.on("connect", () => resolve(socket));
      socket.on("connect_error", (err) => reject(err));
    });
  };

  const ownerSocket = await createClientSocket(ownerToken);
  const adminSocket = await createClientSocket(adminToken);
  const editorSocket = await createClientSocket(editorToken);
  const viewerSocket = await createClientSocket(viewerToken);

  // Join all sockets to the board room
  await Promise.all([
    new Promise<void>((resolve) => {
      ownerSocket.emit(SocketEvents.BOARD_JOIN, { boardId, canvasId }, () => resolve());
    }),
    new Promise<void>((resolve) => {
      adminSocket.emit(SocketEvents.BOARD_JOIN, { boardId, canvasId }, () => resolve());
    }),
    new Promise<void>((resolve) => {
      editorSocket.emit(SocketEvents.BOARD_JOIN, { boardId, canvasId }, () => resolve());
    }),
    new Promise<void>((resolve) => {
      viewerSocket.emit(SocketEvents.BOARD_JOIN, { boardId, canvasId }, () => resolve());
    }),
  ]);

  try {
    console.log("Connected all 4 test sockets to board room.\n");

    // =========================================================================
    // Test 1–3: OWNER, ADMIN, and EDITOR can create freehand shapes
    // =========================================================================
    console.log("Test 1–3: Authorized Roles (OWNER, ADMIN, EDITOR) can create freehand shapes");

    const createFreehand = (socket: ClientSocket, points: number[]): Promise<SocketAck<FreehandShapeResponseDto>> => {
      return new Promise((resolve) => {
        const payload: CreateShapePayload = {
          canvasId,
          mutationId: crypto.randomUUID(),
          type: "freehand",
          x: 100,
          y: 100,
          width: 80,
          height: 60,
          rotation: 0,
          points,
          style: {
            stroke: "#3b82f6",
            strokeWidth: 3,
            opacity: 1,
          },
        };
        socket.emit(SocketEvents.SHAPE_CREATE, payload, (ack: SocketAck<FreehandShapeResponseDto>) => {
          resolve(ack);
        });
      });
    };

    const ownerRes = await createFreehand(ownerSocket, [0, 0, 40, 30, 80, 60]);
    assert(ownerRes.success === true, "OWNER must be permitted to create freehand shape.");
    assert(ownerRes.data?.type === "freehand", "Created shape type must be freehand.");
    assert(Array.isArray(ownerRes.data?.points) && ownerRes.data.points.length === 6, "Points array must match.");
    console.log("  ✓ Test 1 Passed: OWNER created freehand shape successfully.");

    const adminRes = await createFreehand(adminSocket, [0, 0, 20, 20, 50, 50]);
    assert(adminRes.success === true, "ADMIN must be permitted to create freehand shape.");
    console.log("  ✓ Test 2 Passed: ADMIN created freehand shape successfully.");

    const editorRes = await createFreehand(editorSocket, [0, 0, 10, 20, 30, 40]);
    assert(editorRes.success === true, "EDITOR must be permitted to create freehand shape.");
    console.log("  ✓ Test 3 Passed: EDITOR created freehand shape successfully.\n");

    // =========================================================================
    // Test 4: VIEWER cannot create freehand shapes (403 FORBIDDEN)
    // =========================================================================
    console.log("Test 4: VIEWER cannot create freehand shapes");
    const viewerRes = await createFreehand(viewerSocket, [0, 0, 10, 10]);
    assert(viewerRes.success === false, "VIEWER must NOT be permitted to create freehand shape.");
    assert((viewerRes.error as any)?.code === "FORBIDDEN", "Error code must be FORBIDDEN.");
    console.log("  ✓ Test 4 Passed: VIEWER create rejected with 403 FORBIDDEN.\n");

    // =========================================================================
    // Test 5–10: Input Validation on Freehand Strokes
    // =========================================================================
    console.log("Test 5–10: Server Input Validation on Freehand Payloads");

    // Test 5: Empty points array
    const emptyRes = await createFreehand(editorSocket, []);
    assert(!emptyRes.success && (emptyRes.error as any)?.code === "BAD_REQUEST", "Empty points array must be rejected.");
    console.log("  ✓ Test 5 Passed: Empty stroke rejected.");

    // Test 6: Odd coordinate count [x, y, x]
    const oddRes = await createFreehand(editorSocket, [0, 0, 10]);
    assert(!oddRes.success && (oddRes.error as any)?.code === "BAD_REQUEST", "Odd coordinate array must be rejected.");
    console.log("  ✓ Test 6 Passed: Odd coordinate count rejected.");

    // Test 7: NaN coordinate
    const nanRes = await createFreehand(editorSocket, [0, NaN, 10, 10]);
    assert(!nanRes.success && (nanRes.error as any)?.code === "BAD_REQUEST", "NaN coordinate must be rejected.");
    console.log("  ✓ Test 7 Passed: NaN coordinate rejected.");

    // Test 8: Infinity coordinate
    const infRes = await createFreehand(editorSocket, [0, 0, Infinity, 10]);
    assert(!infRes.success && (infRes.error as any)?.code === "BAD_REQUEST", "Infinity coordinate must be rejected.");
    console.log("  ✓ Test 8 Passed: Infinity coordinate rejected.");

    // Test 9: Excessive point count (> 2000 numbers)
    const hugePoints = new Array(2002).fill(10);
    const hugeRes = await createFreehand(editorSocket, hugePoints);
    assert(!hugeRes.success && (hugeRes.error as any)?.code === "BAD_REQUEST", "Points array > 2000 coordinates must be rejected.");
    console.log("  ✓ Test 9 Passed: Excessive point count rejected (> 2000 coordinates).");

    // Test 10: Coordinate bounds exceeded (> 100,000)
    const boundsRes = await createFreehand(editorSocket, [0, 0, 200000, 10]);
    assert(!boundsRes.success && (boundsRes.error as any)?.code === "BAD_REQUEST", "Out of bounds coordinates must be rejected.");
    console.log("  ✓ Test 10 Passed: Out of bounds coordinates rejected (> 100,000).\n");

    // =========================================================================
    // Test 11: Persisted Stroke Retrieval & Canonical Mapping
    // =========================================================================
    console.log("Test 11: Persisted Freehand Stroke Retrieval & Mapping");
    const editorCreatedShapeId = editorRes.data?.id!;
    const storedDoc = await ShapeModel.findById(editorCreatedShapeId);
    assert(Boolean(storedDoc), "Freehand shape must exist in MongoDB.");
    assert(storedDoc?.type === ShapeType.FREEHAND, "Shape type in MongoDB must be ShapeType.FREEHAND.");
    assert(Array.isArray(storedDoc?.points) && storedDoc.points.length === 6, "MongoDB points must be stored at root geometry.");

    const mappedDto = ShapeMapper.toResponseDto(storedDoc!) as FreehandShapeResponseDto;
    assert(mappedDto.type === "freehand", "Mapped DTO type must be 'freehand'.");
    assert(Array.isArray(mappedDto.points) && mappedDto.points.length === 6, "Mapped DTO points must be array.");
    assert((mappedDto.style as any)?.points === undefined, "Canonical style must NOT contain points array.");
    console.log("  ✓ Test 11 Passed: Persisted freehand stroke retrieved and mapped correctly.\n");

    // =========================================================================
    // Test 12: Authorized Update with OCC (expectedVersion) & Rescaled Points
    // =========================================================================
    console.log("Test 12: Authorized Freehand Update with Version Increment");
    const initialVersion = storedDoc?.version ?? 1;
    const updateRes = await new Promise<SocketAck<FreehandShapeResponseDto>>((resolve) => {
      const payload: UpdateShapePayload = {
        shapeId: editorCreatedShapeId,
        mutationId: crypto.randomUUID(),
        expectedVersion: initialVersion,
        data: {
          x: 120,
          y: 130,
          width: 160,
          height: 120,
          rotation: 45,
          points: [0, 0, 20, 40, 60, 80],
        },
      };
      editorSocket.emit(SocketEvents.SHAPE_UPDATE, payload, resolve);
    });

    assert(updateRes.success === true, "Authorized EDITOR update must succeed.");
    const updatedDoc = await ShapeModel.findById(editorCreatedShapeId);
    assert((updatedDoc?.version ?? 0) === initialVersion + 1, "Shape.version must increment by 1 on update.");
    assert(updatedDoc?.x === 120 && updatedDoc?.y === 130, "Updated coordinates must persist.");
    assert(Array.isArray(updatedDoc?.points) && updatedDoc.points[1] === 0, "Updated points must persist.");
    console.log("  ✓ Test 12 Passed: Freehand update incremented Shape.version correctly.\n");

    // =========================================================================
    // Test 13: Authorized Delete
    // =========================================================================
    console.log("Test 13: Authorized Freehand Delete");
    const adminCreatedShapeId = adminRes.data?.id!;
    const deleteRes = await new Promise<SocketAck<{ id: string }>>((resolve) => {
      const payload: DeleteShapePayload = {
        shapeId: adminCreatedShapeId,
        mutationId: crypto.randomUUID(),
      };
      editorSocket.emit(SocketEvents.SHAPE_DELETE, payload, resolve);
    });
    assert(deleteRes.success === true, "Authorized EDITOR delete must succeed.");
    const deletedDoc = await ShapeModel.findById(adminCreatedShapeId);
    assert(deletedDoc === null, "Deleted freehand shape must no longer exist in MongoDB.");
    console.log("  ✓ Test 13 Passed: Freehand shape deleted successfully.\n");

    // =========================================================================
    // Test 14 & 15: VIEWER Update and Delete Rejected
    // =========================================================================
    console.log("Test 14 & 15: VIEWER Update and Delete Rejection");
    const viewerUpdateRes = await new Promise<SocketAck<any>>((resolve) => {
      viewerSocket.emit(
        SocketEvents.SHAPE_UPDATE,
        { shapeId: editorCreatedShapeId, data: { x: 999 } },
        resolve
      );
    });
    assert(!viewerUpdateRes.success && (viewerUpdateRes.error as any)?.code === "FORBIDDEN", "VIEWER update must be rejected.");

    const viewerDeleteRes = await new Promise<SocketAck<any>>((resolve) => {
      viewerSocket.emit(
        SocketEvents.SHAPE_DELETE,
        { shapeId: editorCreatedShapeId },
        resolve
      );
    });
    assert(!viewerDeleteRes.success && (viewerDeleteRes.error as any)?.code === "FORBIDDEN", "VIEWER delete must be rejected.");
    console.log("  ✓ Test 14 & 15 Passed: VIEWER update and delete rejected with 403 FORBIDDEN.\n");

    // =========================================================================
    // Test 16–18: Revision & MutationRecord Invariants
    // =========================================================================
    console.log("Test 16–18: Revision and MutationRecord Invariants");
    const boardDoc = await BoardModel.findById(boardId);
    const mutationCount = await MutationRecordModel.countDocuments({ boardId });
    // 3 creates + 1 update + 1 delete = 5 durable mutations
    assert((boardDoc?.collaborationRevision ?? 0) === 5, `Board collaborationRevision must be exactly 5, got ${boardDoc?.collaborationRevision}.`);
    assert(mutationCount === 5, `MutationRecord count must be exactly 5, got ${mutationCount}.`);
    console.log("  ✓ Test 16–18 Passed: collaborationRevision and MutationRecords correspond strictly to durable mutations.\n");

    // =========================================================================
    // Test 19–21: CRITICAL INVARIANT — Ephemeral Drawing Purity (0 DB Writes, 0 Revision Bumps, 0 MutationRecords)
    // =========================================================================
    console.log("Test 19–21: CRITICAL INVARIANT — Ephemeral Drawing Purity");
    const revBefore = boardDoc?.collaborationRevision ?? 5;
    const shapesBefore = await ShapeModel.countDocuments({ canvasId });
    const mutationsBefore = await MutationRecordModel.countDocuments({ boardId });

    // Simulate collaborator active drawing gesture
    let capturedBroadcast: any = null;
    viewerSocket.on("interaction:update" as any, (payload: any) => {
      capturedBroadcast = payload;
    });

    const startRes = await new Promise<any>((resolve) => {
      const payload: InteractionStartPayload = {
        boardId,
        type: "drawing",
        targets: [],
        data: {
          points: [100, 100],
          stroke: "#ef4444",
          strokeWidth: 2,
        },
      };
      editorSocket.emit("interaction:start" as any, payload, resolve);
    });

    assert(startRes.success === true, "interaction:start for drawing must succeed.");
    const interactionId = startRes.data?.interactionId || startRes.interaction?.interactionId || startRes.interactionId;
    assert(Boolean(interactionId), "interactionId must be returned.");

    // Simulate high-frequency streaming of 5 incremental point batches
    for (let i = 1; i <= 5; i++) {
      await new Promise<any>((resolve) => {
        const payload: InteractionUpdatePayload = {
          boardId,
          interactionId,
          data: {
            pointsBatch: [100 + i * 10, 100 + i * 10],
            stroke: "#ef4444",
            strokeWidth: 2,
          },
        };
        editorSocket.emit("interaction:update" as any, payload, resolve);
      });
      await new Promise((r) => setTimeout(r, 20));
    }

    // End ephemeral interaction
    await new Promise<any>((resolve) => {
      const payload: InteractionEndPayload = {
        boardId,
        interactionId,
      };
      editorSocket.emit("interaction:end" as any, payload, resolve);
    });

    // Check database state immediately after active drawing completes
    const revAfter = (await BoardModel.findById(boardId))?.collaborationRevision ?? 0;
    const shapesAfter = await ShapeModel.countDocuments({ canvasId });
    const mutationsAfter = await MutationRecordModel.countDocuments({ boardId });

    assert(shapesAfter === shapesBefore, "Ephemeral drawing must create ZERO Shape documents in MongoDB.");
    assert(revAfter === revBefore, "Ephemeral drawing must create ZERO collaborationRevision increments.");
    assert(mutationsAfter === mutationsBefore, "Ephemeral drawing must create ZERO MutationRecords in MongoDB.");
    assert(capturedBroadcast !== null, "Collaborators must receive real-time ephemeral update packets.");
    console.log("  ✓ Test 19–21 Passed: 0 DB writes, 0 revision increments, 0 MutationRecords during active drawing gesture.\n");

    // =========================================================================
    // Test 22: Runtime Role Transition (EDITOR downgraded to VIEWER mid-drawing)
    // =========================================================================
    console.log("Test 22: Runtime Role Transition (EDITOR -> VIEWER during drawing blocks final commit)");

    // Editor starts drawing
    const midStrokeStart = await new Promise<any>((resolve) => {
      editorSocket.emit(
        "interaction:start" as any,
        {
          boardId,
          type: "drawing",
          targets: [],
          data: { points: [50, 50] },
        },
        resolve
      );
    });
    assert(midStrokeStart.success === true, "Editor initiates drawing successfully.");

    // OWNER dynamically downgrades Editor to VIEWER in MongoDB
    await WorkspaceMemberModel.updateOne(
      { workspaceId: workspace._id, userId: editorUser._id },
      { role: WorkspaceRole.VIEWER }
    );
    console.log("  [Workspace] Downgraded Charlie from EDITOR to VIEWER mid-gesture.");

    // Editor releases pointer and attempts durable shape:create commit
    const midStrokeCommit = await createFreehand(editorSocket, [50, 50, 70, 70]);
    assert(!midStrokeCommit.success, "shape:create must fail after role downgrade.");
    assert((midStrokeCommit.error as any)?.code === "FORBIDDEN", "Rejected with 403 FORBIDDEN on fresh server authorization.");

    // Verify 0 side effects
    const revAfterDowngrade = (await BoardModel.findById(boardId))?.collaborationRevision ?? 0;
    assert(revAfterDowngrade === revBefore, "No revision increment on rejected commit.");
    console.log("  ✓ Test 22 Passed: Runtime EDITOR -> VIEWER transition cleanly blocks final commit.\n");

    // Restore Editor role for remaining tests
    await WorkspaceMemberModel.updateOne(
      { workspaceId: workspace._id, userId: editorUser._id },
      { role: WorkspaceRole.EDITOR }
    );

    // =========================================================================
    // Test 23: VIEWER cannot initiate drawing interaction
    // =========================================================================
    console.log("Test 23: VIEWER cannot initiate drawing interaction");
    const viewerStartRes = await new Promise<any>((resolve) => {
      viewerSocket.emit(
        "interaction:start" as any,
        {
          boardId,
          type: "drawing",
          targets: [],
          data: { points: [0, 0] },
        },
        resolve
      );
    });
    assert(!viewerStartRes.success, "VIEWER drawing interaction must be rejected.");
    assert((viewerStartRes.error as any)?.code === "FORBIDDEN", "Viewer rejected with FORBIDDEN on interaction:start.");
    console.log("  ✓ Test 23 Passed: VIEWER rejected on interaction:start.\n");

    // =========================================================================
    // Test 24: Concurrent Drawing by Multiple Users
    // =========================================================================
    console.log("Test 24: Concurrent Drawing by Multiple Users");
    const [drawA, drawB] = await Promise.all([
      createFreehand(ownerSocket, [0, 0, 50, 50]),
      createFreehand(adminSocket, [100, 100, 150, 150]),
    ]);
    assert(drawA.success && drawB.success, "Both concurrent drawings must succeed without conflict.");
    console.log("  ✓ Test 24 Passed: Concurrent drawing by multiple users verified.\n");

    // =========================================================================
    // Test 25: Recovery Hydration from MongoDB without Event Replay
    // =========================================================================
    console.log("Test 25: Board Recovery Hydration from MongoDB");
    const allDbShapes = await ShapeModel.find({ canvasId }).sort({ zIndex: 1 });
    const freehandDbShapes = allDbShapes.filter((s) => s.type === ShapeType.FREEHAND);
    assert(freehandDbShapes.length >= 3, "All committed freehand shapes exist in MongoDB.");

    const mappedRecovery = freehandDbShapes.map((s) => ShapeMapper.toResponseDto(s));
    for (const shape of mappedRecovery) {
      assert(shape.type === "freehand", "Hydrated shape must be of type freehand.");
      assert(Array.isArray((shape as FreehandShapeResponseDto).points), "Hydrated shape must contain points array.");
    }
    console.log("  ✓ Test 25 Passed: Board recovery hydrates all persisted freehand strokes from MongoDB.\n");

    console.log("=========================================================================");
    console.log("  ALL 25 COLLABORATIVE FREEHAND DRAWING TESTS PASSED CLEANLY!");
    console.log("=========================================================================\n");
  } finally {
    ownerSocket.disconnect();
    adminSocket.disconnect();
    editorSocket.disconnect();
    viewerSocket.disconnect();
    socketServer.close();
    httpServer.close();
    await mongoose.disconnect();
  }
}

runFreehandDrawingTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
