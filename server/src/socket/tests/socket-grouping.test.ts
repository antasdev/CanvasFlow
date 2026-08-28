/**
 * Slice 22: Grouping & Ungrouping Integration Tests
 *
 * Verifies:
 * 1. Group 2 shapes successfully
 * 2. Group 3 shapes successfully
 * 3. Group rejected if < 2 shapes
 * 4. Group rejected if shapes belong to different canvases
 * 5. Group rejected if duplicate shape IDs sent
 * 6. Group rejected if any shape ID doesn't exist
 * 7. Group rejected if shapes have different parent containers
 * 8. Prevent grouping a shape with its ancestor (cycle prevention)
 * 9. Calculate correct enclosing bounding box for unrotated shapes
 * 10. Calculate correct bounding box for rotated shapes
 * 11. Child local coordinates correctly computed relative to group origin
 * 12. Child parentId set to group._id
 * 13. Shape versions incremented on grouping
 * 14. Group created with version: 1
 * 15. OCC mismatch rejected with 409 CONFLICT
 * 16. Atomic transaction rollback on failure
 * 17. MutationRecord written with operation 'shape:group'
 * 18. Collaboration revision incremented on group
 * 19. SHAPE_GROUPED broadcast to other room members
 * 20. Creator socket receives ACK with group and updated children
 * 21. VIEWER rejected with 403 FORBIDDEN
 * 22. EDITOR permitted to group
 * 23. ADMIN permitted to group
 * 24. OWNER permitted to group
 * 25. Runtime downgrade to VIEWER rejected on subsequent group attempt
 * 26. Ungroup restores world coordinates
 * 27. Ungroup preserves child rotation
 * 28. Ungroup deletes group shape
 * 29. Ungroup sets child parentId to group.parentId (nested group support)
 * 30. Ungroup OCC mismatch rejected with 409 CONFLICT
 * 31. Cascade deletion: deleting group deletes all descendants
 * 32. Cascade deletion: connectors to deleted group or children nullified
 * 33. Concurrent grouping of overlapping sets: first succeeds, second fails OCC
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
  GroupShapesPayload,
  GroupShapesAckData,
  GroupShapesBroadcastPayload,
  UngroupShapePayload,
  UngroupShapeAckData,
  UngroupShapeBroadcastPayload,
} from "@/socket/socket.types";

import { UserModel } from "@/modules/user/user.model";
import { UserRole } from "@/modules/user/user.types";
import { WorkspaceModel } from "@/modules/workspace/workspace.model";
import { WorkspaceMemberModel } from "@/modules/workspace/workspaceMember.model";
import { WorkspaceRole } from "@/modules/workspace/workspace.types";
import { BoardModel } from "@/modules/board/board.model";
import { CanvasModel } from "@/modules/canvas/canvas.model";
import { ShapeModel } from "@/modules/shape/shape.model";
import { ShapeType } from "@/modules/shape/shape.types";
import { MutationRecordModel } from "@/modules/mutation/mutation.model";
import { generateAccessToken } from "@/modules/auth/auth.tokens";

async function runGroupingTestSuite(): Promise<void> {
  console.log("Starting Slice 22: Grouping & Ungrouping Integration Tests...\n");

  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB for Slice 22 test fixture setup.");

  // Clear fixtures
  await Promise.all([
    UserModel.deleteMany({ email: { $regex: /@slice22-grouping-test\.com$/ } }),
    WorkspaceModel.deleteMany({ name: { $regex: /Slice 22/ } }),
    WorkspaceMemberModel.deleteMany({}),
    BoardModel.deleteMany({ name: { $regex: /Slice 22/ } }),
    CanvasModel.deleteMany({ name: { $regex: /Slice 22/ } }),
    ShapeModel.deleteMany({}),
    MutationRecordModel.deleteMany({}),
  ]);

  // Seed Users
  const ownerUser = await UserModel.create({
    email: "owner@slice22-grouping-test.com",
    password: "Password123!",
    fullName: "Alice Owner",
  });
  const adminUser = await UserModel.create({
    email: "admin@slice22-grouping-test.com",
    password: "Password123!",
    fullName: "Bob Admin",
  });
  const editorUser = await UserModel.create({
    email: "editor@slice22-grouping-test.com",
    password: "Password123!",
    fullName: "Charlie Editor",
  });
  const viewerUser = await UserModel.create({
    email: "viewer@slice22-grouping-test.com",
    password: "Password123!",
    fullName: "Dave Viewer",
  });

  // Seed Workspace & Memberships
  const workspace = await WorkspaceModel.create({
    name: "Slice 22 Grouping Workspace",
    ownerId: ownerUser._id,
  });

  const viewerMembership = await WorkspaceMemberModel.create({
    workspaceId: workspace._id,
    userId: viewerUser._id,
    role: WorkspaceRole.VIEWER,
  });

  await WorkspaceMemberModel.create([
    { workspaceId: workspace._id, userId: ownerUser._id, role: WorkspaceRole.OWNER },
    { workspaceId: workspace._id, userId: adminUser._id, role: WorkspaceRole.ADMIN },
    { workspaceId: workspace._id, userId: editorUser._id, role: WorkspaceRole.EDITOR },
  ]);

  // Seed Board & Canvases
  const board = await BoardModel.create({
    workspaceId: workspace._id,
    name: "Slice 22 Grouping Board",
    createdBy: ownerUser._id,
    collaborationRevision: 1,
  });

  const canvas = await CanvasModel.create({
    boardId: board._id,
    name: "Slice 22 Canvas 1",
    order: 1,
    backgroundColor: "#ffffff",
  });

  const canvas2 = await CanvasModel.create({
    boardId: board._id,
    name: "Slice 22 Canvas 2",
    order: 2,
    backgroundColor: "#ffffff",
  });

  const boardIdStr = board._id.toString();
  const canvasIdStr = canvas._id.toString();
  const canvas2IdStr = canvas2._id.toString();

  // Mint Tokens
  const ownerToken = generateAccessToken({ userId: ownerUser._id.toString(), role: UserRole.USER });
  const adminToken = generateAccessToken({ userId: adminUser._id.toString(), role: UserRole.USER });
  const editorToken = generateAccessToken({ userId: editorUser._id.toString(), role: UserRole.USER });
  const viewerToken = generateAccessToken({ userId: viewerUser._id.toString(), role: UserRole.USER });

  // Start HTTP & Socket.IO server on dynamic port
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

  async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
    } catch (err) {
      console.error(`  ✗ ${name}`);
      throw err;
    }
  }

  function getErrorMessage(err: unknown): string {
    if (!err) return "";
    if (typeof err === "string") return err;
    if (typeof err === "object") {
      const obj = err as Record<string, unknown>;
      return `${obj.code ?? ""} ${obj.message ?? ""}`;
    }
    return "";
  }

  // Helper to create test shape via Socket
  const createShape = async (
    socket: ClientSocket,
    data: Partial<CreateShapePayload> & { x: number; y: number; width: number; height: number }
  ): Promise<ShapeResponseDto> => {
    return new Promise((resolve, reject) => {
      const payload: CreateShapePayload = {
        canvasId: canvasIdStr,
        type: (data.type as any) ?? "rectangle",
        rotation: 0,
        mutationId: crypto.randomUUID(),
        ...data,
      };
      socket.emit(SocketEvents.SHAPE_CREATE, payload, (ack: any) => {
        if (ack.success && ack.data) {
          resolve(ack.data);
        } else {
          reject(new Error(typeof ack.error === "string" ? ack.error : ack.error?.message ?? "Create failed"));
        }
      });
    });
  };

  try {
    // ----------------------------------------------------
    // TEST 1: Group 2 shapes successfully
    // ----------------------------------------------------
    let shapeA = await createShape(editorSocket, { x: 100, y: 100, width: 50, height: 50 });
    let shapeB = await createShape(editorSocket, { x: 200, y: 200, width: 60, height: 40 });

    let group1Result: GroupShapesAckData | null = null;

    await runTest("1. Group 2 shapes successfully", async () => {
      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [shapeA.id, shapeB.id],
        expectedVersions: { [shapeA.id]: shapeA.version, [shapeB.id]: shapeB.version },
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, true);
      assert.ok(ack.data);
      assert.strictEqual(ack.data.group.type, "group");
      assert.strictEqual(ack.data.children.length, 2);
      group1Result = ack.data;
    });

    // ----------------------------------------------------
    // TEST 2: Group 3 shapes successfully
    // ----------------------------------------------------
    await runTest("2. Group 3 shapes successfully", async () => {
      const s1 = await createShape(editorSocket, { x: 10, y: 10, width: 30, height: 30 });
      const s2 = await createShape(editorSocket, { x: 50, y: 10, width: 30, height: 30 });
      const s3 = await createShape(editorSocket, { x: 90, y: 10, width: 30, height: 30 });

      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, s2.id, s3.id],
        expectedVersions: { [s1.id]: s1.version, [s2.id]: s2.version, [s3.id]: s3.version },
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, true);
      assert.ok(ack.data);
      assert.strictEqual(ack.data.children.length, 3);
    });

    // ----------------------------------------------------
    // TEST 3: Group rejected if < 2 shapes
    // ----------------------------------------------------
    await runTest("3. Group rejected if < 2 shapes", async () => {
      const s = await createShape(editorSocket, { x: 300, y: 300, width: 40, height: 40 });
      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s.id],
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, false);
      assert.ok(getErrorMessage(ack.error).includes("at least 2 shapes"));
    });

    // ----------------------------------------------------
    // TEST 4: Group rejected if shapes belong to different canvases
    // ----------------------------------------------------
    await runTest("4. Group rejected if shapes belong to different canvases", async () => {
      const s1 = await createShape(editorSocket, { x: 10, y: 10, width: 40, height: 40 });
      // Create shape on canvas 2
      const s2 = await new Promise<ShapeResponseDto>((resolve, reject) => {
        editorSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvas2IdStr,
            type: "rectangle",
            x: 20,
            y: 20,
            width: 40,
            height: 40,
            mutationId: crypto.randomUUID(),
          },
          (res: SocketAck<ShapeResponseDto>) => {
            if (res.success && res.data) resolve(res.data);
            else reject(new Error(getErrorMessage(res.error)));
          }
        );
      });

      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, s2.id],
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, false);
    });

    // ----------------------------------------------------
    // TEST 5: Group rejected if duplicate shape IDs sent
    // ----------------------------------------------------
    await runTest("5. Group rejected if duplicate shape IDs sent", async () => {
      const s1 = await createShape(editorSocket, { x: 10, y: 10, width: 40, height: 40 });
      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, s1.id],
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, false);
      assert.ok(getErrorMessage(ack.error).includes("Duplicate"));
    });

    // ----------------------------------------------------
    // TEST 6: Group rejected if any shape ID doesn't exist
    // ----------------------------------------------------
    await runTest("6. Group rejected if any shape ID doesn't exist", async () => {
      const s1 = await createShape(editorSocket, { x: 10, y: 10, width: 40, height: 40 });
      const fakeId = new Types.ObjectId().toString();
      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, fakeId],
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, false);
      assert.ok(getErrorMessage(ack.error).toLowerCase().includes("exist"));
    });

    // ----------------------------------------------------
    // TEST 7: Group rejected if shapes have different parent containers
    // ----------------------------------------------------
    await runTest("7. Group rejected if shapes have different parent containers", async () => {
      // group1Result.children are inside group1
      const childFromGroup1 = group1Result!.children[0].id;
      const rootShape = await createShape(editorSocket, { x: 400, y: 400, width: 30, height: 30 });

      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [childFromGroup1, rootShape.id],
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, false);
      assert.ok(getErrorMessage(ack.error).includes("parent container"));
    });

    // ----------------------------------------------------
    // TEST 8: Prevent grouping a shape with its ancestor (cycle prevention)
    // ----------------------------------------------------
    await runTest("8. Prevent grouping a shape with its ancestor (cycle prevention)", async () => {
      const group1Id = group1Result!.group.id;
      const childFromGroup1 = group1Result!.children[0].id;

      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [group1Id, childFromGroup1],
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, false);
    });

    // ----------------------------------------------------
    // TEST 9: Calculate correct enclosing bounding box for unrotated shapes
    // ----------------------------------------------------
    await runTest("9. Calculate correct enclosing bounding box for unrotated shapes", async () => {
      const s1 = await createShape(editorSocket, { x: 100, y: 100, width: 50, height: 50 });
      const s2 = await createShape(editorSocket, { x: 200, y: 200, width: 60, height: 40 });

      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, s2.id],
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, true);
      assert.ok(ack.data);
      // Min X: 100, Min Y: 100
      // Max X: 200 + 60 = 260 -> width: 160
      // Max Y: 200 + 40 = 240 -> height: 140
      assert.strictEqual(ack.data.group.x, 100);
      assert.strictEqual(ack.data.group.y, 100);
      assert.strictEqual(ack.data.group.width, 160);
      assert.strictEqual(ack.data.group.height, 140);
    });

    // ----------------------------------------------------
    // TEST 10: Calculate correct bounding box for rotated shapes
    // ----------------------------------------------------
    await runTest("10. Calculate correct bounding box for rotated shapes", async () => {
      // 100x100 square rotated 45 degrees around center (50, 50) expands to ~141.42
      const s1 = await createShape(editorSocket, { x: 0, y: 0, width: 100, height: 100, rotation: 45 });
      const s2 = await createShape(editorSocket, { x: 200, y: 200, width: 50, height: 50 });

      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, s2.id],
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, true);
      assert.ok(ack.data);
      // s1 rotated 45 deg reaches negative coordinates (-21, -21)
      assert.ok(ack.data.group.x < 0, `Expected group x < 0 but got ${ack.data.group.x}`);
      assert.ok(ack.data.group.y < 0, `Expected group y < 0 but got ${ack.data.group.y}`);
    });

    // ----------------------------------------------------
    // TEST 11: Child local coordinates correctly computed relative to group origin
    // ----------------------------------------------------
    await runTest("11. Child local coordinates correctly computed relative to group origin", async () => {
      const s1 = await createShape(editorSocket, { x: 100, y: 150, width: 50, height: 50 });
      const s2 = await createShape(editorSocket, { x: 300, y: 250, width: 50, height: 50 });

      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, s2.id],
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, true);
      assert.ok(ack.data);
      const group = ack.data.group;
      const child1 = ack.data.children.find((c) => c.id === s1.id)!;
      const child2 = ack.data.children.find((c) => c.id === s2.id)!;

      // Group origin: (100, 150)
      assert.strictEqual(child1.x, s1.x - group.x); // 0
      assert.strictEqual(child1.y, s1.y - group.y); // 0
      assert.strictEqual(child2.x, s2.x - group.x); // 200
      assert.strictEqual(child2.y, s2.y - group.y); // 100
    });

    // ----------------------------------------------------
    // TEST 12: Child parentId set to group._id
    // ----------------------------------------------------
    await runTest("12. Child parentId set to group._id", async () => {
      const s1 = await createShape(editorSocket, { x: 10, y: 10, width: 20, height: 20 });
      const s2 = await createShape(editorSocket, { x: 50, y: 50, width: 20, height: 20 });

      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, s2.id],
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, true);
      assert.ok(ack.data);
      const groupId = ack.data.group.id;
      for (const child of ack.data.children) {
        assert.strictEqual(child.parentId, groupId);
      }

      // Verify directly in MongoDB
      const doc1 = await ShapeModel.findById(s1.id);
      assert.strictEqual(doc1?.parentId?.toString(), groupId);
    });

    // ----------------------------------------------------
    // TEST 13: Shape versions incremented on grouping
    // ----------------------------------------------------
    await runTest("13. Shape versions incremented on grouping", async () => {
      const s1 = await createShape(editorSocket, { x: 10, y: 10, width: 20, height: 20 });
      const s2 = await createShape(editorSocket, { x: 50, y: 50, width: 20, height: 20 });
      const initialVersion1 = s1.version;
      const initialVersion2 = s2.version;

      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, s2.id],
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, true);
      assert.ok(ack.data);
      const child1 = ack.data.children.find((c) => c.id === s1.id)!;
      const child2 = ack.data.children.find((c) => c.id === s2.id)!;
      assert.strictEqual(child1.version, initialVersion1 + 1);
      assert.strictEqual(child2.version, initialVersion2 + 1);
    });

    // ----------------------------------------------------
    // TEST 14: Group created with version: 1
    // ----------------------------------------------------
    await runTest("14. Group created with version: 1", async () => {
      const s1 = await createShape(editorSocket, { x: 10, y: 10, width: 20, height: 20 });
      const s2 = await createShape(editorSocket, { x: 50, y: 50, width: 20, height: 20 });

      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, s2.id],
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, true);
      assert.ok(ack.data);
      assert.strictEqual(ack.data.group.version, 1);
    });

    // ----------------------------------------------------
    // TEST 15: OCC mismatch rejected with 409 CONFLICT
    // ----------------------------------------------------
    await runTest("15. OCC mismatch rejected with 409 CONFLICT", async () => {
      const s1 = await createShape(editorSocket, { x: 10, y: 10, width: 20, height: 20 });
      const s2 = await createShape(editorSocket, { x: 50, y: 50, width: 20, height: 20 });

      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, s2.id],
        expectedVersions: { [s1.id]: s1.version + 99 }, // Mismatched version
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, false);
      assert.ok(getErrorMessage(ack.error).includes("CONFLICT"));
    });

    // ----------------------------------------------------
    // TEST 16: Atomic transaction rollback on failure
    // ----------------------------------------------------
    await runTest("16. Atomic transaction rollback on failure", async () => {
      const s1 = await createShape(editorSocket, { x: 10, y: 10, width: 20, height: 20 });
      const s2 = await createShape(editorSocket, { x: 50, y: 50, width: 20, height: 20 });

      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, s2.id],
        expectedVersions: { [s1.id]: s1.version, [s2.id]: 999 }, // s2 will fail OCC
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, false);

      // Verify s1 was NOT partially modified
      const doc1 = await ShapeModel.findById(s1.id);
      assert.strictEqual(doc1?.parentId, null);
      assert.strictEqual(doc1?.version, s1.version);
    });

    // ----------------------------------------------------
    // TEST 17: MutationRecord written with operation 'shape:group'
    // ----------------------------------------------------
    await runTest("17. MutationRecord written with operation 'shape:group'", async () => {
      const s1 = await createShape(editorSocket, { x: 10, y: 10, width: 20, height: 20 });
      const s2 = await createShape(editorSocket, { x: 50, y: 50, width: 20, height: 20 });
      const mutationId = crypto.randomUUID();

      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, s2.id],
        mutationId,
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, true);
      const record = await MutationRecordModel.findOne({ mutationId });
      assert.ok(record, "MutationRecord must be created");
      assert.strictEqual(record.operation, "shape:group");
      assert.strictEqual(record.status, "completed");
    });

    // ----------------------------------------------------
    // TEST 18: Collaboration revision incremented on group
    // ----------------------------------------------------
    await runTest("18. Collaboration revision incremented on group", async () => {
      const boardBefore = await BoardModel.findById(board._id);
      const revBefore = boardBefore!.collaborationRevision;

      const s1 = await createShape(editorSocket, { x: 10, y: 10, width: 20, height: 20 });
      const s2 = await createShape(editorSocket, { x: 50, y: 50, width: 20, height: 20 });

      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, s2.id],
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, true);
      const boardAfter = await BoardModel.findById(board._id);
      assert.ok(boardAfter!.collaborationRevision > revBefore);
    });

    // ----------------------------------------------------
    // TEST 19: SHAPE_GROUPED broadcast to other room members
    // ----------------------------------------------------
    await runTest("19. SHAPE_GROUPED broadcast to other room members", async () => {
      const s1 = await createShape(editorSocket, { x: 10, y: 10, width: 20, height: 20 });
      const s2 = await createShape(editorSocket, { x: 50, y: 50, width: 20, height: 20 });

      const broadcastPromise = new Promise<GroupShapesBroadcastPayload>((resolve) => {
        ownerSocket.once(SocketEvents.SHAPE_GROUPED, (event: GroupShapesBroadcastPayload) => {
          resolve(event);
        });
      });

      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, s2.id],
        mutationId: crypto.randomUUID(),
      };

      editorSocket.emit(SocketEvents.SHAPE_GROUP, payload);

      const broadcast = await broadcastPromise;
      assert.ok(broadcast.group);
      assert.strictEqual(broadcast.group.type, "group");
      assert.strictEqual(broadcast.children.length, 2);
      assert.ok(broadcast.meta.revision > 0);
    });

    // ----------------------------------------------------
    // TEST 20: Creator socket receives ACK with group and updated children
    // ----------------------------------------------------
    await runTest("20. Creator socket receives ACK with group and updated children", async () => {
      const s1 = await createShape(editorSocket, { x: 10, y: 10, width: 20, height: 20 });
      const s2 = await createShape(editorSocket, { x: 50, y: 50, width: 20, height: 20 });

      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, s2.id],
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, true);
      assert.ok(ack.data?.group);
      assert.ok(ack.data?.children);
      assert.strictEqual(ack.data.children.length, 2);
    });

    // ----------------------------------------------------
    // TEST 21: VIEWER rejected with 403 FORBIDDEN
    // ----------------------------------------------------
    await runTest("21. VIEWER rejected with 403 FORBIDDEN", async () => {
      const s1 = await createShape(editorSocket, { x: 10, y: 10, width: 20, height: 20 });
      const s2 = await createShape(editorSocket, { x: 50, y: 50, width: 20, height: 20 });

      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, s2.id],
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        viewerSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, false);
      assert.ok(getErrorMessage(ack.error).includes("FORBIDDEN"));
    });

    // ----------------------------------------------------
    // TEST 22: EDITOR permitted to group
    // ----------------------------------------------------
    await runTest("22. EDITOR permitted to group", async () => {
      const s1 = await createShape(editorSocket, { x: 10, y: 10, width: 20, height: 20 });
      const s2 = await createShape(editorSocket, { x: 50, y: 50, width: 20, height: 20 });

      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, s2.id],
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, true);
    });

    // ----------------------------------------------------
    // TEST 23: ADMIN permitted to group
    // ----------------------------------------------------
    await runTest("23. ADMIN permitted to group", async () => {
      const s1 = await createShape(adminSocket, { x: 10, y: 10, width: 20, height: 20 });
      const s2 = await createShape(adminSocket, { x: 50, y: 50, width: 20, height: 20 });

      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, s2.id],
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        adminSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, true);
    });

    // ----------------------------------------------------
    // TEST 24: OWNER permitted to group
    // ----------------------------------------------------
    await runTest("24. OWNER permitted to group", async () => {
      const s1 = await createShape(ownerSocket, { x: 10, y: 10, width: 20, height: 20 });
      const s2 = await createShape(ownerSocket, { x: 50, y: 50, width: 20, height: 20 });

      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, s2.id],
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        ownerSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, true);
    });

    // ----------------------------------------------------
    // TEST 25: Runtime downgrade to VIEWER rejected on subsequent group attempt
    // ----------------------------------------------------
    await runTest("25. Runtime downgrade to VIEWER rejected on subsequent group attempt", async () => {
      // Downgrade Charlie (editor) to VIEWER
      await WorkspaceMemberModel.updateOne(
        { workspaceId: workspace._id, userId: editorUser._id },
        { role: WorkspaceRole.VIEWER }
      );

      const s1 = await createShape(ownerSocket, { x: 10, y: 10, width: 20, height: 20 });
      const s2 = await createShape(ownerSocket, { x: 50, y: 50, width: 20, height: 20 });

      const payload: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, s2.id],
        mutationId: crypto.randomUUID(),
      };

      const ack = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_GROUP, payload, (res: any) => resolve(res));
      });

      assert.strictEqual(ack.success, false);
      assert.ok(getErrorMessage(ack.error).includes("FORBIDDEN"));

      // Restore Charlie's role to EDITOR
      await WorkspaceMemberModel.updateOne(
        { workspaceId: workspace._id, userId: editorUser._id },
        { role: WorkspaceRole.EDITOR }
      );
    });

    // ----------------------------------------------------
    // TEST 26: Ungroup restores world coordinates
    // ----------------------------------------------------
    await runTest("26. Ungroup restores world coordinates", async () => {
      const origX1 = 150;
      const origY1 = 180;
      const origX2 = 250;
      const origY2 = 280;

      const s1 = await createShape(ownerSocket, { x: origX1, y: origY1, width: 40, height: 40 });
      const s2 = await createShape(ownerSocket, { x: origX2, y: origY2, width: 40, height: 40 });

      // Group them
      const groupAck = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        ownerSocket.emit(
          SocketEvents.SHAPE_GROUP,
          { canvasId: canvasIdStr, shapeIds: [s1.id, s2.id], mutationId: crypto.randomUUID() },
          (res: any) => resolve(res)
        );
      });

      assert.strictEqual(groupAck.success, true);
      const groupId = groupAck.data!.group.id;

      // Ungroup
      const ungroupAck = await new Promise<SocketAck<UngroupShapeAckData>>((resolve) => {
        ownerSocket.emit(
          SocketEvents.SHAPE_UNGROUP,
          { canvasId: canvasIdStr, groupId, mutationId: crypto.randomUUID() },
          (res: any) => resolve(res)
        );
      });

      assert.strictEqual(ungroupAck.success, true);
      assert.ok(ungroupAck.data);
      const restored1 = ungroupAck.data.children.find((c) => c.id === s1.id)!;
      const restored2 = ungroupAck.data.children.find((c) => c.id === s2.id)!;

      assert.strictEqual(restored1.x, origX1);
      assert.strictEqual(restored1.y, origY1);
      assert.strictEqual(restored2.x, origX2);
      assert.strictEqual(restored2.y, origY2);
      assert.strictEqual(restored1.parentId, null);
      assert.strictEqual(restored2.parentId, null);
    });

    // ----------------------------------------------------
    // TEST 27: Ungroup preserves child rotation
    // ----------------------------------------------------
    await runTest("27. Ungroup preserves child rotation", async () => {
      const s1 = await createShape(ownerSocket, { x: 100, y: 100, width: 40, height: 40, rotation: 30 });
      const s2 = await createShape(ownerSocket, { x: 200, y: 100, width: 40, height: 40, rotation: 60 });

      const groupAck = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        ownerSocket.emit(
          SocketEvents.SHAPE_GROUP,
          { canvasId: canvasIdStr, shapeIds: [s1.id, s2.id], mutationId: crypto.randomUUID() },
          (res: any) => resolve(res)
        );
      });

      const groupId = groupAck.data!.group.id;

      const ungroupAck = await new Promise<SocketAck<UngroupShapeAckData>>((resolve) => {
        ownerSocket.emit(
          SocketEvents.SHAPE_UNGROUP,
          { canvasId: canvasIdStr, groupId, mutationId: crypto.randomUUID() },
          (res: any) => resolve(res)
        );
      });

      assert.strictEqual(ungroupAck.success, true);
      const child1 = ungroupAck.data!.children.find((c) => c.id === s1.id)!;
      const child2 = ungroupAck.data!.children.find((c) => c.id === s2.id)!;
      assert.strictEqual(child1.rotation, 30);
      assert.strictEqual(child2.rotation, 60);
    });

    // ----------------------------------------------------
    // TEST 28: Ungroup deletes group shape
    // ----------------------------------------------------
    await runTest("28. Ungroup deletes group shape", async () => {
      const s1 = await createShape(ownerSocket, { x: 100, y: 100, width: 40, height: 40 });
      const s2 = await createShape(ownerSocket, { x: 200, y: 100, width: 40, height: 40 });

      const groupAck = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        ownerSocket.emit(
          SocketEvents.SHAPE_GROUP,
          { canvasId: canvasIdStr, shapeIds: [s1.id, s2.id], mutationId: crypto.randomUUID() },
          (res: any) => resolve(res)
        );
      });

      const groupId = groupAck.data!.group.id;

      const ungroupAck = await new Promise<SocketAck<UngroupShapeAckData>>((resolve) => {
        ownerSocket.emit(
          SocketEvents.SHAPE_UNGROUP,
          { canvasId: canvasIdStr, groupId, mutationId: crypto.randomUUID() },
          (res: any) => resolve(res)
        );
      });

      assert.strictEqual(ungroupAck.success, true);
      const groupDoc = await ShapeModel.findById(groupId);
      assert.strictEqual(groupDoc, null);
    });

    // ----------------------------------------------------
    // TEST 29: Ungroup sets child parentId to group.parentId (nested group support)
    // ----------------------------------------------------
    await runTest("29. Ungroup sets child parentId to group.parentId (nested group support)", async () => {
      // Create Inner Group (s1, s2)
      const s1 = await createShape(ownerSocket, { x: 10, y: 10, width: 20, height: 20 });
      const s2 = await createShape(ownerSocket, { x: 40, y: 10, width: 20, height: 20 });
      const innerAck = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        ownerSocket.emit(
          SocketEvents.SHAPE_GROUP,
          { canvasId: canvasIdStr, shapeIds: [s1.id, s2.id], mutationId: crypto.randomUUID() },
          (res: any) => resolve(res)
        );
      });
      const innerGroup = innerAck.data!.group;

      // Create sibling shape s3 at root
      const s3 = await createShape(ownerSocket, { x: 100, y: 10, width: 20, height: 20 });

      // Create Outer Group containing innerGroup and s3
      const outerAck = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        ownerSocket.emit(
          SocketEvents.SHAPE_GROUP,
          { canvasId: canvasIdStr, shapeIds: [innerGroup.id, s3.id], mutationId: crypto.randomUUID() },
          (res: any) => resolve(res)
        );
      });
      const outerGroup = outerAck.data!.group;

      // Ungroup innerGroup (which is nested inside outerGroup)
      const ungroupInnerAck = await new Promise<SocketAck<UngroupShapeAckData>>((resolve) => {
        ownerSocket.emit(
          SocketEvents.SHAPE_UNGROUP,
          { canvasId: canvasIdStr, groupId: innerGroup.id, mutationId: crypto.randomUUID() },
          (res: any) => resolve(res)
        );
      });

      assert.strictEqual(ungroupInnerAck.success, true);
      // Children of innerGroup (s1, s2) must now have parentId = outerGroup.id
      for (const child of ungroupInnerAck.data!.children) {
        assert.strictEqual(child.parentId, outerGroup.id);
      }
    });

    // ----------------------------------------------------
    // TEST 30: Ungroup OCC mismatch rejected with 409 CONFLICT
    // ----------------------------------------------------
    await runTest("30. Ungroup OCC mismatch rejected with 409 CONFLICT", async () => {
      const s1 = await createShape(ownerSocket, { x: 10, y: 10, width: 20, height: 20 });
      const s2 = await createShape(ownerSocket, { x: 40, y: 10, width: 20, height: 20 });
      const groupAck = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        ownerSocket.emit(
          SocketEvents.SHAPE_GROUP,
          { canvasId: canvasIdStr, shapeIds: [s1.id, s2.id], mutationId: crypto.randomUUID() },
          (res: any) => resolve(res)
        );
      });

      const groupId = groupAck.data!.group.id;

      const ungroupAck = await new Promise<SocketAck<UngroupShapeAckData>>((resolve) => {
        ownerSocket.emit(
          SocketEvents.SHAPE_UNGROUP,
          { canvasId: canvasIdStr, groupId, expectedVersion: 999, mutationId: crypto.randomUUID() },
          (res: any) => resolve(res)
        );
      });

      assert.strictEqual(ungroupAck.success, false);
      assert.ok(getErrorMessage(ungroupAck.error).includes("CONFLICT"));
    });

    // ----------------------------------------------------
    // TEST 31: Cascade deletion: deleting group deletes all descendants
    // ----------------------------------------------------
    await runTest("31. Cascade deletion: deleting group deletes all descendants", async () => {
      const s1 = await createShape(ownerSocket, { x: 10, y: 10, width: 20, height: 20 });
      const s2 = await createShape(ownerSocket, { x: 40, y: 10, width: 20, height: 20 });
      const groupAck = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        ownerSocket.emit(
          SocketEvents.SHAPE_GROUP,
          { canvasId: canvasIdStr, shapeIds: [s1.id, s2.id], mutationId: crypto.randomUUID() },
          (res: any) => resolve(res)
        );
      });

      const groupId = groupAck.data!.group.id;

      // Delete the group via shape:delete
      const delAck = await new Promise<SocketAck>((resolve) => {
        ownerSocket.emit(
          SocketEvents.SHAPE_DELETE,
          { shapeId: groupId, mutationId: crypto.randomUUID() },
          (res: any) => resolve(res)
        );
      });

      assert.strictEqual(delAck.success, true);
      // Verify both group and its children are deleted from DB
      const groupDoc = await ShapeModel.findById(groupId);
      const child1Doc = await ShapeModel.findById(s1.id);
      const child2Doc = await ShapeModel.findById(s2.id);

      assert.strictEqual(groupDoc, null);
      assert.strictEqual(child1Doc, null);
      assert.strictEqual(child2Doc, null);
    });

    // ----------------------------------------------------
    // TEST 32: Cascade deletion: connectors to deleted group or children nullified
    // ----------------------------------------------------
    await runTest("32. Cascade deletion: connectors to deleted group or children nullified", async () => {
      const s1 = await createShape(ownerSocket, { x: 10, y: 10, width: 20, height: 20 });
      const s2 = await createShape(ownerSocket, { x: 40, y: 10, width: 20, height: 20 });
      const groupAck = await new Promise<SocketAck<GroupShapesAckData>>((resolve) => {
        ownerSocket.emit(
          SocketEvents.SHAPE_GROUP,
          { canvasId: canvasIdStr, shapeIds: [s1.id, s2.id], mutationId: crypto.randomUUID() },
          (res: any) => resolve(res)
        );
      });

      const groupId = groupAck.data!.group.id;

      // Create an independent shape
      const otherShape = await createShape(ownerSocket, { x: 300, y: 300, width: 40, height: 40 });

      // Create connector pointing to child s1
      const conn = await new Promise<ShapeResponseDto>((resolve) => {
        ownerSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "connector",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            points: [0, 0, 100, 100],
            connector: {
              sourceShapeId: s1.id,
              sourceAnchor: "right",
              targetShapeId: otherShape.id,
              targetAnchor: "left",
            },
            mutationId: crypto.randomUUID(),
          },
          (res: SocketAck<ShapeResponseDto>) => resolve(res.data!)
        );
      });

      // Delete group (which cascade deletes s1)
      await new Promise<void>((resolve) => {
        ownerSocket.emit(SocketEvents.SHAPE_DELETE, { shapeId: groupId, mutationId: crypto.randomUUID() }, () => resolve());
      });

      // Verify connector source was nullified
      const connDoc = await ShapeModel.findById(conn.id);
      assert.ok(connDoc, "Connector must still exist");
      assert.strictEqual(connDoc.connector?.sourceShapeId, null);
      assert.strictEqual(connDoc.connector?.sourceAnchor, null);
      assert.strictEqual(connDoc.connector?.targetShapeId?.toString(), otherShape.id);
    });

    // ----------------------------------------------------
    // TEST 33: Concurrent grouping of overlapping sets: first succeeds, second fails OCC
    // ----------------------------------------------------
    await runTest("33. Concurrent grouping of overlapping sets: first succeeds, second fails OCC", async () => {
      const s1 = await createShape(ownerSocket, { x: 10, y: 10, width: 20, height: 20 });
      const s2 = await createShape(ownerSocket, { x: 40, y: 10, width: 20, height: 20 });
      const s3 = await createShape(ownerSocket, { x: 80, y: 10, width: 20, height: 20 });

      // User 1 groups [s1, s2] with expectedVersions
      // User 2 tries to group [s2, s3] with expectedVersions
      const p1: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s1.id, s2.id],
        expectedVersions: { [s1.id]: s1.version, [s2.id]: s2.version },
        mutationId: crypto.randomUUID(),
      };

      const p2: GroupShapesPayload = {
        canvasId: canvasIdStr,
        shapeIds: [s2.id, s3.id],
        expectedVersions: { [s2.id]: s2.version, [s3.id]: s3.version },
        mutationId: crypto.randomUUID(),
      };

      const [ack1, ack2] = await Promise.all([
        new Promise<SocketAck<GroupShapesAckData>>((resolve) =>
          ownerSocket.emit(SocketEvents.SHAPE_GROUP, p1, (res: any) => resolve(res))
        ),
        new Promise<SocketAck<GroupShapesAckData>>((resolve) =>
          editorSocket.emit(SocketEvents.SHAPE_GROUP, p2, (res: any) => resolve(res))
        ),
      ]);

      const successCount = (ack1.success ? 1 : 0) + (ack2.success ? 1 : 0);
      const failCount = (!ack1.success ? 1 : 0) + (!ack2.success ? 1 : 0);

      assert.strictEqual(successCount, 1, "Exactly one concurrent group must succeed");
      assert.strictEqual(failCount, 1, "Exactly one concurrent group must fail OCC");
    });

    console.log("\n=======================================================");
    console.log("All 33 Grouping & Ungrouping Integration Tests PASSED!");
    console.log("=======================================================\n");
  } finally {
    ownerSocket.disconnect();
    adminSocket.disconnect();
    editorSocket.disconnect();
    viewerSocket.disconnect();
    httpServer.close();
    await mongoose.disconnect();
  }
}

runGroupingTestSuite().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
