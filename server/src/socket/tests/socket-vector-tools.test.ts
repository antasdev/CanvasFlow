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
import {
  LineShapeResponseDto,
  ArrowShapeResponseDto,
  ConnectorShapeResponseDto,
} from "@/modules/shape/shape.dto";
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
} from "../socket.types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

function getErrorCode(error: unknown): string | undefined {
  if (!error) return undefined;
  if (typeof error === "string") return error;
  if (typeof error === "object" && "code" in error) {
    return String((error as { code: unknown }).code);
  }
  return undefined;
}

async function runVectorToolsTests(): Promise<void> {
  console.log("Starting Slice 18: Advanced Vector Tools (Line, Arrow, Connector) Integration Tests...\n");

  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB for Slice 18 test fixture setup.");

  // Clear test fixtures
  await Promise.all([
    UserModel.deleteMany({ email: { $regex: /@slice18-test\.com$/ } }),
    WorkspaceModel.deleteMany({ name: { $regex: /Slice 18/ } }),
    WorkspaceMemberModel.deleteMany({}),
    BoardModel.deleteMany({ name: { $regex: /Slice 18/ } }),
    CanvasModel.deleteMany({ name: { $regex: /Slice 18/ } }),
    ShapeModel.deleteMany({}),
    MutationRecordModel.deleteMany({}),
  ]);

  // Seed Users
  const ownerUser = await UserModel.create({
    email: "owner@slice18-test.com",
    password: "Password123!",
    fullName: "Alice Owner",
  });

  const adminUser = await UserModel.create({
    email: "admin@slice18-test.com",
    password: "Password123!",
    fullName: "Bob Admin",
  });

  const editorUser = await UserModel.create({
    email: "editor@slice18-test.com",
    password: "Password123!",
    fullName: "Charlie Editor",
  });

  const viewerUser = await UserModel.create({
    email: "viewer@slice18-test.com",
    password: "Password123!",
    fullName: "David Viewer",
  });

  // Seed Workspace
  const workspace = await WorkspaceModel.create({
    name: "Slice 18 Vector Workspace",
    ownerId: ownerUser._id,
  });

  // Seed Memberships
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
    name: "Slice 18 Vector Board",
    workspaceId: workspace._id,
    createdBy: ownerUser._id,
    collaborationRevision: 0,
  });

  const canvas = await CanvasModel.create({
    name: "Slice 18 Main Canvas",
    boardId: board._id,
    order: 1,
  });

  // Seed Second Canvas (for cross-canvas attachment tests)
  const otherCanvas = await CanvasModel.create({
    name: "Slice 18 Other Canvas",
    boardId: board._id,
    order: 2,
  });

  // Seed primitive target shapes for connector testing
  const rectA = await ShapeModel.create({
    canvasId: canvas._id,
    type: ShapeType.RECTANGLE,
    x: 100,
    y: 100,
    width: 150,
    height: 80,
    rotation: 0,
    zIndex: 1,
    createdBy: ownerUser._id,
    version: 1,
    style: { fill: "#3b82f6" },
  });

  const noteB = await ShapeModel.create({
    canvasId: canvas._id,
    type: ShapeType.STICKY_NOTE,
    x: 400,
    y: 100,
    width: 120,
    height: 120,
    rotation: 0,
    zIndex: 2,
    createdBy: ownerUser._id,
    version: 1,
    style: { text: "Target Node" },
  });

  const otherCanvasShape = await ShapeModel.create({
    canvasId: otherCanvas._id,
    type: ShapeType.RECTANGLE,
    x: 100,
    y: 100,
    width: 100,
    height: 100,
    rotation: 0,
    zIndex: 1,
    createdBy: ownerUser._id,
    version: 1,
    style: { fill: "#ef4444" },
  });

  // Setup Test HTTP & Socket.IO Server
  const httpServer = createServer();
  const socketServer = new SocketServer(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve());
  });

  const port = (httpServer.address() as any).port;
  const serverUrl = `http://localhost:${port}`;

  const createAuthenticatedSocket = async (
    userId: Types.ObjectId
  ): Promise<ClientSocket> => {
    const token = generateAccessToken({
      userId: userId.toString(),
      role: UserRole.USER,
    });

    const socket = clientIO(serverUrl, {
      auth: { token },
      transports: ["websocket"],
      forceNew: true,
    });

    await new Promise<void>((resolve, reject) => {
      socket.on("connect", () => resolve());
      socket.on("connect_error", (err) => reject(err));
    });

    return socket;
  };

  const ownerSocket = await createAuthenticatedSocket(ownerUser._id);
  const adminSocket = await createAuthenticatedSocket(adminUser._id);
  const editorSocket = await createAuthenticatedSocket(editorUser._id);
  const viewerSocket = await createAuthenticatedSocket(viewerUser._id);

  const boardId = board._id.toString();
  const canvasId = canvas._id.toString();

  // Join all sockets to the board room
  for (const sock of [ownerSocket, adminSocket, editorSocket, viewerSocket]) {
    await new Promise<void>((resolve) => {
      sock.emit("board:join", { boardId, canvasId }, () => resolve());
    });
  }

  console.log("Connected all 4 test sockets to board room.\n");

  try {
    // =========================================================================
    // Test 1–4: Line Creation RBAC (OWNER, ADMIN, EDITOR allowed; VIEWER forbidden)
    // =========================================================================
    console.log("Test 1–4: Line Creation Permissions");
    const ownerLineRes = await new Promise<SocketAck<LineShapeResponseDto>>((resolve) => {
      const payload: CreateShapePayload = {
        canvasId,
        type: "line",
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        points: [0, 0, 100, 100],
        style: { stroke: "#1f2937", strokeWidth: 2, strokeStyle: "solid" },
      };
      ownerSocket.emit(SocketEvents.SHAPE_CREATE, payload, resolve);
    });
    assert(ownerLineRes.success === true, "OWNER must be permitted to create a line.");
    assert(ownerLineRes.data?.type === "line", "Created shape type must be 'line'.");
    console.log("  ✓ Test 1 Passed: OWNER created line.");

    const adminLineRes = await new Promise<SocketAck<LineShapeResponseDto>>((resolve) => {
      const payload: CreateShapePayload = {
        canvasId,
        type: "line",
        x: 100,
        y: 50,
        width: 80,
        height: 60,
        points: [0, 0, 80, 60],
        style: { stroke: "#2563eb", strokeWidth: 3, strokeStyle: "dashed" },
      };
      adminSocket.emit(SocketEvents.SHAPE_CREATE, payload, resolve);
    });
    assert(adminLineRes.success === true, "ADMIN must be permitted to create a line.");
    console.log("  ✓ Test 2 Passed: ADMIN created line.");

    const editorLineRes = await new Promise<SocketAck<LineShapeResponseDto>>((resolve) => {
      const payload: CreateShapePayload = {
        canvasId,
        type: "line",
        x: 150,
        y: 50,
        width: 50,
        height: 50,
        points: [0, 0, 50, 50],
      };
      editorSocket.emit(SocketEvents.SHAPE_CREATE, payload, resolve);
    });
    assert(editorLineRes.success === true, "EDITOR must be permitted to create a line.");
    console.log("  ✓ Test 3 Passed: EDITOR created line.");

    const viewerLineRes = await new Promise<SocketAck<LineShapeResponseDto>>((resolve) => {
      const payload: CreateShapePayload = {
        canvasId,
        type: "line",
        x: 200,
        y: 50,
        width: 50,
        height: 50,
        points: [0, 0, 50, 50],
      };
      viewerSocket.emit(SocketEvents.SHAPE_CREATE, payload, resolve);
    });
    assert(viewerLineRes.success === false, "VIEWER must NOT be permitted to create a line.");
    assert(getErrorCode(viewerLineRes.error) === "FORBIDDEN", "VIEWER line rejection must be FORBIDDEN.");
    console.log("  ✓ Test 4 Passed: VIEWER line creation rejected with 403 FORBIDDEN.\n");

    // =========================================================================
    // Test 5–8: Arrow Creation RBAC (OWNER, ADMIN, EDITOR allowed; VIEWER forbidden)
    // =========================================================================
    console.log("Test 5–8: Arrow Creation Permissions");
    const ownerArrowRes = await new Promise<SocketAck<ArrowShapeResponseDto>>((resolve) => {
      const payload: CreateShapePayload = {
        canvasId,
        type: "arrow",
        x: 50,
        y: 200,
        width: 120,
        height: 40,
        points: [0, 0, 120, 40],
        style: { stroke: "#dc2626", strokeWidth: 2, arrowHeadEnd: true },
      };
      ownerSocket.emit(SocketEvents.SHAPE_CREATE, payload, resolve);
    });
    assert(ownerArrowRes.success === true, "OWNER must be permitted to create an arrow.");
    assert(ownerArrowRes.data?.type === "arrow", "Created shape type must be 'arrow'.");
    console.log("  ✓ Test 5 Passed: OWNER created arrow.");

    const adminArrowRes = await new Promise<SocketAck<ArrowShapeResponseDto>>((resolve) => {
      const payload: CreateShapePayload = {
        canvasId,
        type: "arrow",
        x: 100,
        y: 200,
        width: 90,
        height: 30,
        points: [0, 0, 90, 30],
      };
      adminSocket.emit(SocketEvents.SHAPE_CREATE, payload, resolve);
    });
    assert(adminArrowRes.success === true, "ADMIN must be permitted to create an arrow.");
    console.log("  ✓ Test 6 Passed: ADMIN created arrow.");

    const editorArrowRes = await new Promise<SocketAck<ArrowShapeResponseDto>>((resolve) => {
      const payload: CreateShapePayload = {
        canvasId,
        type: "arrow",
        x: 150,
        y: 200,
        width: 80,
        height: 20,
        points: [0, 0, 80, 20],
      };
      editorSocket.emit(SocketEvents.SHAPE_CREATE, payload, resolve);
    });
    assert(editorArrowRes.success === true, "EDITOR must be permitted to create an arrow.");
    console.log("  ✓ Test 7 Passed: EDITOR created arrow.");

    const viewerArrowRes = await new Promise<SocketAck<ArrowShapeResponseDto>>((resolve) => {
      const payload: CreateShapePayload = {
        canvasId,
        type: "arrow",
        x: 200,
        y: 200,
        width: 80,
        height: 20,
        points: [0, 0, 80, 20],
      };
      viewerSocket.emit(SocketEvents.SHAPE_CREATE, payload, resolve);
    });
    assert(viewerArrowRes.success === false, "VIEWER must NOT be permitted to create an arrow.");
    assert(getErrorCode(viewerArrowRes.error) === "FORBIDDEN", "VIEWER arrow rejection must be FORBIDDEN.");
    console.log("  ✓ Test 8 Passed: VIEWER arrow creation rejected with 403 FORBIDDEN.\n");

    // =========================================================================
    // Test 9–12: Connector Creation Variants (Both, Source-only, Target-only, Unconnected)
    // =========================================================================
    console.log("Test 9–12: Connector Creation Variants");
    // Test 9: Both Connected
    const bothConnectorRes = await new Promise<SocketAck<ConnectorShapeResponseDto>>((resolve) => {
      const payload: CreateShapePayload = {
        canvasId,
        type: "connector",
        x: 250,
        y: 140,
        width: 150,
        height: 20,
        points: [0, 0, 150, 20],
        connector: {
          sourceShapeId: rectA._id.toString(),
          sourceAnchor: "right",
          targetShapeId: noteB._id.toString(),
          targetAnchor: "left",
          routing: "straight",
        },
        style: { stroke: "#059669", strokeWidth: 2, arrowHeadEnd: true },
      };
      ownerSocket.emit(SocketEvents.SHAPE_CREATE, payload, resolve);
    });
    assert(bothConnectorRes.success === true, "Both-connected connector must be created successfully.");
    assert(bothConnectorRes.data?.type === "connector", "Type must be 'connector'.");
    assert(bothConnectorRes.data?.connector?.sourceAnchor === "right", "sourceAnchor must match.");
    assert(bothConnectorRes.data?.connector?.targetAnchor === "left", "targetAnchor must match.");
    console.log("  ✓ Test 9 Passed: Valid two-ended connector created.");

    // Test 10: Source-only Connected
    const sourceOnlyRes = await new Promise<SocketAck<ConnectorShapeResponseDto>>((resolve) => {
      const payload: CreateShapePayload = {
        canvasId,
        type: "connector",
        x: 250,
        y: 100,
        width: 100,
        height: 50,
        points: [0, 0, 100, 50],
        connector: {
          sourceShapeId: rectA._id.toString(),
          sourceAnchor: "top",
          targetShapeId: null,
          targetAnchor: null,
        },
      };
      editorSocket.emit(SocketEvents.SHAPE_CREATE, payload, resolve);
    });
    assert(sourceOnlyRes.success === true, "Source-only connector must be created successfully.");
    assert(sourceOnlyRes.data?.connector?.sourceAnchor === "top", "sourceAnchor must be 'top'.");
    console.log("  ✓ Test 10 Passed: Source-only connector created.");

    // Test 11: Target-only Connected
    const targetOnlyRes = await new Promise<SocketAck<ConnectorShapeResponseDto>>((resolve) => {
      const payload: CreateShapePayload = {
        canvasId,
        type: "connector",
        x: 300,
        y: 160,
        width: 100,
        height: 60,
        points: [0, 0, 100, 60],
        connector: {
          sourceShapeId: null,
          sourceAnchor: null,
          targetShapeId: noteB._id.toString(),
          targetAnchor: "bottom",
        },
      };
      editorSocket.emit(SocketEvents.SHAPE_CREATE, payload, resolve);
    });
    assert(targetOnlyRes.success === true, "Target-only connector must be created successfully.");
    assert(targetOnlyRes.data?.connector?.targetAnchor === "bottom", "targetAnchor must be 'bottom'.");
    console.log("  ✓ Test 11 Passed: Target-only connector created.");

    // Test 12: Unconnected Connector
    const unconnectedRes = await new Promise<SocketAck<ConnectorShapeResponseDto>>((resolve) => {
      const payload: CreateShapePayload = {
        canvasId,
        type: "connector",
        x: 10,
        y: 10,
        width: 50,
        height: 50,
        points: [0, 0, 50, 50],
        connector: {
          sourceShapeId: null,
          sourceAnchor: null,
          targetShapeId: null,
          targetAnchor: null,
        },
      };
      editorSocket.emit(SocketEvents.SHAPE_CREATE, payload, resolve);
    });
    assert(unconnectedRes.success === true, "Unconnected connector must be created successfully.");
    console.log("  ✓ Test 12 Passed: Unconnected connector created.\n");

    // =========================================================================
    // Test 13–20: Connector Validation & Relational Invariants
    // =========================================================================
    console.log("Test 13–20: Input Validation & Relational Invariants");

    // Test 13: Invalid anchor rejection
    const invalidAnchorRes = await new Promise<SocketAck<any>>((resolve) => {
      const payload = {
        canvasId,
        type: "connector",
        x: 10,
        y: 10,
        width: 50,
        height: 50,
        points: [0, 0, 50, 50],
        connector: {
          sourceShapeId: rectA._id.toString(),
          sourceAnchor: "invalid_anchor",
        },
      };
      editorSocket.emit(SocketEvents.SHAPE_CREATE, payload as any, resolve);
    });
    assert(invalidAnchorRes.success === false, "Invalid anchor position must be rejected.");
    console.log("  ✓ Test 13 Passed: Invalid anchor rejected.");

    // Test 14: Invalid routing rejection
    const invalidRoutingRes = await new Promise<SocketAck<any>>((resolve) => {
      const payload = {
        canvasId,
        type: "connector",
        x: 10,
        y: 10,
        width: 50,
        height: 50,
        points: [0, 0, 50, 50],
        connector: {
          routing: "zigzag_unknown",
        },
      };
      editorSocket.emit(SocketEvents.SHAPE_CREATE, payload as any, resolve);
    });
    assert(invalidRoutingRes.success === false, "Invalid routing mode must be rejected.");
    console.log("  ✓ Test 14 Passed: Invalid routing rejected.");

    // Test 15: Self-connection rejection
    const selfConnRes = await new Promise<SocketAck<any>>((resolve) => {
      const payload = {
        canvasId,
        type: "connector",
        x: 10,
        y: 10,
        width: 50,
        height: 50,
        points: [0, 0, 50, 50],
        connector: {
          sourceShapeId: rectA._id.toString(),
          targetShapeId: rectA._id.toString(),
        },
      };
      editorSocket.emit(SocketEvents.SHAPE_CREATE, payload as any, resolve);
    });
    assert(selfConnRes.success === false, "Self-connection (source === target) must be rejected.");
    console.log("  ✓ Test 15 Passed: Self-connection rejected.");

    // Test 16: Missing source shape rejection
    const fakeId = new Types.ObjectId().toString();
    const missingSourceRes = await new Promise<SocketAck<any>>((resolve) => {
      const payload = {
        canvasId,
        type: "connector",
        x: 10,
        y: 10,
        width: 50,
        height: 50,
        points: [0, 0, 50, 50],
        connector: {
          sourceShapeId: fakeId,
        },
      };
      editorSocket.emit(SocketEvents.SHAPE_CREATE, payload as any, resolve);
    });
    assert(missingSourceRes.success === false, "Missing source shape must be rejected.");
    console.log("  ✓ Test 16 Passed: Missing source shape rejected.");

    // Test 17: Missing target shape rejection
    const missingTargetRes = await new Promise<SocketAck<any>>((resolve) => {
      const payload = {
        canvasId,
        type: "connector",
        x: 10,
        y: 10,
        width: 50,
        height: 50,
        points: [0, 0, 50, 50],
        connector: {
          targetShapeId: fakeId,
        },
      };
      editorSocket.emit(SocketEvents.SHAPE_CREATE, payload as any, resolve);
    });
    assert(missingTargetRes.success === false, "Missing target shape must be rejected.");
    console.log("  ✓ Test 17 Passed: Missing target shape rejected.");

    // Test 18: Cross-canvas attachment rejection
    const crossCanvasRes = await new Promise<SocketAck<any>>((resolve) => {
      const payload = {
        canvasId,
        type: "connector",
        x: 10,
        y: 10,
        width: 50,
        height: 50,
        points: [0, 0, 50, 50],
        connector: {
          sourceShapeId: otherCanvasShape._id.toString(),
        },
      };
      editorSocket.emit(SocketEvents.SHAPE_CREATE, payload as any, resolve);
    });
    assert(crossCanvasRes.success === false, "Cross-canvas attachment must be rejected.");
    console.log("  ✓ Test 18 Passed: Cross-canvas attachment rejected.");

    // Test 19: Connector-to-connector rejection
    const connToConnRes = await new Promise<SocketAck<any>>((resolve) => {
      const payload = {
        canvasId,
        type: "connector",
        x: 10,
        y: 10,
        width: 50,
        height: 50,
        points: [0, 0, 50, 50],
        connector: {
          sourceShapeId: bothConnectorRes.data!.id,
        },
      };
      editorSocket.emit(SocketEvents.SHAPE_CREATE, payload as any, resolve);
    });
    assert(connToConnRes.success === false, "Connector-to-connector attachment must be rejected.");
    console.log("  ✓ Test 19 Passed: Connector-to-connector attachment rejected.");

    // Test 20: Invalid points rejection (e.g. fewer than 4 numbers)
    const invalidPtsRes = await new Promise<SocketAck<any>>((resolve) => {
      const payload = {
        canvasId,
        type: "line",
        x: 10,
        y: 10,
        width: 50,
        height: 50,
        points: [0, 0], // Needs 4 numbers [x1, y1, x2, y2]
      };
      editorSocket.emit(SocketEvents.SHAPE_CREATE, payload as any, resolve);
    });
    assert(invalidPtsRes.success === false, "Line with fewer than 4 point numbers must be rejected.");
    console.log("  ✓ Test 20 Passed: Sub-minimal points rejected.\n");

    // =========================================================================
    // Test 21: Zero-length / Tiny Gestures
    // =========================================================================
    console.log("Test 21: Zero-Length / Sub-threshold Handling");
    const tinyCountBefore = await ShapeModel.countDocuments({ canvasId });
    // In client CanvasEditor, pointer gestures < 5px are discarded locally before shape:create
    // Verify that server validates width/height > 0
    const zeroDimRes = await new Promise<SocketAck<any>>((resolve) => {
      const payload = {
        canvasId,
        type: "line",
        x: 10,
        y: 10,
        width: 0,
        height: 0,
        points: [0, 0, 0, 0],
      };
      editorSocket.emit(SocketEvents.SHAPE_CREATE, payload as any, resolve);
    });
    assert(zeroDimRes.success === false, "0 width/height must be rejected by server validation.");
    const tinyCountAfter = await ShapeModel.countDocuments({ canvasId });
    assert(tinyCountAfter === tinyCountBefore, "No shape created for zero dimensions.");
    console.log("  ✓ Test 21 Passed: Zero dimensions rejected by server validation.\n");

    // =========================================================================
    // Test 22–25: OCC, Shape.version, collaborationRevision & MutationRecord
    // =========================================================================
    console.log("Test 22–25: OCC, Versioning, CollaborationRevision & MutationRecords");
    const shapeToUpdateId = ownerLineRes.data!.id;
    const initialDoc = await ShapeModel.findById(shapeToUpdateId);
    assert(Boolean(initialDoc), "Shape document must exist.");
    const initVersion = initialDoc!.version;
    const initRev = (await BoardModel.findById(boardId))?.collaborationRevision ?? 0;
    const initMutCount = await MutationRecordModel.countDocuments({ boardId });

    // Authorized OCC update
    const updateRes = await new Promise<SocketAck<LineShapeResponseDto>>((resolve) => {
      const payload: UpdateShapePayload = {
        shapeId: shapeToUpdateId,
        mutationId: crypto.randomUUID(),
        expectedVersion: initVersion,
        data: {
          points: [0, 0, 150, 150],
          width: 150,
          height: 150,
        },
      };
      editorSocket.emit(SocketEvents.SHAPE_UPDATE, payload, resolve);
    });
    assert(updateRes.success === true, "Authorized OCC update must succeed.");
    assert(updateRes.data?.version === initVersion + 1, "Shape version must increment by 1.");

    const postUpdateRev = (await BoardModel.findById(boardId))?.collaborationRevision ?? 0;
    const postUpdateMutCount = await MutationRecordModel.countDocuments({ boardId });
    assert(postUpdateRev === initRev + 1, "collaborationRevision must increment by 1 on durable update.");
    assert(postUpdateMutCount === initMutCount + 1, "MutationRecord must be logged on durable update.");
    console.log("  ✓ Test 22–25 Passed: OCC verified, Shape.version incremented, revision incremented, MutationRecord created.\n");

    // =========================================================================
    // Test 26–27: Viewer Update and Delete Rejection
    // =========================================================================
    console.log("Test 26–27: Viewer Mutation Rejection");
    const viewerUpdateRes = await new Promise<SocketAck<any>>((resolve) => {
      const payload: UpdateShapePayload = {
        shapeId: shapeToUpdateId,
        data: { width: 300 },
      };
      viewerSocket.emit(SocketEvents.SHAPE_UPDATE, payload, resolve);
    });
    assert(viewerUpdateRes.success === false, "VIEWER update must be rejected.");
    assert(getErrorCode(viewerUpdateRes.error) === "FORBIDDEN", "Rejection code must be FORBIDDEN.");

    const viewerDeleteRes = await new Promise<SocketAck<any>>((resolve) => {
      const payload: DeleteShapePayload = {
        shapeId: shapeToUpdateId,
      };
      viewerSocket.emit(SocketEvents.SHAPE_DELETE, payload, resolve);
    });
    assert(viewerDeleteRes.success === false, "VIEWER delete must be rejected.");
    assert(getErrorCode(viewerDeleteRes.error) === "FORBIDDEN", "Rejection code must be FORBIDDEN.");
    console.log("  ✓ Test 26–27 Passed: VIEWER update and delete rejected with 403 FORBIDDEN.\n");

    // =========================================================================
    // Test 28–30: Ephemeral Gesture Produces Zero Side-effects
    // =========================================================================
    console.log("Test 28–30: Ephemeral Drawing Purity");
    const shapesBeforeGesture = await ShapeModel.countDocuments({ canvasId });
    const revBeforeGesture = (await BoardModel.findById(boardId))?.collaborationRevision ?? 0;
    const mutsBeforeGesture = await MutationRecordModel.countDocuments({ boardId });

    // Simulate transient interaction (e.g. drawing)
    const interactionId = "test-vector-interaction-1";
    await new Promise<void>((resolve) => {
      const startPayload: InteractionStartPayload = {
        boardId,
        type: "drawing",
        targets: [],
        data: { points: [10, 10] },
      };
      editorSocket.emit("interaction:start" as any, startPayload, () => resolve());
    });

    for (let i = 1; i <= 3; i++) {
      await new Promise<void>((resolve) => {
        const updatePayload: InteractionUpdatePayload = {
          boardId,
          interactionId,
          data: { pointsBatch: [10 + i * 5, 10 + i * 5] },
        };
        editorSocket.emit("interaction:update" as any, updatePayload, () => resolve());
      });
    }

    await new Promise<void>((resolve) => {
      const endPayload: InteractionEndPayload = { boardId, interactionId };
      editorSocket.emit("interaction:end" as any, endPayload, () => resolve());
    });

    const shapesAfterGesture = await ShapeModel.countDocuments({ canvasId });
    const revAfterGesture = (await BoardModel.findById(boardId))?.collaborationRevision ?? 0;
    const mutsAfterGesture = await MutationRecordModel.countDocuments({ boardId });

    assert(shapesAfterGesture === shapesBeforeGesture, "Ephemeral gesture must produce ZERO MongoDB shape writes.");
    assert(revAfterGesture === revBeforeGesture, "Ephemeral gesture must produce ZERO revision increments.");
    assert(mutsAfterGesture === mutsBeforeGesture, "Ephemeral gesture must produce ZERO MutationRecords.");
    console.log("  ✓ Test 28–30 Passed: 0 DB writes, 0 revision increments, 0 MutationRecords during active gesture.\n");

    // =========================================================================
    // Test 31–33: Concurrent Vector Shape Creation
    // =========================================================================
    console.log("Test 31–33: Concurrent Shape Creation");
    const [c1, c2, c3] = await Promise.all([
      new Promise<SocketAck<LineShapeResponseDto>>((res) => {
        ownerSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId,
            type: "line",
            x: 0,
            y: 0,
            width: 50,
            height: 50,
            points: [0, 0, 50, 50],
          },
          res
        );
      }),
      new Promise<SocketAck<ArrowShapeResponseDto>>((res) => {
        adminSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId,
            type: "arrow",
            x: 50,
            y: 0,
            width: 50,
            height: 50,
            points: [0, 0, 50, 50],
          },
          res
        );
      }),
      new Promise<SocketAck<ConnectorShapeResponseDto>>((res) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId,
            type: "connector",
            x: 100,
            y: 0,
            width: 50,
            height: 50,
            points: [0, 0, 50, 50],
            connector: {
              sourceShapeId: rectA._id.toString(),
              sourceAnchor: "bottom",
            },
          },
          res
        );
      }),
    ]);

    assert(c1.success && c2.success && c3.success, "All 3 concurrent shape creations must succeed.");
    console.log("  ✓ Test 31–33 Passed: Concurrent creation of Line, Arrow, and Connector succeeded.\n");

    // =========================================================================
    // Test 34: Board Recovery Hydration from MongoDB
    // =========================================================================
    console.log("Test 34: Board Recovery Hydration from MongoDB");
    const allDbShapes = await ShapeModel.find({ canvasId });
    const mappedShapes = allDbShapes.map((s) => ShapeMapper.toResponseDto(s));
    assert(mappedShapes.some((s) => s.type === "line"), "Hydrated shapes must contain line.");
    assert(mappedShapes.some((s) => s.type === "arrow"), "Hydrated shapes must contain arrow.");
    assert(mappedShapes.some((s) => s.type === "connector"), "Hydrated shapes must contain connector.");
    const recoveredConnector = mappedShapes.find((s) => s.type === "connector") as ConnectorShapeResponseDto;
    assert(Boolean(recoveredConnector.points) && recoveredConnector.points.length >= 4, "Connector points must hydrate.");
    console.log("  ✓ Test 34 Passed: All vector shapes hydrated authoritatively from MongoDB.\n");

    // =========================================================================
    // Test 35: Runtime Role Transition (EDITOR -> VIEWER mid-gesture)
    // =========================================================================
    console.log("Test 35: Runtime Role Transition (EDITOR -> VIEWER blocks commit)");
    // Downgrade Charlie (editor) to VIEWER
    await WorkspaceMemberModel.updateOne(
      { workspaceId: workspace._id, userId: editorUser._id },
      { role: WorkspaceRole.VIEWER }
    );

    // Existing socket attempts durable shape:create
    const lateCreateRes = await new Promise<SocketAck<any>>((resolve) => {
      editorSocket.emit(
        SocketEvents.SHAPE_CREATE,
        {
          canvasId,
          type: "connector",
          x: 0,
          y: 0,
          width: 50,
          height: 50,
          points: [0, 0, 50, 50],
        },
        resolve
      );
    });

    assert(lateCreateRes.success === false, "Downgraded user must be rejected with 403 FORBIDDEN.");
    assert(getErrorCode(lateCreateRes.error) === "FORBIDDEN", "Rejection error code must be FORBIDDEN.");
    console.log("  ✓ Test 35 Passed: Runtime EDITOR -> VIEWER downgrade blocks final commit.\n");

    console.log("=========================================================================");
    console.log("  ALL 35 VECTOR TOOLS INTEGRATION TESTS PASSED CLEANLY!");
    console.log("=========================================================================\n");
  } finally {
    ownerSocket.disconnect();
    adminSocket.disconnect();
    editorSocket.disconnect();
    viewerSocket.disconnect();
    await socketServer.close();
    httpServer.close();
    await mongoose.disconnect();
  }
}

runVectorToolsTests().catch((err) => {
  console.error("Vector tools integration tests failed:", err);
  process.exit(1);
});
