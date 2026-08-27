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
  CircleShapeResponseDto,
  EllipseShapeResponseDto,
  TriangleShapeResponseDto,
  PolygonShapeResponseDto,
  StarShapeResponseDto,
} from "@/modules/shape/shape.dto";
import { SocketEvents } from "../socket.events";
import { SocketServer } from "../socket.server";
import {
  CreateShapePayload,
  UpdateShapePayload,
  SocketAck,
  InteractionStartPayload,
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

async function runAdvancedShapesTests(): Promise<void> {
  console.log("Starting Slice 20: Advanced Basic Shapes Integration Tests...\n");

  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB for Slice 20 test fixture setup.");

  // Clear test fixtures
  await Promise.all([
    UserModel.deleteMany({ email: { $regex: /@slice20-test\.com$/ } }),
    WorkspaceModel.deleteMany({ name: { $regex: /Slice 20/ } }),
    WorkspaceMemberModel.deleteMany({}),
    BoardModel.deleteMany({ name: { $regex: /Slice 20/ } }),
    CanvasModel.deleteMany({ name: { $regex: /Slice 20/ } }),
    ShapeModel.deleteMany({}),
    MutationRecordModel.deleteMany({}),
  ]);

  // Seed Users
  const ownerUser = await UserModel.create({
    email: "owner@slice20-test.com",
    password: "Password123!",
    fullName: "Alice Owner",
  });

  const adminUser = await UserModel.create({
    email: "admin@slice20-test.com",
    password: "Password123!",
    fullName: "Bob Admin",
  });

  const editorUser = await UserModel.create({
    email: "editor@slice20-test.com",
    password: "Password123!",
    fullName: "Charlie Editor",
  });

  const viewerUser = await UserModel.create({
    email: "viewer@slice20-test.com",
    password: "Password123!",
    fullName: "Dave Viewer",
  });

  // Seed Workspace & Members
  const workspace = await WorkspaceModel.create({
    name: "Slice 20 Shapes Workspace",
    ownerId: ownerUser._id,
  });

  await WorkspaceMemberModel.create([
    { workspaceId: workspace._id, userId: ownerUser._id, role: WorkspaceRole.OWNER },
    { workspaceId: workspace._id, userId: adminUser._id, role: WorkspaceRole.ADMIN },
    { workspaceId: workspace._id, userId: editorUser._id, role: WorkspaceRole.EDITOR },
    { workspaceId: workspace._id, userId: viewerUser._id, role: WorkspaceRole.VIEWER },
  ]);

  // Seed Board & Canvas
  const board = await BoardModel.create({
    workspaceId: workspace._id,
    name: "Slice 20 Shapes Board",
    createdBy: ownerUser._id,
    collaborationRevision: 1,
  });

  const canvas = await CanvasModel.create({
    boardId: board._id,
    name: "Slice 20 Shapes Canvas",
    order: 1,
    backgroundColor: "#ffffff",
  });

  const boardIdStr = board._id.toString();
  const canvasIdStr = canvas._id.toString();

  // Mint Tokens
  const ownerToken = generateAccessToken({ userId: ownerUser._id.toString(), role: UserRole.USER });
  const adminToken = generateAccessToken({ userId: adminUser._id.toString(), role: UserRole.USER });
  const editorToken = generateAccessToken({ userId: editorUser._id.toString(), role: UserRole.USER });
  const viewerToken = generateAccessToken({ userId: viewerUser._id.toString(), role: UserRole.USER });

  // Start HTTP & Socket.IO server on ephemeral port
  const httpServer = createServer();
  const socketServer = new SocketServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as { port: number }).port;
  const socketUrl = `http://localhost:${port}`;

  const connectClient = async (token: string): Promise<ClientSocket> => {
    return new Promise((resolve, reject) => {
      const client = clientIO(socketUrl, {
        auth: { token },
        transports: ["websocket"],
        reconnection: false,
      });
      client.on("connect", () => resolve(client));
      client.on("connect_error", (err) => reject(err));
    });
  };

  const ownerSocket = await connectClient(ownerToken);
  const adminSocket = await connectClient(adminToken);
  const editorSocket = await connectClient(editorToken);
  const viewerSocket = await connectClient(viewerToken);

  // Join board rooms
  for (const s of [ownerSocket, adminSocket, editorSocket, viewerSocket]) {
    await new Promise<void>((resolve) => {
      s.emit(SocketEvents.BOARD_JOIN, { boardId: boardIdStr }, () => resolve());
    });
  }

  let passedTests = 0;
  const runTest = async (name: string, fn: () => Promise<void>): Promise<void> => {
    try {
      await fn();
      passedTests++;
      console.log(`  ✓ ${name}`);
    } catch (err) {
      console.error(`  ✗ ${name}`);
      throw err;
    }
  };

  try {
    // ----------------------------------------------------
    // RBAC CREATION TESTS
    // ----------------------------------------------------
    await runTest("1. OWNER can create circle shape", async () => {
      const ack = await new Promise<SocketAck<CircleShapeResponseDto>>((resolve) => {
        ownerSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "circle",
            x: 100,
            y: 100,
            width: 150,
            height: 150,
            style: { fill: "#3b82f6", stroke: "#1d4ed8", strokeWidth: 2, opacity: 1 },
          },
          resolve
        );
      });
      assert(ack.success === true, "Owner circle creation should succeed");
      assert(ack.data?.type === "circle", "Shape type must be circle");
      assert(ack.data?.width === 150, "Width must be 150");
    });

    await runTest("2. ADMIN can create circle shape", async () => {
      const ack = await new Promise<SocketAck<CircleShapeResponseDto>>((resolve) => {
        adminSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "circle",
            x: 200,
            y: 200,
            width: 120,
            height: 120,
            style: { fill: "#10b981", stroke: "#047857", strokeWidth: 2, opacity: 1 },
          },
          resolve
        );
      });
      assert(ack.success === true, "Admin circle creation should succeed");
      assert(ack.data?.type === "circle", "Shape type must be circle");
    });

    await runTest("3. EDITOR can create circle shape", async () => {
      const ack = await new Promise<SocketAck<CircleShapeResponseDto>>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "circle",
            x: 300,
            y: 300,
            width: 100,
            height: 100,
            style: { fill: "#f59e0b", stroke: "#b45309", strokeWidth: 2, opacity: 1 },
          },
          resolve
        );
      });
      assert(ack.success === true, "Editor circle creation should succeed");
      assert(ack.data?.type === "circle", "Shape type must be circle");
    });

    await runTest("4. VIEWER cannot create circle shape (403 FORBIDDEN)", async () => {
      const ack = await new Promise<SocketAck<CircleShapeResponseDto>>((resolve) => {
        viewerSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "circle",
            x: 400,
            y: 400,
            width: 100,
            height: 100,
          },
          resolve
        );
      });
      assert(ack.success === false, "Viewer circle creation must fail");
      assert(getErrorCode(ack.error) === "FORBIDDEN", "Error code must be FORBIDDEN");
    });

    await runTest("5. OWNER can create ellipse shape", async () => {
      const ack = await new Promise<SocketAck<EllipseShapeResponseDto>>((resolve) => {
        ownerSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "ellipse",
            x: 500,
            y: 100,
            width: 200,
            height: 120,
            style: { fill: "#8b5cf6", stroke: "#6d28d9", strokeWidth: 2, opacity: 1 },
          },
          resolve
        );
      });
      assert(ack.success === true, "Owner ellipse creation should succeed");
      assert(ack.data?.type === "ellipse", "Shape type must be ellipse");
      assert(ack.data?.width === 200 && ack.data?.height === 120, "Dimensions must match");
    });

    await runTest("6. EDITOR can create triangle shape", async () => {
      const ack = await new Promise<SocketAck<TriangleShapeResponseDto>>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "triangle",
            x: 600,
            y: 200,
            width: 160,
            height: 140,
            style: { fill: "#ec4899", stroke: "#be185d", strokeWidth: 2, opacity: 1 },
          },
          resolve
        );
      });
      assert(ack.success === true, "Editor triangle creation should succeed");
      assert(ack.data?.type === "triangle", "Shape type must be triangle");
    });

    await runTest("7. EDITOR can create polygon with default sides (5)", async () => {
      const ack = await new Promise<SocketAck<PolygonShapeResponseDto>>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "polygon",
            x: 700,
            y: 300,
            width: 180,
            height: 180,
          },
          resolve
        );
      });
      assert(ack.success === true, "Editor polygon creation should succeed");
      assert(ack.data?.type === "polygon", "Shape type must be polygon");
      assert(ack.data?.shapeConfig?.sides === 5, "Default sides must be 5");
    });

    await runTest("8. EDITOR can create polygon with custom sides (e.g. 6 hexagon)", async () => {
      const ack = await new Promise<SocketAck<PolygonShapeResponseDto>>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "polygon",
            x: 800,
            y: 300,
            width: 180,
            height: 180,
            shapeConfig: { sides: 6 },
          },
          resolve
        );
      });
      assert(ack.success === true, "Editor hexagon creation should succeed");
      assert(ack.data?.shapeConfig?.sides === 6, "Sides must be 6");
    });

    await runTest("9. EDITOR can create star with default points (5) and innerRadiusRatio (0.5)", async () => {
      const ack = await new Promise<SocketAck<StarShapeResponseDto>>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "star",
            x: 900,
            y: 100,
            width: 200,
            height: 200,
          },
          resolve
        );
      });
      assert(ack.success === true, "Editor star creation should succeed");
      assert(ack.data?.type === "star", "Shape type must be star");
      assert(ack.data?.shapeConfig?.points === 5, "Default star points must be 5");
      assert(ack.data?.shapeConfig?.innerRadiusRatio === 0.5, "Default innerRadiusRatio must be 0.5");
    });

    await runTest("10. EDITOR can create star with custom points (8) and innerRadiusRatio (0.35)", async () => {
      const ack = await new Promise<SocketAck<StarShapeResponseDto>>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "star",
            x: 1000,
            y: 100,
            width: 220,
            height: 220,
            shapeConfig: { points: 8, innerRadiusRatio: 0.35 },
          },
          resolve
        );
      });
      assert(ack.success === true, "Editor custom star creation should succeed");
      assert(ack.data?.shapeConfig?.points === 8, "Star points must be 8");
      assert(ack.data?.shapeConfig?.innerRadiusRatio === 0.35, "Inner radius ratio must be 0.35");
    });

    await runTest("11. VIEWER cannot create ellipse / triangle / polygon / star", async () => {
      for (const shapeType of ["ellipse", "triangle", "polygon", "star"]) {
        const ack = await new Promise<SocketAck<any>>((resolve) => {
          viewerSocket.emit(
            SocketEvents.SHAPE_CREATE,
            {
              canvasId: canvasIdStr,
              type: shapeType,
              x: 100,
              y: 100,
              width: 100,
              height: 100,
            },
            resolve
          );
        });
        assert(ack.success === false, `Viewer ${shapeType} creation must fail`);
        assert(getErrorCode(ack.error) === "FORBIDDEN", "Must return FORBIDDEN");
      }
    });

    // ----------------------------------------------------
    // VALIDATION TESTS
    // ----------------------------------------------------
    await runTest("12. Zero or negative width rejected", async () => {
      const ack = await new Promise<SocketAck<any>>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "circle",
            x: 100,
            y: 100,
            width: 0,
            height: 100,
          },
          resolve
        );
      });
      assert(ack.success === false, "Zero width must be rejected");
      assert(getErrorCode(ack.error) === "BAD_REQUEST", "Must be BAD_REQUEST");
    });

    await runTest("13. Zero or negative height rejected", async () => {
      const ack = await new Promise<SocketAck<any>>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "ellipse",
            x: 100,
            y: 100,
            width: 100,
            height: -20,
          },
          resolve
        );
      });
      assert(ack.success === false, "Negative height must be rejected");
      assert(getErrorCode(ack.error) === "BAD_REQUEST", "Must be BAD_REQUEST");
    });

    await runTest("14. NaN or Infinity dimension rejected", async () => {
      const ack = await new Promise<SocketAck<any>>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "triangle",
            x: 100,
            y: 100,
            width: NaN as any,
            height: 100,
          },
          resolve
        );
      });
      assert(ack.success === false, "NaN width must be rejected");
    });

    await runTest("15. Polygon sides < 3 rejected", async () => {
      const ack = await new Promise<SocketAck<any>>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "polygon",
            x: 100,
            y: 100,
            width: 100,
            height: 100,
            shapeConfig: { sides: 2 },
          },
          resolve
        );
      });
      assert(ack.success === false, "Polygon with sides < 3 must be rejected");
      assert(getErrorCode(ack.error) === "BAD_REQUEST", "Must be BAD_REQUEST");
    });

    await runTest("16. Polygon sides > 64 rejected", async () => {
      const ack = await new Promise<SocketAck<any>>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "polygon",
            x: 100,
            y: 100,
            width: 100,
            height: 100,
            shapeConfig: { sides: 65 },
          },
          resolve
        );
      });
      assert(ack.success === false, "Polygon with sides > 64 must be rejected");
      assert(getErrorCode(ack.error) === "BAD_REQUEST", "Must be BAD_REQUEST");
    });

    await runTest("17. Non-integer polygon sides rejected", async () => {
      const ack = await new Promise<SocketAck<any>>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "polygon",
            x: 100,
            y: 100,
            width: 100,
            height: 100,
            shapeConfig: { sides: 5.5 },
          },
          resolve
        );
      });
      assert(ack.success === false, "Non-integer polygon sides must be rejected");
      assert(getErrorCode(ack.error) === "BAD_REQUEST", "Must be BAD_REQUEST");
    });

    await runTest("18. Star points < 3 rejected", async () => {
      const ack = await new Promise<SocketAck<any>>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "star",
            x: 100,
            y: 100,
            width: 100,
            height: 100,
            shapeConfig: { points: 2, innerRadiusRatio: 0.5 },
          },
          resolve
        );
      });
      assert(ack.success === false, "Star with points < 3 must be rejected");
      assert(getErrorCode(ack.error) === "BAD_REQUEST", "Must be BAD_REQUEST");
    });

    await runTest("19. Star points > 64 rejected", async () => {
      const ack = await new Promise<SocketAck<any>>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "star",
            x: 100,
            y: 100,
            width: 100,
            height: 100,
            shapeConfig: { points: 65, innerRadiusRatio: 0.5 },
          },
          resolve
        );
      });
      assert(ack.success === false, "Star with points > 64 must be rejected");
      assert(getErrorCode(ack.error) === "BAD_REQUEST", "Must be BAD_REQUEST");
    });

    await runTest("20. Star innerRadiusRatio < 0.05 rejected", async () => {
      const ack = await new Promise<SocketAck<any>>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "star",
            x: 100,
            y: 100,
            width: 100,
            height: 100,
            shapeConfig: { points: 5, innerRadiusRatio: 0.01 },
          },
          resolve
        );
      });
      assert(ack.success === false, "InnerRadiusRatio < 0.05 must be rejected");
      assert(getErrorCode(ack.error) === "BAD_REQUEST", "Must be BAD_REQUEST");
    });

    await runTest("21. Star innerRadiusRatio > 0.95 rejected", async () => {
      const ack = await new Promise<SocketAck<any>>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "star",
            x: 100,
            y: 100,
            width: 100,
            height: 100,
            shapeConfig: { points: 5, innerRadiusRatio: 0.99 },
          },
          resolve
        );
      });
      assert(ack.success === false, "InnerRadiusRatio > 0.95 must be rejected");
      assert(getErrorCode(ack.error) === "BAD_REQUEST", "Must be BAD_REQUEST");
    });

    // ----------------------------------------------------
    // OCC & VERSIONING TESTS
    // ----------------------------------------------------
    let testStarId = "";
    let testStarVersion = 1;

    await runTest("22. Valid update on star increments Shape.version", async () => {
      // Create star
      const createAck = await new Promise<SocketAck<StarShapeResponseDto>>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "star",
            x: 100,
            y: 100,
            width: 150,
            height: 150,
            shapeConfig: { points: 5, innerRadiusRatio: 0.5 },
          },
          resolve
        );
      });
      assert(createAck.success === true, "Star create must succeed");
      testStarId = createAck.data!.id;
      testStarVersion = createAck.data!.version;

      const updateAck = await new Promise<SocketAck<StarShapeResponseDto>>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_UPDATE,
          {
            shapeId: testStarId,
            expectedVersion: testStarVersion,
            data: {
              width: 180,
              height: 180,
              shapeConfig: { points: 6, innerRadiusRatio: 0.4 },
            },
          },
          resolve
        );
      });
      assert(updateAck.success === true, "Update star must succeed");
      assert(updateAck.data?.version === testStarVersion + 1, "Version must increment by 1");
      assert(updateAck.data?.shapeConfig?.points === 6, "Points must update to 6");
      assert(updateAck.data?.shapeConfig?.innerRadiusRatio === 0.4, "InnerRadiusRatio must update to 0.4");
      testStarVersion = updateAck.data!.version;
    });

    await runTest("23. Stale expectedVersion returns 409 CONFLICT", async () => {
      const staleAck = await new Promise<SocketAck<any>>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_UPDATE,
          {
            shapeId: testStarId,
            expectedVersion: testStarVersion - 1, // Stale version
            data: {
              width: 250,
            },
          },
          resolve
        );
      });
      assert(staleAck.success === false, "Stale update must fail");
      assert(getErrorCode(staleAck.error) === "CONFLICT", "Error code must be CONFLICT");
    });

    // ----------------------------------------------------
    // COLLABORATION REVISION & MUTATION RECORD
    // ----------------------------------------------------
    await runTest("24. collaborationRevision increments and MutationRecord created for durable shape", async () => {
      const boardBefore = await BoardModel.findById(board._id);
      const revisionBefore = boardBefore?.collaborationRevision ?? 0;
      const mutationId = crypto.randomUUID();

      const createAck = await new Promise<SocketAck<PolygonShapeResponseDto>>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            mutationId,
            type: "polygon",
            x: 200,
            y: 200,
            width: 150,
            height: 150,
            shapeConfig: { sides: 7 },
          },
          resolve
        );
      });
      assert(createAck.success === true, "Polygon create must succeed");

      const boardAfter = await BoardModel.findById(board._id);
      assert(
        (boardAfter?.collaborationRevision ?? 0) === revisionBefore + 1,
        "collaborationRevision must increment by 1"
      );

      const mutationRecord = await MutationRecordModel.findOne({ mutationId });
      assert(Boolean(mutationRecord), "MutationRecord must be persisted");
      assert(mutationRecord?.status === "completed", "MutationRecord status must be completed");
    });

    // ----------------------------------------------------
    // EPHEMERAL PURITY
    // ----------------------------------------------------
    await runTest("25. Ephemeral interaction produces 0 DB writes and 0 revision increments", async () => {
      const shapeCountBefore = await ShapeModel.countDocuments();
      const boardBefore = await BoardModel.findById(board._id);
      const revisionBefore = boardBefore?.collaborationRevision ?? 0;

      // Send ephemeral interaction:start
      await new Promise<void>((resolve) => {
        editorSocket.emit(
          SocketEvents.INTERACTION_START,
          {
            boardId: boardIdStr,
            type: "drawing",
            targets: [{ type: "shape", id: "temp-shape-id" }],
          } as InteractionStartPayload,
          () => resolve()
        );
      });

      const shapeCountAfter = await ShapeModel.countDocuments();
      const boardAfter = await BoardModel.findById(board._id);
      const revisionAfter = boardAfter?.collaborationRevision ?? 0;

      assert(shapeCountAfter === shapeCountBefore, "Shape count must remain unchanged during drawing");
      assert(revisionAfter === revisionBefore, "Collaboration revision must not increment during drawing");
    });

    // ----------------------------------------------------
    // RUNTIME ROLE DOWNGRADE
    // ----------------------------------------------------
    await runTest("26. Role downgrade from EDITOR to VIEWER rejects final commit (403)", async () => {
      // Downgrade Charlie to VIEWER in DB
      await WorkspaceMemberModel.updateOne(
        { workspaceId: workspace._id, userId: editorUser._id },
        { role: WorkspaceRole.VIEWER }
      );

      const ack = await new Promise<SocketAck<any>>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "circle",
            x: 50,
            y: 50,
            width: 100,
            height: 100,
          },
          resolve
        );
      });

      assert(ack.success === false, "Downgraded editor create must fail");
      assert(getErrorCode(ack.error) === "FORBIDDEN", "Must be rejected with 403 FORBIDDEN");

      // Restore Charlie to EDITOR
      await WorkspaceMemberModel.updateOne(
        { workspaceId: workspace._id, userId: editorUser._id },
        { role: WorkspaceRole.EDITOR }
      );
    });

    // ----------------------------------------------------
    // CONCURRENCY TEST
    // ----------------------------------------------------
    await runTest("27. Multiple users can create different advanced shapes concurrently", async () => {
      const [resAdmin, resOwner] = await Promise.all([
        new Promise<SocketAck<any>>((resolve) => {
          adminSocket.emit(
            SocketEvents.SHAPE_CREATE,
            {
              canvasId: canvasIdStr,
              type: "polygon",
              x: 10,
              y: 10,
              width: 80,
              height: 80,
              shapeConfig: { sides: 8 },
            },
            resolve
          );
        }),
        new Promise<SocketAck<any>>((resolve) => {
          ownerSocket.emit(
            SocketEvents.SHAPE_CREATE,
            {
              canvasId: canvasIdStr,
              type: "star",
              x: 150,
              y: 150,
              width: 90,
              height: 90,
              shapeConfig: { points: 6, innerRadiusRatio: 0.4 },
            },
            resolve
          );
        }),
      ]);

      assert(resAdmin.success === true, "Admin octagon creation should succeed");
      assert(resOwner.success === true, "Owner star creation should succeed");
      assert(resAdmin.data?.type === "polygon", "Admin shape must be polygon");
      assert(resOwner.data?.type === "star", "Owner shape must be star");
    });

    // ----------------------------------------------------
    // AUTHORITATIVE RECOVERY HYDRATION TEST
    // ----------------------------------------------------
    await runTest("28. Board/canvas hydration restores all five advanced shape types from MongoDB", async () => {
      const allShapes = await ShapeModel.find({ canvasId: canvas._id });
      const dtos = allShapes.map((s) => ShapeMapper.toResponseDto(s));

      const typesFound = new Set(dtos.map((d) => d.type));
      assert(typesFound.has("circle"), "Hydration must include circle");
      assert(typesFound.has("ellipse"), "Hydration must include ellipse");
      assert(typesFound.has("triangle"), "Hydration must include triangle");
      assert(typesFound.has("polygon"), "Hydration must include polygon");
      assert(typesFound.has("star"), "Hydration must include star");

      const polygonDto = dtos.find((d) => d.type === "polygon") as PolygonShapeResponseDto;
      assert(typeof polygonDto.shapeConfig?.sides === "number", "Polygon must preserve sides");

      const starDto = dtos.find((d) => d.type === "star") as StarShapeResponseDto;
      assert(typeof starDto.shapeConfig?.points === "number", "Star must preserve points");
      assert(typeof starDto.shapeConfig?.innerRadiusRatio === "number", "Star must preserve innerRadiusRatio");
    });

    console.log(`\nAll ${passedTests} Slice 20 integration tests passed successfully!`);
  } finally {
    ownerSocket.disconnect();
    adminSocket.disconnect();
    editorSocket.disconnect();
    viewerSocket.disconnect();

    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await mongoose.disconnect();
  }
}

runAdvancedShapesTests().catch((err) => {
  console.error("Slice 20 Integration Tests Failed:", err);
  process.exit(1);
});
