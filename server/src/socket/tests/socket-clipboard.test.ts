/**
 * Slice 24: Copy/Paste, Duplicate & Clipboard Integration Tests
 *
 * Verifies all 22 required test cases:
 * 1. EDITOR can paste
 * 2. ADMIN can paste
 * 3. OWNER can paste
 * 4. VIEWER receives 403
 * 5. Invalid payload rejected (empty shapes array)
 * 6. Invalid shape type rejected
 * 7. Duplicate temporary IDs rejected
 * 8. Invalid parent references rejected
 * 9. Invalid connector references rejected
 * 10. Atomic rollback on failure
 * 11. collaborationRevision increments once
 * 12. Exactly one MutationRecord created
 * 13. All shapes created atomically in MongoDB
 * 14. Creator receives canonical ACK + idMap
 * 15. Other users receive shape:pasted broadcast
 * 16. Remote paste creates no duplicate mutation
 * 17. Group hierarchy preserved with new parent IDs
 * 18. Nested group hierarchy preserved
 * 19. Internal connector references remapped
 * 20. External connector references safely handled
 * 21. Sequential zIndex preserved
 * 22. 50+ shape paste succeeds within limits
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
  SocketAck,
  SocketAckError,
  PasteShapesPayload,
  PasteShapesAckData,
  PasteShapesBroadcastPayload,
  PasteShapeItemPayload,
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

function getErrorCode(err?: SocketAckError | string): string | undefined {
  if (!err || typeof err === "string") return undefined;
  return err.code;
}

function getErrorMessage(err?: SocketAckError | string): string {
  if (!err) return "";
  if (typeof err === "string") return err;
  return err.message;
}

async function runClipboardTestSuite(): Promise<void> {
  console.log("Starting Slice 24: Copy/Paste, Duplicate & Clipboard Integration Tests...\n");

  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB for Slice 24 test fixture setup.");

  // Clear test fixtures
  await Promise.all([
    UserModel.deleteMany({ email: { $regex: /@slice24-clipboard-test\.com$/ } }),
    WorkspaceModel.deleteMany({ name: { $regex: /Slice 24/ } }),
    WorkspaceMemberModel.deleteMany({}),
    BoardModel.deleteMany({ name: { $regex: /Slice 24/ } }),
    CanvasModel.deleteMany({ name: { $regex: /Slice 24/ } }),
    ShapeModel.deleteMany({}),
    MutationRecordModel.deleteMany({}),
  ]);

  // Seed Users
  const ownerUser = await UserModel.create({
    email: "owner@slice24-clipboard-test.com",
    password: "Password123!",
    fullName: "Alice Owner",
  });
  const adminUser = await UserModel.create({
    email: "admin@slice24-clipboard-test.com",
    password: "Password123!",
    fullName: "Bob Admin",
  });
  const editorUser = await UserModel.create({
    email: "editor@slice24-clipboard-test.com",
    password: "Password123!",
    fullName: "Charlie Editor",
  });
  const viewerUser = await UserModel.create({
    email: "viewer@slice24-clipboard-test.com",
    password: "Password123!",
    fullName: "Dave Viewer",
  });

  // Seed Workspace
  const workspace = await WorkspaceModel.create({
    name: "Slice 24 Test Workspace",
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
    name: "Slice 24 Test Board",
    workspaceId: workspace._id,
    createdBy: ownerUser._id,
    collaborationRevision: 1,
  });

  const canvas = await CanvasModel.create({
    name: "Slice 24 Test Canvas",
    boardId: board._id,
    order: 1,
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

  async function emitPaste(
    socket: ClientSocket,
    payload: PasteShapesPayload
  ): Promise<SocketAck<PasteShapesAckData>> {
    return new Promise((resolve) => {
      socket.emit(SocketEvents.SHAPE_PASTE, payload, (response: SocketAck<PasteShapesAckData>) => {
        resolve(response);
      });
    });
  }

  function makeRect(tempId: string, x: number, y: number, parentId?: string | null): PasteShapeItemPayload {
    return {
      tempId,
      type: "rectangle",
      x,
      y,
      width: 100,
      height: 80,
      rotation: 0,
      parentId: parentId ?? null,
      style: {
        fill: "#3b82f6",
        stroke: "#1d4ed8",
        strokeWidth: 2,
        opacity: 1,
      },
    };
  }

  function makeGroup(tempId: string, x: number, y: number, parentId?: string | null): PasteShapeItemPayload {
    return {
      tempId,
      type: "group",
      x,
      y,
      width: 200,
      height: 200,
      rotation: 0,
      parentId: parentId ?? null,
    };
  }

  try {
    // ----------------------------------------------------
    // Test 1: EDITOR can paste
    // ----------------------------------------------------
    console.log("Test 1: EDITOR can paste");
    {
      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId: crypto.randomUUID(),
        shapes: [makeRect("temp_ed_1", 10, 10), makeRect("temp_ed_2", 120, 10)],
      };
      const res = await emitPaste(editorSocket, payload);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data?.shapes.length, 2);
      assert.ok(res.data?.idMap["temp_ed_1"]);
      assert.ok(res.data?.idMap["temp_ed_2"]);
      console.log("  ✓ Passed");
    }

    // ----------------------------------------------------
    // Test 2: ADMIN can paste
    // ----------------------------------------------------
    console.log("Test 2: ADMIN can paste");
    {
      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId: crypto.randomUUID(),
        shapes: [makeRect("temp_adm_1", 20, 20)],
      };
      const res = await emitPaste(adminSocket, payload);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data?.shapes.length, 1);
      console.log("  ✓ Passed");
    }

    // ----------------------------------------------------
    // Test 3: OWNER can paste
    // ----------------------------------------------------
    console.log("Test 3: OWNER can paste");
    {
      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId: crypto.randomUUID(),
        shapes: [makeRect("temp_own_1", 30, 30)],
      };
      const res = await emitPaste(ownerSocket, payload);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data?.shapes.length, 1);
      console.log("  ✓ Passed");
    }

    // ----------------------------------------------------
    // Test 4: VIEWER receives 403 Forbidden
    // ----------------------------------------------------
    console.log("Test 4: VIEWER receives 403");
    {
      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId: crypto.randomUUID(),
        shapes: [makeRect("temp_view_1", 40, 40)],
      };
      const res = await emitPaste(viewerSocket, payload);
      assert.strictEqual(res.success, false);
      const code = getErrorCode(res.error);
      const msg = getErrorMessage(res.error);
      assert.ok(code === "FORBIDDEN" || msg.includes("Forbidden") || msg.includes("permission"));
      console.log("  ✓ Passed");
    }

    // ----------------------------------------------------
    // Test 5: Invalid payload rejected (empty shapes array)
    // ----------------------------------------------------
    console.log("Test 5: Invalid payload rejected");
    {
      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId: crypto.randomUUID(),
        shapes: [],
      };
      const res = await emitPaste(editorSocket, payload);
      assert.strictEqual(res.success, false);
      assert.strictEqual(getErrorCode(res.error), "BAD_REQUEST");
      console.log("  ✓ Passed");
    }

    // ----------------------------------------------------
    // Test 6: Invalid shape type rejected
    // ----------------------------------------------------
    console.log("Test 6: Invalid shape type rejected");
    {
      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId: crypto.randomUUID(),
        shapes: [{ ...makeRect("t1", 0, 0), type: "unsupported_widget" }],
      };
      const res = await emitPaste(editorSocket, payload);
      assert.strictEqual(res.success, false);
      assert.strictEqual(getErrorCode(res.error), "BAD_REQUEST");
      console.log("  ✓ Passed");
    }

    // ----------------------------------------------------
    // Test 7: Duplicate temporary IDs rejected
    // ----------------------------------------------------
    console.log("Test 7: Duplicate temporary IDs rejected");
    {
      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId: crypto.randomUUID(),
        shapes: [makeRect("same_id", 0, 0), makeRect("same_id", 50, 50)],
      };
      const res = await emitPaste(editorSocket, payload);
      assert.strictEqual(res.success, false);
      assert.strictEqual(getErrorCode(res.error), "BAD_REQUEST");
      console.log("  ✓ Passed");
    }

    // ----------------------------------------------------
    // Test 8: Invalid parent references rejected
    // ----------------------------------------------------
    console.log("Test 8: Invalid parent references rejected");
    {
      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId: crypto.randomUUID(),
        shapes: [makeRect("child_1", 0, 0, "non_existent_parent_id")],
      };
      const res = await emitPaste(editorSocket, payload);
      assert.strictEqual(res.success, false);
      assert.strictEqual(getErrorCode(res.error), "BAD_REQUEST");
      console.log("  ✓ Passed");
    }

    // ----------------------------------------------------
    // Test 9: Invalid connector references rejected
    // ----------------------------------------------------
    console.log("Test 9: Invalid connector references rejected");
    {
      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId: crypto.randomUUID(),
        shapes: [
          makeRect("rect_self", 0, 0),
          {
            tempId: "conn_self",
            type: "connector",
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            points: [0, 0, 100, 100],
            connector: {
              sourceShapeId: "rect_self",
              targetShapeId: "rect_self", // Same shape!
            },
          },
        ],
      };
      const res = await emitPaste(editorSocket, payload);
      assert.strictEqual(res.success, false);
      assert.strictEqual(getErrorCode(res.error), "BAD_REQUEST");
      console.log("  ✓ Passed");
    }

    // ----------------------------------------------------
    // Test 10: Atomic rollback on failure
    // ----------------------------------------------------
    console.log("Test 10: Atomic rollback on failure");
    {
      const countBefore = await ShapeModel.countDocuments({ canvasId: canvas._id });
      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId: crypto.randomUUID(),
        shapes: [
          makeRect("good_shape", 0, 0),
          makeRect("bad_shape", 0, 0, "invalid_parent"),
        ],
      };
      const res = await emitPaste(editorSocket, payload);
      assert.strictEqual(res.success, false);
      const countAfter = await ShapeModel.countDocuments({ canvasId: canvas._id });
      assert.strictEqual(countAfter, countBefore, "No partial shapes should be persisted on error.");
      console.log("  ✓ Passed");
    }

    // ----------------------------------------------------
    // Test 11: collaborationRevision increments once
    // ----------------------------------------------------
    console.log("Test 11: collaborationRevision increments once");
    {
      const boardBefore = await BoardModel.findById(board._id);
      const revBefore = boardBefore?.collaborationRevision ?? 1;

      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId: crypto.randomUUID(),
        shapes: [makeRect("rev_1", 10, 10), makeRect("rev_2", 20, 20)],
      };
      const res = await emitPaste(editorSocket, payload);
      assert.strictEqual(res.success, true);

      const boardAfter = await BoardModel.findById(board._id);
      assert.strictEqual(boardAfter?.collaborationRevision, revBefore + 1);
      console.log("  ✓ Passed");
    }

    // ----------------------------------------------------
    // Test 12: Exactly one MutationRecord created
    // ----------------------------------------------------
    console.log("Test 12: Exactly one MutationRecord created");
    {
      const mutationId = crypto.randomUUID();
      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId,
        shapes: [makeRect("mut_1", 10, 10), makeRect("mut_2", 20, 20), makeRect("mut_3", 30, 30)],
      };
      const res = await emitPaste(editorSocket, payload);
      assert.strictEqual(res.success, true);

      const records = await MutationRecordModel.find({ mutationId });
      assert.strictEqual(records.length, 1);
      assert.strictEqual(records[0].operation, "shape:paste");
      assert.strictEqual(records[0].status, "completed");
      console.log("  ✓ Passed");
    }

    // ----------------------------------------------------
    // Test 13: All shapes created atomically in MongoDB
    // ----------------------------------------------------
    console.log("Test 13: All shapes created atomically in MongoDB");
    {
      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId: crypto.randomUUID(),
        shapes: [makeRect("db_1", 100, 100), makeRect("db_2", 200, 200)],
      };
      const res = await emitPaste(editorSocket, payload);
      assert.strictEqual(res.success, true);

      const dbShape1 = await ShapeModel.findById(new Types.ObjectId(res.data?.idMap["db_1"]));
      const dbShape2 = await ShapeModel.findById(new Types.ObjectId(res.data?.idMap["db_2"]));
      assert.ok(dbShape1);
      assert.ok(dbShape2);
      assert.strictEqual(dbShape1.x, 100);
      assert.strictEqual(dbShape2.x, 200);
      console.log("  ✓ Passed");
    }

    // ----------------------------------------------------
    // Test 14: Creator receives canonical ACK + idMap
    // ----------------------------------------------------
    console.log("Test 14: Creator receives canonical ACK + idMap");
    {
      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId: crypto.randomUUID(),
        shapes: [makeRect("t_ack", 15, 15)],
      };
      const res = await emitPaste(editorSocket, payload);
      assert.strictEqual(res.success, true);
      assert.ok(res.data?.idMap["t_ack"]);
      assert.strictEqual(res.data?.shapes[0].id, res.data?.idMap["t_ack"]);
      assert.strictEqual(res.data?.shapes[0].canvasId, canvas._id.toString());
      console.log("  ✓ Passed");
    }

    // ----------------------------------------------------
    // Test 15: Other users receive shape:pasted broadcast
    // ----------------------------------------------------
    console.log("Test 15: Other users receive shape:pasted broadcast");
    {
      const broadcastPromise = new Promise<PasteShapesBroadcastPayload>((resolve) => {
        adminSocket.once(SocketEvents.SHAPE_PASTED, (data: PasteShapesBroadcastPayload) => {
          resolve(data);
        });
      });

      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId: crypto.randomUUID(),
        shapes: [makeRect("bcast_1", 77, 77)],
      };
      await emitPaste(editorSocket, payload);

      const broadcastData = await broadcastPromise;
      assert.ok(broadcastData.meta);
      assert.strictEqual(broadcastData.shapes.length, 1);
      assert.strictEqual(broadcastData.shapes[0].x, 77);
      console.log("  ✓ Passed");
    }

    // ----------------------------------------------------
    // Test 16: Remote paste creates no duplicate mutation
    // ----------------------------------------------------
    console.log("Test 16: Remote paste creates no duplicate mutation");
    {
      const countBefore = await MutationRecordModel.countDocuments({ boardId: board._id });
      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId: crypto.randomUUID(),
        shapes: [makeRect("nodup_1", 88, 88)],
      };
      await emitPaste(editorSocket, payload);
      const countAfter = await MutationRecordModel.countDocuments({ boardId: board._id });
      assert.strictEqual(countAfter, countBefore + 1, "Exactly one mutation record created in total.");
      console.log("  ✓ Passed");
    }

    // ----------------------------------------------------
    // Test 17: Group hierarchy preserved with new parent IDs
    // ----------------------------------------------------
    console.log("Test 17: Group hierarchy preserved with new parent IDs");
    {
      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId: crypto.randomUUID(),
        shapes: [
          makeGroup("g_root", 100, 100),
          makeRect("c_rect", 10, 10, "g_root"),
        ],
      };
      const res = await emitPaste(editorSocket, payload);
      assert.strictEqual(res.success, true);

      const newGroupId = res.data?.idMap["g_root"];
      const newChildId = res.data?.idMap["c_rect"];
      assert.ok(newGroupId);
      assert.ok(newChildId);

      const childDoc = await ShapeModel.findById(new Types.ObjectId(newChildId));
      assert.strictEqual(childDoc?.parentId?.toString(), newGroupId);
      console.log("  ✓ Passed");
    }

    // ----------------------------------------------------
    // Test 18: Nested group hierarchy preserved
    // ----------------------------------------------------
    console.log("Test 18: Nested group hierarchy preserved");
    {
      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId: crypto.randomUUID(),
        shapes: [
          makeGroup("g_grandparent", 100, 100),
          makeGroup("g_parent", 20, 20, "g_grandparent"),
          makeRect("c_leaf", 5, 5, "g_parent"),
        ],
      };
      const res = await emitPaste(editorSocket, payload);
      assert.strictEqual(res.success, true);

      const gpId = res.data?.idMap["g_grandparent"];
      const pId = res.data?.idMap["g_parent"];
      const leafId = res.data?.idMap["c_leaf"];

      const pDoc = await ShapeModel.findById(new Types.ObjectId(pId));
      const leafDoc = await ShapeModel.findById(new Types.ObjectId(leafId));

      assert.strictEqual(pDoc?.parentId?.toString(), gpId);
      assert.strictEqual(leafDoc?.parentId?.toString(), pId);
      console.log("  ✓ Passed");
    }

    // ----------------------------------------------------
    // Test 19: Internal connector references remapped
    // ----------------------------------------------------
    console.log("Test 19: Internal connector references remapped");
    {
      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId: crypto.randomUUID(),
        shapes: [
          makeRect("source_rect", 10, 10),
          makeRect("target_rect", 200, 10),
          {
            tempId: "conn_1",
            type: "connector",
            x: 10,
            y: 10,
            width: 190,
            height: 10,
            points: [0, 0, 190, 0],
            connector: {
              sourceShapeId: "source_rect",
              targetShapeId: "target_rect",
              sourceAnchor: "right",
              targetAnchor: "left",
              routing: "straight",
            },
          },
        ],
      };
      const res = await emitPaste(editorSocket, payload);
      assert.strictEqual(res.success, true);

      const newSourceId = res.data?.idMap["source_rect"];
      const newTargetId = res.data?.idMap["target_rect"];
      const newConnId = res.data?.idMap["conn_1"];

      const connDoc = await ShapeModel.findById(new Types.ObjectId(newConnId));
      assert.strictEqual(connDoc?.connector?.sourceShapeId?.toString(), newSourceId);
      assert.strictEqual(connDoc?.connector?.targetShapeId?.toString(), newTargetId);
      console.log("  ✓ Passed");
    }

    // ----------------------------------------------------
    // Test 20: External connector references safely handled
    // ----------------------------------------------------
    console.log("Test 20: External connector references safely handled");
    {
      // Target shape is external (not in batch and not existing)
      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId: crypto.randomUUID(),
        shapes: [
          makeRect("source_rect_only", 10, 10),
          {
            tempId: "conn_ext",
            type: "connector",
            x: 10,
            y: 10,
            width: 190,
            height: 10,
            points: [0, 0, 190, 0],
            connector: {
              sourceShapeId: "source_rect_only",
              targetShapeId: null, // external endpoint detached
              sourceAnchor: "right",
              targetAnchor: "left",
            },
          },
        ],
      };
      const res = await emitPaste(editorSocket, payload);
      assert.strictEqual(res.success, true);

      const newSourceId = res.data?.idMap["source_rect_only"];
      const newConnId = res.data?.idMap["conn_ext"];

      const connDoc = await ShapeModel.findById(new Types.ObjectId(newConnId));
      assert.strictEqual(connDoc?.connector?.sourceShapeId?.toString(), newSourceId);
      assert.strictEqual(connDoc?.connector?.targetShapeId, null);
      assert.deepStrictEqual(connDoc?.points, [0, 0, 190, 0]);
      console.log("  ✓ Passed");
    }

    // ----------------------------------------------------
    // Test 21: Sequential zIndex preserved
    // ----------------------------------------------------
    console.log("Test 21: Sequential zIndex preserved");
    {
      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId: crypto.randomUUID(),
        shapes: [
          makeRect("z1", 10, 10),
          makeRect("z2", 20, 20),
          makeRect("z3", 30, 30),
        ],
      };
      const res = await emitPaste(editorSocket, payload);
      assert.strictEqual(res.success, true);

      const z1 = res.data?.shapes[0].zIndex ?? 0;
      const z2 = res.data?.shapes[1].zIndex ?? 0;
      const z3 = res.data?.shapes[2].zIndex ?? 0;

      assert.ok(z2 > z1);
      assert.ok(z3 > z2);
      console.log("  ✓ Passed");
    }

    // ----------------------------------------------------
    // Test 22: 50+ shape paste succeeds within limits
    // ----------------------------------------------------
    console.log("Test 22: 50+ shape paste succeeds within limits");
    {
      const shapes: PasteShapeItemPayload[] = [];
      for (let i = 0; i < 55; i++) {
        shapes.push(makeRect(`batch_${i}`, i * 5, i * 5));
      }
      const payload: PasteShapesPayload = {
        canvasId: canvas._id.toString(),
        mutationId: crypto.randomUUID(),
        shapes,
      };
      const res = await emitPaste(editorSocket, payload);
      assert.strictEqual(res.success, true);
      assert.strictEqual(res.data?.shapes.length, 55);
      assert.strictEqual(Object.keys(res.data?.idMap ?? {}).length, 55);
      console.log("  ✓ Passed");
    }

    console.log("\n==========================================");
    console.log("All 22 Slice 24 tests passed successfully!");
    console.log("==========================================\n");
  } finally {
    ownerSocket.disconnect();
    adminSocket.disconnect();
    editorSocket.disconnect();
    viewerSocket.disconnect();
    await socketServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await mongoose.disconnect();
  }
}

runClipboardTestSuite().catch((err) => {
  console.error("Test suite failed:", err);
  process.exit(1);
});
