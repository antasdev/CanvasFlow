/**
 * Slice 23: Alignment, Distribution & Smart Guides Integration Tests
 *
 * Verifies all 22 minimum required test cases:
 * 1. EDITOR can align
 * 2. ADMIN can align
 * 3. OWNER can align
 * 4. VIEWER receives 403
 * 5. Align requires >= 2 shapes
 * 6. Invalid shape IDs rejected
 * 7. Duplicate IDs rejected
 * 8. Different canvas rejected
 * 9. OCC mismatch returns 409
 * 10. Atomic rollback on failure
 * 11. Shape versions increment
 * 12. collaborationRevision increments
 * 13. MutationRecord created
 * 14. Other users receive broadcast (shape:aligned)
 * 15. Creator receives authoritative ACK
 * 16. Horizontal distribution
 * 17. Vertical distribution
 * 18. Distribution requires >= 3
 * 19. Concurrent conflicting alignment
 * 20. Group child remains valid
 * 21. Nested group alignment
 * 22. Connector references remain valid
 */

import crypto from "crypto";
import { createServer } from "http";
import assert from "assert";
import mongoose, { Types } from "mongoose";
import { io as clientIO, Socket as ClientSocket } from "socket.io-client";

import env from "@/config/env";
import { SocketServer } from "@/socket/socket.server";
import { SocketEvents } from "@/socket/socket.events";
import {
  CreateShapePayload,
  SocketAck,
  ShapeResponseDto,
  AlignShapesPayload,
  AlignShapesAckData,
  AlignShapesBroadcastPayload,
  DistributeShapesPayload,
  DistributeShapesAckData,
  DistributeShapesBroadcastPayload,
} from "@/socket/socket.types";

import { UserModel } from "@/modules/user/user.model";
import { WorkspaceModel } from "@/modules/workspace/workspace.model";
import { WorkspaceMemberModel } from "@/modules/workspace/workspaceMember.model";
import { WorkspaceRole } from "@/modules/workspace/workspace.types";
import { BoardModel } from "@/modules/board/board.model";
import { CanvasModel } from "@/modules/canvas/canvas.model";
import { ShapeModel } from "@/modules/shape/shape.model";
import { ShapeType } from "@/modules/shape/shape.types";
import { MutationRecordModel } from "@/modules/mutation/mutation.model";
import { generateAccessToken } from "@/modules/auth/auth.tokens";
import { UserRole } from "@/modules/user/user.types";
import { SocketAckError } from "@/socket/socket.types";

function getErrorCode(err?: SocketAckError | string): string | undefined {
  if (!err || typeof err === "string") return undefined;
  return err.code;
}

function getErrorMessage(err?: SocketAckError | string): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  return err.message;
}

async function runAlignmentTestSuite(): Promise<void> {
  console.log("Starting Slice 23: Alignment & Distribution Integration Tests...\n");

  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB for Slice 23 test fixture setup.");

  // Clear test fixtures
  await Promise.all([
    UserModel.deleteMany({ email: { $regex: /@slice23-align-test\.com$/ } }),
    WorkspaceModel.deleteMany({ name: { $regex: /Slice 23/ } }),
    WorkspaceMemberModel.deleteMany({}),
    BoardModel.deleteMany({ name: { $regex: /Slice 23/ } }),
    CanvasModel.deleteMany({ name: { $regex: /Slice 23/ } }),
    ShapeModel.deleteMany({}),
    MutationRecordModel.deleteMany({}),
  ]);

  // Seed Users
  const ownerUser = await UserModel.create({
    email: "owner@slice23-align-test.com",
    password: "Password123!",
    fullName: "Alice Owner",
  });
  const adminUser = await UserModel.create({
    email: "admin@slice23-align-test.com",
    password: "Password123!",
    fullName: "Bob Admin",
  });
  const editorUser = await UserModel.create({
    email: "editor@slice23-align-test.com",
    password: "Password123!",
    fullName: "Charlie Editor",
  });
  const viewerUser = await UserModel.create({
    email: "viewer@slice23-align-test.com",
    password: "Password123!",
    fullName: "Dave Viewer",
  });

  // Seed Workspace
  const workspace = await WorkspaceModel.create({
    name: "Slice 23 Test Workspace",
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
    name: "Slice 23 Test Board",
    workspaceId: workspace._id,
    createdBy: ownerUser._id,
    collaborationRevision: 1,
  });

  const canvas = await CanvasModel.create({
    name: "Slice 23 Test Canvas",
    boardId: board._id,
    order: 1,
  });

  const canvas2 = await CanvasModel.create({
    name: "Slice 23 Foreign Canvas",
    boardId: board._id,
    order: 2,
  });

  // Tokens
  const ownerToken = generateAccessToken({ userId: ownerUser._id.toString(), role: UserRole.USER });
  const adminToken = generateAccessToken({ userId: adminUser._id.toString(), role: UserRole.USER });
  const editorToken = generateAccessToken({ userId: editorUser._id.toString(), role: UserRole.USER });
  const viewerToken = generateAccessToken({ userId: viewerUser._id.toString(), role: UserRole.USER });

  // Start HTTP & Socket server on dynamic port
  const httpServer = createServer();
  const socketServer = new SocketServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as { port: number }).port;
  const serverUrl = `http://localhost:${port}`;
  console.log(`Socket server started on port ${port} for test execution.`);

  function createClient(token: string): ClientSocket {
    return clientIO(serverUrl, {
      auth: { token },
      transports: ["websocket"],
      forceNew: true,
    });
  }

  const ownerSocket = createClient(ownerToken);
  const adminSocket = createClient(adminToken);
  const editorSocket = createClient(editorToken);
  const viewerSocket = createClient(viewerToken);

  await Promise.all([
    new Promise<void>((resolve) => ownerSocket.on("connect", resolve)),
    new Promise<void>((resolve) => adminSocket.on("connect", resolve)),
    new Promise<void>((resolve) => editorSocket.on("connect", resolve)),
    new Promise<void>((resolve) => viewerSocket.on("connect", resolve)),
  ]);

  // Join board room
  await Promise.all([
    new Promise<void>((resolve) => ownerSocket.emit(SocketEvents.BOARD_JOIN, { boardId: board._id.toString() }, resolve)),
    new Promise<void>((resolve) => adminSocket.emit(SocketEvents.BOARD_JOIN, { boardId: board._id.toString() }, resolve)),
    new Promise<void>((resolve) => editorSocket.emit(SocketEvents.BOARD_JOIN, { boardId: board._id.toString() }, resolve)),
    new Promise<void>((resolve) => viewerSocket.emit(SocketEvents.BOARD_JOIN, { boardId: board._id.toString() }, resolve)),
  ]);

  // Helper to create shapes
  async function createShape(
    socket: ClientSocket,
    canvasId: string,
    x: number,
    y: number,
    width = 100,
    height = 50,
    type = "rectangle",
    parentId?: string | null
  ): Promise<ShapeResponseDto> {
    return new Promise((resolve, reject) => {
      const payload: CreateShapePayload = {
        canvasId,
        type: type as any,
        x,
        y,
        width,
        height,
        rotation: 0,
        mutationId: crypto.randomUUID(),
        parentId: parentId ?? undefined,
      };
      socket.emit(SocketEvents.SHAPE_CREATE, payload, (ack: SocketAck<ShapeResponseDto>) => {
        if (!ack.success) {
          reject(new Error(getErrorMessage(ack.error)));
        } else {
          resolve(ack.data!);
        }
      });
    });
  }

  let passedTests = 0;

  try {
    // ----------------------------------------------------
    // Test 1: EDITOR can align shapes
    // ----------------------------------------------------
    {
      const s1 = await createShape(editorSocket, canvas._id.toString(), 50, 100, 80, 40);
      const s2 = await createShape(editorSocket, canvas._id.toString(), 200, 150, 100, 60);

      const ack: SocketAck<AlignShapesAckData> = await new Promise((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_ALIGN,
          {
            canvasId: canvas._id.toString(),
            shapeIds: [s1.id, s2.id],
            alignment: "left",
            expectedVersions: { [s1.id]: s1.version, [s2.id]: s2.version },
            mutationId: crypto.randomUUID(),
          },
          resolve
        );
      });

      assert.strictEqual(ack.success, true, "Editor should successfully align shapes.");
      assert.strictEqual(ack.data?.shapes.length, 2);
      // Min X is 50, both should have local x=50
      assert.strictEqual(ack.data?.shapes.find((s) => s.id === s1.id)?.x, 50);
      assert.strictEqual(ack.data?.shapes.find((s) => s.id === s2.id)?.x, 50);
      console.log("✓ Test 1 Passed: EDITOR can align shapes");
      passedTests++;
    }

    // ----------------------------------------------------
    // Test 2: ADMIN can align shapes
    // ----------------------------------------------------
    {
      const s1 = await createShape(adminSocket, canvas._id.toString(), 100, 50, 60, 40);
      const s2 = await createShape(adminSocket, canvas._id.toString(), 100, 200, 60, 40);

      const ack: SocketAck<AlignShapesAckData> = await new Promise((resolve) => {
        adminSocket.emit(
          SocketEvents.SHAPE_ALIGN,
          {
            canvasId: canvas._id.toString(),
            shapeIds: [s1.id, s2.id],
            alignment: "top",
            expectedVersions: { [s1.id]: s1.version, [s2.id]: s2.version },
            mutationId: crypto.randomUUID(),
          },
          resolve
        );
      });

      assert.strictEqual(ack.success, true, "Admin should successfully align shapes.");
      assert.strictEqual(ack.data?.shapes.find((s) => s.id === s2.id)?.y, 50);
      console.log("✓ Test 2 Passed: ADMIN can align shapes");
      passedTests++;
    }

    // ----------------------------------------------------
    // Test 3: OWNER can align shapes
    // ----------------------------------------------------
    {
      const s1 = await createShape(ownerSocket, canvas._id.toString(), 20, 20, 60, 40);
      const s2 = await createShape(ownerSocket, canvas._id.toString(), 150, 20, 60, 40);

      const ack: SocketAck<AlignShapesAckData> = await new Promise((resolve) => {
        ownerSocket.emit(
          SocketEvents.SHAPE_ALIGN,
          {
            canvasId: canvas._id.toString(),
            shapeIds: [s1.id, s2.id],
            alignment: "bottom",
            expectedVersions: { [s1.id]: s1.version, [s2.id]: s2.version },
            mutationId: crypto.randomUUID(),
          },
          resolve
        );
      });

      assert.strictEqual(ack.success, true, "Owner should successfully align shapes.");
      console.log("✓ Test 3 Passed: OWNER can align shapes");
      passedTests++;
    }

    // ----------------------------------------------------
    // Test 4: VIEWER receives 403 FORBIDDEN
    // ----------------------------------------------------
    {
      const s1 = await createShape(ownerSocket, canvas._id.toString(), 10, 10, 50, 50);
      const s2 = await createShape(ownerSocket, canvas._id.toString(), 100, 10, 50, 50);

      const ack: SocketAck<AlignShapesAckData> = await new Promise((resolve) => {
        viewerSocket.emit(
          SocketEvents.SHAPE_ALIGN,
          {
            canvasId: canvas._id.toString(),
            shapeIds: [s1.id, s2.id],
            alignment: "left",
            expectedVersions: { [s1.id]: s1.version, [s2.id]: s2.version },
            mutationId: crypto.randomUUID(),
          },
          resolve
        );
      });

      assert.strictEqual(ack.success, false, "Viewer should be rejected.");
      assert.strictEqual(getErrorCode(ack.error), "FORBIDDEN");
      console.log("✓ Test 4 Passed: VIEWER receives 403");
      passedTests++;
    }

    // ----------------------------------------------------
    // Test 5: Align requires at least 2 shapes
    // ----------------------------------------------------
    {
      const s1 = await createShape(editorSocket, canvas._id.toString(), 10, 10, 50, 50);

      const ack: SocketAck<AlignShapesAckData> = await new Promise((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_ALIGN,
          {
            canvasId: canvas._id.toString(),
            shapeIds: [s1.id],
            alignment: "left",
            mutationId: crypto.randomUUID(),
          },
          resolve
        );
      });

      assert.strictEqual(ack.success, false, "Align should reject < 2 shapes.");
      assert.strictEqual(getErrorCode(ack.error), "BAD_REQUEST");
      console.log("✓ Test 5 Passed: Align requires >= 2 shapes");
      passedTests++;
    }

    // ----------------------------------------------------
    // Test 6: Invalid shape IDs rejected
    // ----------------------------------------------------
    {
      const s1 = await createShape(editorSocket, canvas._id.toString(), 10, 10, 50, 50);
      const fakeId = new Types.ObjectId().toString();

      const ack: SocketAck<AlignShapesAckData> = await new Promise((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_ALIGN,
          {
            canvasId: canvas._id.toString(),
            shapeIds: [s1.id, fakeId],
            alignment: "left",
            mutationId: crypto.randomUUID(),
          },
          resolve
        );
      });

      assert.strictEqual(ack.success, false, "Invalid shape ID should be rejected.");
      assert.strictEqual(getErrorCode(ack.error), "NOT_FOUND");
      console.log("✓ Test 6 Passed: Invalid shape IDs rejected");
      passedTests++;
    }

    // ----------------------------------------------------
    // Test 7: Duplicate shape IDs rejected
    // ----------------------------------------------------
    {
      const s1 = await createShape(editorSocket, canvas._id.toString(), 10, 10, 50, 50);

      const ack: SocketAck<AlignShapesAckData> = await new Promise((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_ALIGN,
          {
            canvasId: canvas._id.toString(),
            shapeIds: [s1.id, s1.id],
            alignment: "left",
            mutationId: crypto.randomUUID(),
          },
          resolve
        );
      });

      assert.strictEqual(ack.success, false, "Duplicate shape IDs should be rejected.");
      assert.strictEqual(getErrorCode(ack.error), "BAD_REQUEST");
      console.log("✓ Test 7 Passed: Duplicate IDs rejected");
      passedTests++;
    }

    // ----------------------------------------------------
    // Test 8: Different canvas rejected
    // ----------------------------------------------------
    {
      const s1 = await createShape(editorSocket, canvas._id.toString(), 10, 10, 50, 50);
      const sForeign = await createShape(editorSocket, canvas2._id.toString(), 100, 10, 50, 50);

      const ack: SocketAck<AlignShapesAckData> = await new Promise((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_ALIGN,
          {
            canvasId: canvas._id.toString(),
            shapeIds: [s1.id, sForeign.id],
            alignment: "left",
            mutationId: crypto.randomUUID(),
          },
          resolve
        );
      });

      assert.strictEqual(ack.success, false, "Shapes from different canvas must be rejected.");
      assert.strictEqual(getErrorCode(ack.error), "BAD_REQUEST");
      console.log("✓ Test 8 Passed: Different canvas rejected");
      passedTests++;
    }

    // ----------------------------------------------------
    // Test 9: OCC mismatch returns 409 CONFLICT
    // ----------------------------------------------------
    {
      const s1 = await createShape(editorSocket, canvas._id.toString(), 10, 10, 50, 50);
      const s2 = await createShape(editorSocket, canvas._id.toString(), 100, 10, 50, 50);

      const ack: SocketAck<AlignShapesAckData> = await new Promise((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_ALIGN,
          {
            canvasId: canvas._id.toString(),
            shapeIds: [s1.id, s2.id],
            alignment: "left",
            expectedVersions: { [s1.id]: s1.version, [s2.id]: 9999 }, // stale version
            mutationId: crypto.randomUUID(),
          },
          resolve
        );
      });

      assert.strictEqual(ack.success, false, "OCC mismatch should be rejected.");
      assert.strictEqual(getErrorCode(ack.error), "CONFLICT");
      console.log("✓ Test 9 Passed: OCC mismatch returns 409");
      passedTests++;
    }

    // ----------------------------------------------------
    // Test 10: Atomic rollback on failure (no partial state)
    // ----------------------------------------------------
    {
      const s1 = await createShape(editorSocket, canvas._id.toString(), 15, 25, 50, 50);
      const s2 = await createShape(editorSocket, canvas._id.toString(), 120, 25, 50, 50);

      // Trigger OCC conflict on s2
      await new Promise((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_ALIGN,
          {
            canvasId: canvas._id.toString(),
            shapeIds: [s1.id, s2.id],
            alignment: "left",
            expectedVersions: { [s1.id]: s1.version, [s2.id]: 9999 },
            mutationId: crypto.randomUUID(),
          },
          resolve
        );
      });

      // Verify s1 was NOT updated in DB
      const s1Doc = await ShapeModel.findById(s1.id);
      assert.strictEqual(s1Doc?.x, 15, "s1 should not have changed position after aborted transaction.");
      assert.strictEqual(s1Doc?.version, s1.version, "s1 version should remain unchanged.");
      console.log("✓ Test 10 Passed: Atomic rollback on failure");
      passedTests++;
    }

    // ----------------------------------------------------
    // Test 11: Shape versions increment
    // ----------------------------------------------------
    {
      const s1 = await createShape(editorSocket, canvas._id.toString(), 10, 10, 50, 50);
      const s2 = await createShape(editorSocket, canvas._id.toString(), 80, 10, 50, 50);

      const ack: SocketAck<AlignShapesAckData> = await new Promise((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_ALIGN,
          {
            canvasId: canvas._id.toString(),
            shapeIds: [s1.id, s2.id],
            alignment: "left",
            expectedVersions: { [s1.id]: s1.version, [s2.id]: s2.version },
            mutationId: crypto.randomUUID(),
          },
          resolve
        );
      });

      assert.strictEqual(ack.success, true);
      const s1Doc = await ShapeModel.findById(s1.id);
      const s2Doc = await ShapeModel.findById(s2.id);
      assert.strictEqual(s1Doc?.version, s1.version + 1);
      assert.strictEqual(s2Doc?.version, s2.version + 1);
      console.log("✓ Test 11 Passed: Shape versions increment");
      passedTests++;
    }

    // ----------------------------------------------------
    // Test 12: collaborationRevision increments
    // ----------------------------------------------------
    {
      const s1 = await createShape(editorSocket, canvas._id.toString(), 10, 10, 50, 50);
      const s2 = await createShape(editorSocket, canvas._id.toString(), 80, 10, 50, 50);

      const boardBefore = await BoardModel.findById(board._id);
      const revBefore = boardBefore?.collaborationRevision ?? 0;

      await new Promise((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_ALIGN,
          {
            canvasId: canvas._id.toString(),
            shapeIds: [s1.id, s2.id],
            alignment: "left",
            mutationId: crypto.randomUUID(),
          },
          resolve
        );
      });

      const boardAfter = await BoardModel.findById(board._id);
      assert.strictEqual(boardAfter?.collaborationRevision, revBefore + 1);
      console.log("✓ Test 12 Passed: collaborationRevision increments");
      passedTests++;
    }

    // ----------------------------------------------------
    // Test 13: MutationRecord created
    // ----------------------------------------------------
    {
      const mutationId = crypto.randomUUID();
      const s1 = await createShape(editorSocket, canvas._id.toString(), 10, 10, 50, 50);
      const s2 = await createShape(editorSocket, canvas._id.toString(), 80, 10, 50, 50);

      await new Promise((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_ALIGN,
          {
            canvasId: canvas._id.toString(),
            shapeIds: [s1.id, s2.id],
            alignment: "right",
            mutationId,
          },
          resolve
        );
      });

      const record = await MutationRecordModel.findOne({ mutationId });
      assert.ok(record, "MutationRecord must be created.");
      assert.strictEqual(record?.operation, "shape:align");
      assert.strictEqual(record?.status, "completed");
      console.log("✓ Test 13 Passed: MutationRecord created");
      passedTests++;
    }

    // ----------------------------------------------------
    // Test 14: Other users receive broadcast (shape:aligned)
    // ----------------------------------------------------
    {
      const s1 = await createShape(editorSocket, canvas._id.toString(), 10, 10, 50, 50);
      const s2 = await createShape(editorSocket, canvas._id.toString(), 80, 10, 50, 50);

      const broadcastPromise = new Promise<AlignShapesBroadcastPayload>((resolve) => {
        adminSocket.once(SocketEvents.SHAPE_ALIGNED, resolve);
      });

      await new Promise((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_ALIGN,
          {
            canvasId: canvas._id.toString(),
            shapeIds: [s1.id, s2.id],
            alignment: "center-horizontal",
            mutationId: crypto.randomUUID(),
          },
          resolve
        );
      });

      const broadcast = await broadcastPromise;
      assert.ok(broadcast.meta);
      assert.strictEqual(broadcast.shapes.length, 2);
      console.log("✓ Test 14 Passed: Other users receive broadcast");
      passedTests++;
    }

    // ----------------------------------------------------
    // Test 15: Creator receives authoritative ACK
    // ----------------------------------------------------
    {
      const s1 = await createShape(editorSocket, canvas._id.toString(), 20, 20, 50, 50);
      const s2 = await createShape(editorSocket, canvas._id.toString(), 80, 20, 50, 50);

      const ack: SocketAck<AlignShapesAckData> = await new Promise((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_ALIGN,
          {
            canvasId: canvas._id.toString(),
            shapeIds: [s1.id, s2.id],
            alignment: "center-vertical",
            mutationId: crypto.randomUUID(),
          },
          resolve
        );
      });

      assert.strictEqual(ack.success, true);
      assert.ok(ack.data?.shapes);
      assert.strictEqual(ack.data?.shapes.length, 2);
      console.log("✓ Test 15 Passed: Creator receives authoritative ACK");
      passedTests++;
    }

    // ----------------------------------------------------
    // Test 16: Horizontal distribution
    // ----------------------------------------------------
    {
      // 3 shapes: 0, 70, 200 (widths: 40, 40, 40) -> total span 240, widths 120, total gap 120 -> gap 60
      const s1 = await createShape(editorSocket, canvas._id.toString(), 0, 100, 40, 40);
      const s2 = await createShape(editorSocket, canvas._id.toString(), 70, 100, 40, 40);
      const s3 = await createShape(editorSocket, canvas._id.toString(), 200, 100, 40, 40);

      const ack: SocketAck<DistributeShapesAckData> = await new Promise((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_DISTRIBUTE,
          {
            canvasId: canvas._id.toString(),
            shapeIds: [s1.id, s2.id, s3.id],
            axis: "horizontal",
            mutationId: crypto.randomUUID(),
          },
          resolve
        );
      });

      assert.strictEqual(ack.success, true);
      const s1Updated = ack.data?.shapes.find((s) => s.id === s1.id);
      const s2Updated = ack.data?.shapes.find((s) => s.id === s2.id);
      const s3Updated = ack.data?.shapes.find((s) => s.id === s3.id);
      assert.strictEqual(s1Updated?.x, 0);
      assert.strictEqual(s2Updated?.x, 100);
      assert.strictEqual(s3Updated?.x, 200);
      console.log("✓ Test 16 Passed: Horizontal distribution");
      passedTests++;
    }

    // ----------------------------------------------------
    // Test 17: Vertical distribution
    // ----------------------------------------------------
    {
      const s1 = await createShape(editorSocket, canvas._id.toString(), 100, 0, 40, 40);
      const s2 = await createShape(editorSocket, canvas._id.toString(), 100, 50, 40, 40);
      const s3 = await createShape(editorSocket, canvas._id.toString(), 100, 200, 40, 40);

      const ack: SocketAck<DistributeShapesAckData> = await new Promise((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_DISTRIBUTE,
          {
            canvasId: canvas._id.toString(),
            shapeIds: [s1.id, s2.id, s3.id],
            axis: "vertical",
            mutationId: crypto.randomUUID(),
          },
          resolve
        );
      });

      assert.strictEqual(ack.success, true);
      const s2Updated = ack.data?.shapes.find((s) => s.id === s2.id);
      assert.strictEqual(s2Updated?.y, 100);
      console.log("✓ Test 17 Passed: Vertical distribution");
      passedTests++;
    }

    // ----------------------------------------------------
    // Test 18: Distribution requires >= 3 shapes
    // ----------------------------------------------------
    {
      const s1 = await createShape(editorSocket, canvas._id.toString(), 10, 10, 40, 40);
      const s2 = await createShape(editorSocket, canvas._id.toString(), 100, 10, 40, 40);

      const ack: SocketAck<DistributeShapesAckData> = await new Promise((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_DISTRIBUTE,
          {
            canvasId: canvas._id.toString(),
            shapeIds: [s1.id, s2.id],
            axis: "horizontal",
            mutationId: crypto.randomUUID(),
          },
          resolve
        );
      });

      assert.strictEqual(ack.success, false, "Distribution requires at least 3 shapes.");
      assert.strictEqual(getErrorCode(ack.error), "BAD_REQUEST");
      console.log("✓ Test 18 Passed: Distribution requires >= 3");
      passedTests++;
    }

    // ----------------------------------------------------
    // Test 19: Concurrent conflicting alignment (OCC)
    // ----------------------------------------------------
    {
      const s1 = await createShape(editorSocket, canvas._id.toString(), 10, 10, 50, 50);
      const s2 = await createShape(editorSocket, canvas._id.toString(), 100, 10, 50, 50);

      // Client A and Client B attempt simultaneous alignment with initial version 1
      const [resA, resB] = await Promise.all([
        new Promise<SocketAck<AlignShapesAckData>>((resolve) => {
          editorSocket.emit(
            SocketEvents.SHAPE_ALIGN,
            {
              canvasId: canvas._id.toString(),
              shapeIds: [s1.id, s2.id],
              alignment: "left",
              expectedVersions: { [s1.id]: s1.version, [s2.id]: s2.version },
              mutationId: crypto.randomUUID(),
            },
            resolve
          );
        }),
        new Promise<SocketAck<AlignShapesAckData>>((resolve) => {
          adminSocket.emit(
            SocketEvents.SHAPE_ALIGN,
            {
              canvasId: canvas._id.toString(),
              shapeIds: [s1.id, s2.id],
              alignment: "right",
              expectedVersions: { [s1.id]: s1.version, [s2.id]: s2.version },
              mutationId: crypto.randomUUID(),
            },
            resolve
          );
        }),
      ]);

      const oneSucceeded = (resA.success && !resB.success) || (!resA.success && resB.success);
      assert.strictEqual(oneSucceeded, true, "Exactly one of two concurrent conflicting alignments must succeed.");
      console.log("✓ Test 19 Passed: Concurrent conflicting alignment");
      passedTests++;
    }

    // ----------------------------------------------------
    // Test 20: Group child remains valid after alignment
    // ----------------------------------------------------
    {
      // Create group at (200, 200)
      const grp = await createShape(editorSocket, canvas._id.toString(), 200, 200, 200, 200, "group");
      // Create child at local (20, 20) -> world (220, 220)
      const child = await createShape(editorSocket, canvas._id.toString(), 20, 20, 50, 50, "rectangle", grp.id);
      // Create root shape at world (100, 100)
      const rootS = await createShape(editorSocket, canvas._id.toString(), 100, 100, 50, 50);

      // Align rootS and child to Left (minX is 100 from rootS)
      // child target worldX is 100.
      // parent grp is at x=200, so child localX must become 100 - 200 = -100!
      const ack: SocketAck<AlignShapesAckData> = await new Promise((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_ALIGN,
          {
            canvasId: canvas._id.toString(),
            shapeIds: [rootS.id, child.id],
            alignment: "left",
            mutationId: crypto.randomUUID(),
          },
          resolve
        );
      });

      assert.strictEqual(ack.success, true);
      const childUpdated = ack.data?.shapes.find((s) => s.id === child.id);
      assert.strictEqual(childUpdated?.x, -100, "Child local coordinates must correctly reflect parent offset.");
      assert.strictEqual(childUpdated?.parentId, grp.id, "Child parentId must remain intact.");
      console.log("✓ Test 20 Passed: Group child remains valid");
      passedTests++;
    }

    // ----------------------------------------------------
    // Test 21: Nested group alignment
    // ----------------------------------------------------
    {
      const grpRoot = await createShape(editorSocket, canvas._id.toString(), 100, 100, 300, 300, "group");
      const grpChild = await createShape(editorSocket, canvas._id.toString(), 50, 50, 150, 150, "group", grpRoot.id);
      const leafShape = await createShape(editorSocket, canvas._id.toString(), 10, 10, 40, 40, "rectangle", grpChild.id);
      const otherRoot = await createShape(editorSocket, canvas._id.toString(), 50, 50, 40, 40);

      // leafShape world pos: 100 + 50 + 10 = 160. otherRoot world pos: 50.
      // Align to left (target worldX: 50).
      // leafShape localX in grpChild: targetWorldX(50) - grpRoot.x(100) - grpChild.x(50) = -100!
      const ack: SocketAck<AlignShapesAckData> = await new Promise((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_ALIGN,
          {
            canvasId: canvas._id.toString(),
            shapeIds: [otherRoot.id, leafShape.id],
            alignment: "left",
            mutationId: crypto.randomUUID(),
          },
          resolve
        );
      });

      assert.strictEqual(ack.success, true);
      const leafUpdated = ack.data?.shapes.find((s) => s.id === leafShape.id);
      assert.strictEqual(leafUpdated?.x, -100);
      assert.strictEqual(leafUpdated?.parentId, grpChild.id);
      console.log("✓ Test 21 Passed: Nested group alignment");
      passedTests++;
    }

    // ----------------------------------------------------
    // Test 22: Connector references remain valid
    // ----------------------------------------------------
    {
      const boxA = await createShape(editorSocket, canvas._id.toString(), 100, 100, 80, 80);
      const boxB = await createShape(editorSocket, canvas._id.toString(), 300, 100, 80, 80);

      // Create connector attached to boxA and boxB
      const conn = await new Promise<ShapeResponseDto>((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvas._id.toString(),
            type: "connector",
            x: 180,
            y: 140,
            width: 120,
            height: 1,
            points: [180, 140, 300, 140],
            connector: {
              sourceShapeId: boxA.id,
              sourceAnchor: "right",
              targetShapeId: boxB.id,
              targetAnchor: "left",
            },
            mutationId: crypto.randomUUID(),
          },
          (ack: SocketAck<ShapeResponseDto>) => resolve(ack.data!)
        );
      });

      // Align boxA and boxB to top
      const ack: SocketAck<AlignShapesAckData> = await new Promise((resolve) => {
        editorSocket.emit(
          SocketEvents.SHAPE_ALIGN,
          {
            canvasId: canvas._id.toString(),
            shapeIds: [boxA.id, boxB.id],
            alignment: "top",
            mutationId: crypto.randomUUID(),
          },
          resolve
        );
      });

      assert.strictEqual(ack.success, true);

      // Verify connector in DB still has valid references
      const connDoc = await ShapeModel.findById(conn.id);
      assert.ok(connDoc?.connector);
      assert.strictEqual(connDoc?.connector?.sourceShapeId?.toString(), boxA.id);
      assert.strictEqual(connDoc?.connector?.targetShapeId?.toString(), boxB.id);
      console.log("✓ Test 22 Passed: Connector references remain valid");
      passedTests++;
    }

    console.log(`\nAll ${passedTests}/22 Slice 23 Integration Tests PASSED successfully!`);
  } finally {
    ownerSocket.disconnect();
    adminSocket.disconnect();
    editorSocket.disconnect();
    viewerSocket.disconnect();
    httpServer.close();
    await mongoose.disconnect();
  }
}

runAlignmentTestSuite()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Slice 23 Integration Test Failed:", err);
    process.exit(1);
  });
