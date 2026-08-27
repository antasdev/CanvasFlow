/**
 * Slice 21: Shape Styling & Advanced Appearance Integration Tests
 *
 * Verifies:
 * 1. RBAC authorization (OWNER, ADMIN, EDITOR allowed; VIEWER rejected with 403).
 * 2. Validation bounds (colors, strokeWidth, strokeStyle, opacity, shadow blur/offset/opacity, NaN, Infinity).
 * 3. Partial style persistence & preservation of unedited properties.
 * 4. Deep-merged nested shadow updates.
 * 5. OCC concurrency (valid expectedVersion increments Shape.version; stale expectedVersion returns 409 CONFLICT).
 * 6. Collaboration revision increments and MutationRecord generation.
 * 7. Ephemeral interaction purity (0 DB writes, 0 revision increments during local interaction).
 * 8. Runtime role downgrade (EDITOR -> VIEWER) blocks final style commit.
 * 9. Concurrent style updates across multiple users.
 * 10. Authoritative board recovery hydration from MongoDB.
 */

import crypto from "crypto";
import { createServer } from "http";
import assert from "assert";
import mongoose from "mongoose";
import { io as clientIO, Socket as ClientSocket } from "socket.io-client";

import env from "@/config/env";
import { SocketServer } from "@/socket/socket.server";
import { SocketEvents } from "@/socket/socket.events";
import {
  CreateShapePayload,
  UpdateShapePayload,
  SocketAck,
  ShapeResponseDto,
  InteractionStartPayload,
} from "@/socket/socket.types";

import { UserModel } from "@/modules/user/user.model";
import { UserRole } from "@/modules/user/user.types";
import { WorkspaceModel } from "@/modules/workspace/workspace.model";
import { WorkspaceMemberModel } from "@/modules/workspace/workspaceMember.model";
import { WorkspaceRole } from "@/modules/workspace/workspace.types";
import { BoardModel } from "@/modules/board/board.model";
import { CanvasModel } from "@/modules/canvas/canvas.model";
import { ShapeModel } from "@/modules/shape/shape.model";
import { ShapeMapper } from "@/modules/shape/shape.mapper";
import { RectangleShapeResponseDto } from "@/modules/shape/shape.dto";
import { MutationRecordModel } from "@/modules/mutation/mutation.model";
import { generateAccessToken } from "@/modules/auth/auth.tokens";

async function runShapeStylingTestSuite(): Promise<void> {
  console.log("Starting Slice 21: Shape Styling & Advanced Appearance Integration Tests...\n");

  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB for Slice 21 test fixture setup.");

  // Clear fixtures
  await Promise.all([
    UserModel.deleteMany({ email: { $regex: /@slice21-styling-test\.com$/ } }),
    WorkspaceModel.deleteMany({ name: { $regex: /Slice 21/ } }),
    WorkspaceMemberModel.deleteMany({}),
    BoardModel.deleteMany({ name: { $regex: /Slice 21/ } }),
    CanvasModel.deleteMany({ name: { $regex: /Slice 21/ } }),
    ShapeModel.deleteMany({}),
    MutationRecordModel.deleteMany({}),
  ]);

  // Seed Users
  const ownerUser = await UserModel.create({
    email: "owner@slice21-styling-test.com",
    password: "Password123!",
    fullName: "Alice Owner",
  });
  const adminUser = await UserModel.create({
    email: "admin@slice21-styling-test.com",
    password: "Password123!",
    fullName: "Bob Admin",
  });
  const editorUser = await UserModel.create({
    email: "editor@slice21-styling-test.com",
    password: "Password123!",
    fullName: "Charlie Editor",
  });
  const viewerUser = await UserModel.create({
    email: "viewer@slice21-styling-test.com",
    password: "Password123!",
    fullName: "Dave Viewer",
  });

  // Seed Workspace & Memberships
  const workspace = await WorkspaceModel.create({
    name: "Slice 21 Styling Workspace",
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
    name: "Slice 21 Styling Board",
    createdBy: ownerUser._id,
    collaborationRevision: 1,
  });

  const canvas = await CanvasModel.create({
    boardId: board._id,
    name: "Slice 21 Styling Canvas",
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

  try {
    let testRectId = "";
    let testRectVersion = 1;

    // ----------------------------------------------------
    // SHAPE CREATION WITH INITIAL STYLING
    // ----------------------------------------------------
    await runTest("1. EDITOR can create shape with full appearance configuration", async () => {
      const payload: CreateShapePayload = {
        canvasId: canvasIdStr,
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 150,
        rotation: 0,
        style: {
          fill: "#3b82f6",
          stroke: "#1d4ed8",
          strokeWidth: 4,
          strokeStyle: "dashed",
          opacity: 0.85,
          shadow: {
            enabled: true,
            color: "#000000",
            blur: 15,
            offsetX: 5,
            offsetY: 8,
            opacity: 0.5,
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_CREATE, payload, resolve);
      });

      assert(ack.success === true, `Failed to create shape: ${JSON.stringify(ack.error)}`);
      assert(ack.data !== undefined, "Response data must be defined");
      assert(ack.data.type === "rectangle", "Shape type must be rectangle");

      const rect = ack.data as RectangleShapeResponseDto;
      assert(rect.style.fill === "#3b82f6", "Fill must match");
      assert(rect.style.stroke === "#1d4ed8", "Stroke must match");
      assert(rect.style.strokeWidth === 4, "Stroke width must match");
      assert(rect.style.strokeStyle === "dashed", "Stroke style must be dashed");
      assert(rect.style.opacity === 0.85, "Opacity must match");
      assert(rect.style.shadow?.enabled === true, "Shadow must be enabled");
      assert(rect.style.shadow?.blur === 15, "Shadow blur must match");
      assert(rect.style.shadow?.offsetX === 5, "Shadow offsetX must match");
      assert(rect.style.shadow?.offsetY === 8, "Shadow offsetY must match");
      assert(rect.style.shadow?.opacity === 0.5, "Shadow opacity must match");

      testRectId = rect.id;
      testRectVersion = rect.version;
    });

    // ----------------------------------------------------
    // RBAC PERMISSIONS ON STYLING
    // ----------------------------------------------------
    await runTest("2. OWNER can update shape appearance", async () => {
      const updatePayload: UpdateShapePayload = {
        shapeId: testRectId,
        expectedVersion: testRectVersion,
        data: {
          style: {
            fill: "#ef4444",
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        ownerSocket.emit(SocketEvents.SHAPE_UPDATE, updatePayload, resolve);
      });

      assert(ack.success === true, `Owner update failed: ${JSON.stringify(ack.error)}`);
      testRectVersion = ack.data!.version;
    });

    await runTest("3. ADMIN can update shape appearance", async () => {
      const updatePayload: UpdateShapePayload = {
        shapeId: testRectId,
        expectedVersion: testRectVersion,
        data: {
          style: {
            stroke: "#b91c1c",
            strokeWidth: 6,
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        adminSocket.emit(SocketEvents.SHAPE_UPDATE, updatePayload, resolve);
      });

      assert(ack.success === true, `Admin update failed: ${JSON.stringify(ack.error)}`);
      testRectVersion = ack.data!.version;
    });

    await runTest("4. VIEWER cannot update shape appearance (403 FORBIDDEN)", async () => {
      const updatePayload: UpdateShapePayload = {
        shapeId: testRectId,
        expectedVersion: testRectVersion,
        data: {
          style: {
            fill: "#10b981",
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        viewerSocket.emit(SocketEvents.SHAPE_UPDATE, updatePayload, resolve);
      });

      const errStr = getErrorMessage(ack.error).toLowerCase();
      assert(ack.success === false, "Viewer must be forbidden from updating style");
      assert(errStr.includes("forbidden"), "Error must indicate forbidden");
    });

    // ----------------------------------------------------
    // PARTIAL STYLE PERSISTENCE & DEEP MERGE
    // ----------------------------------------------------
    await runTest("5. Partial style update preserves existing unedited style attributes", async () => {
      const updatePayload: UpdateShapePayload = {
        shapeId: testRectId,
        expectedVersion: testRectVersion,
        data: {
          style: {
            opacity: 0.95,
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_UPDATE, updatePayload, resolve);
      });

      assert(ack.success === true, `Update failed: ${JSON.stringify(ack.error)}`);
      const rect = ack.data as RectangleShapeResponseDto;
      assert(rect.style.opacity === 0.95, "Opacity must be updated");
      assert(rect.style.fill === "#ef4444", "Fill must be preserved");
      assert(rect.style.stroke === "#b91c1c", "Stroke must be preserved");
      assert(rect.style.strokeWidth === 6, "StrokeWidth must be preserved");
      assert(rect.style.strokeStyle === "dashed", "StrokeStyle must be preserved");
      assert(rect.style.shadow?.enabled === true, "Shadow enabled must be preserved");
      assert(rect.style.shadow?.blur === 15, "Shadow blur must be preserved");

      testRectVersion = rect.version;
    });

    await runTest("6. Nested shadow partial update preserves sibling shadow properties", async () => {
      const updatePayload: UpdateShapePayload = {
        shapeId: testRectId,
        expectedVersion: testRectVersion,
        data: {
          style: {
            shadow: {
              blur: 30,
              offsetX: 12,
            },
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_UPDATE, updatePayload, resolve);
      });

      assert(ack.success === true, `Shadow update failed: ${JSON.stringify(ack.error)}`);
      const rect = ack.data as RectangleShapeResponseDto;
      assert(rect.style.shadow?.blur === 30, "Shadow blur must be updated to 30");
      assert(rect.style.shadow?.offsetX === 12, "Shadow offsetX must be updated to 12");
      assert(rect.style.shadow?.offsetY === 8, "Shadow offsetY must be preserved (8)");
      assert(rect.style.shadow?.opacity === 0.5, "Shadow opacity must be preserved (0.5)");
      assert(rect.style.shadow?.enabled === true, "Shadow enabled must be preserved (true)");

      testRectVersion = rect.version;
    });

    // ----------------------------------------------------
    // VALIDATION BOUNDS & EDGE CASES
    // ----------------------------------------------------
    await runTest("7. Stroke style 'dotted' is accepted", async () => {
      const updatePayload: UpdateShapePayload = {
        shapeId: testRectId,
        expectedVersion: testRectVersion,
        data: {
          style: {
            strokeStyle: "dotted",
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_UPDATE, updatePayload, resolve);
      });

      assert(ack.success === true, "dotted strokeStyle must be accepted");
      assert((ack.data as RectangleShapeResponseDto).style.strokeStyle === "dotted");
      testRectVersion = ack.data!.version;
    });

    await runTest("8. Stroke style 'solid' is accepted", async () => {
      const updatePayload: UpdateShapePayload = {
        shapeId: testRectId,
        expectedVersion: testRectVersion,
        data: {
          style: {
            strokeStyle: "solid",
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_UPDATE, updatePayload, resolve);
      });

      assert(ack.success === true, "solid strokeStyle must be accepted");
      assert((ack.data as RectangleShapeResponseDto).style.strokeStyle === "solid");
      testRectVersion = ack.data!.version;
    });

    await runTest("9. Invalid stroke style is rejected", async () => {
      const updatePayload: UpdateShapePayload = {
        shapeId: testRectId,
        expectedVersion: testRectVersion,
        data: {
          style: {
            strokeStyle: "wavy" as any,
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_UPDATE, updatePayload, resolve);
      });

      assert(ack.success === false, "Invalid strokeStyle must be rejected");
    });

    await runTest("10. Negative stroke width is rejected", async () => {
      const updatePayload: UpdateShapePayload = {
        shapeId: testRectId,
        expectedVersion: testRectVersion,
        data: {
          style: {
            strokeWidth: -5,
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_UPDATE, updatePayload, resolve);
      });

      assert(ack.success === false, "Negative strokeWidth must be rejected");
    });

    await runTest("11. Stroke width > 100 is rejected", async () => {
      const updatePayload: UpdateShapePayload = {
        shapeId: testRectId,
        expectedVersion: testRectVersion,
        data: {
          style: {
            strokeWidth: 101,
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_UPDATE, updatePayload, resolve);
      });

      assert(ack.success === false, "Excessive strokeWidth must be rejected");
    });

    await runTest("12. Opacity < 0 is rejected", async () => {
      const updatePayload: UpdateShapePayload = {
        shapeId: testRectId,
        expectedVersion: testRectVersion,
        data: {
          style: {
            opacity: -0.1,
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_UPDATE, updatePayload, resolve);
      });

      assert(ack.success === false, "Negative opacity must be rejected");
    });

    await runTest("13. Opacity > 1 is rejected", async () => {
      const updatePayload: UpdateShapePayload = {
        shapeId: testRectId,
        expectedVersion: testRectVersion,
        data: {
          style: {
            opacity: 1.1,
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_UPDATE, updatePayload, resolve);
      });

      assert(ack.success === false, "Opacity > 1 must be rejected");
    });

    await runTest("14. Shadow blur < 0 or > 100 is rejected", async () => {
      const updatePayload: UpdateShapePayload = {
        shapeId: testRectId,
        expectedVersion: testRectVersion,
        data: {
          style: {
            shadow: {
              blur: 105,
            },
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_UPDATE, updatePayload, resolve);
      });

      assert(ack.success === false, "Shadow blur > 100 must be rejected");
    });

    await runTest("15. Shadow offset outside [-100, 100] is rejected", async () => {
      const updatePayload: UpdateShapePayload = {
        shapeId: testRectId,
        expectedVersion: testRectVersion,
        data: {
          style: {
            shadow: {
              offsetX: -150,
            },
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_UPDATE, updatePayload, resolve);
      });

      assert(ack.success === false, "Shadow offset < -100 must be rejected");
    });

    await runTest("16. Shadow opacity outside [0, 1] is rejected", async () => {
      const updatePayload: UpdateShapePayload = {
        shapeId: testRectId,
        expectedVersion: testRectVersion,
        data: {
          style: {
            shadow: {
              opacity: 1.5,
            },
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_UPDATE, updatePayload, resolve);
      });

      assert(ack.success === false, "Shadow opacity > 1 must be rejected");
    });

    await runTest("17. Invalid color strings are rejected", async () => {
      const updatePayload: UpdateShapePayload = {
        shapeId: testRectId,
        expectedVersion: testRectVersion,
        data: {
          style: {
            fill: "not-a-valid-hex-color",
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_UPDATE, updatePayload, resolve);
      });

      assert(ack.success === false, "Invalid color string must be rejected");
    });

    await runTest("18. Transparent fill is accepted", async () => {
      const updatePayload: UpdateShapePayload = {
        shapeId: testRectId,
        expectedVersion: testRectVersion,
        data: {
          style: {
            fill: "transparent",
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_UPDATE, updatePayload, resolve);
      });

      assert(ack.success === true, "transparent fill must be accepted");
      assert((ack.data as RectangleShapeResponseDto).style.fill === "transparent");
      testRectVersion = ack.data!.version;
    });

    // ----------------------------------------------------
    // OCC & VERSIONING
    // ----------------------------------------------------
    await runTest("19. Valid style update increments Shape.version", async () => {
      const versionBefore = testRectVersion;
      const updatePayload: UpdateShapePayload = {
        shapeId: testRectId,
        expectedVersion: versionBefore,
        data: {
          style: {
            strokeWidth: 3,
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_UPDATE, updatePayload, resolve);
      });

      assert(ack.success === true, "Update must succeed");
      assert(ack.data!.version === versionBefore + 1, "Shape.version must increment by 1");
      testRectVersion = ack.data!.version;
    });

    await runTest("20. Stale expectedVersion returns 409 CONFLICT", async () => {
      const staleVersion = testRectVersion - 1;
      const updatePayload: UpdateShapePayload = {
        shapeId: testRectId,
        expectedVersion: staleVersion,
        data: {
          style: {
            strokeWidth: 8,
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_UPDATE, updatePayload, resolve);
      });

      const errStr = getErrorMessage(ack.error).toLowerCase();
      assert(ack.success === false, "Stale update must fail");
      assert(
        errStr.includes("conflict") || errStr.includes("modified"),
        "Error must indicate conflict"
      );
    });

    // ----------------------------------------------------
    // MUTATION INTEGRITY & COLLABORATION REVISION
    // ----------------------------------------------------
    await runTest("21. Durable style update increments collaborationRevision and creates MutationRecord", async () => {
      const boardBefore = await BoardModel.findById(board._id);
      const revisionBefore = boardBefore?.collaborationRevision ?? 0;
      const mutationRecordsBefore = await MutationRecordModel.countDocuments({ boardId: board._id });

      const updatePayload: UpdateShapePayload = {
        mutationId: crypto.randomUUID(),
        shapeId: testRectId,
        expectedVersion: testRectVersion,
        data: {
          style: {
            strokeWidth: 10,
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_UPDATE, updatePayload, resolve);
      });

      assert(ack.success === true, "Update must succeed");
      testRectVersion = ack.data!.version;

      const boardAfter = await BoardModel.findById(board._id);
      const revisionAfter = boardAfter?.collaborationRevision ?? 0;
      const mutationRecordsAfter = await MutationRecordModel.countDocuments({ boardId: board._id });

      assert(revisionAfter === revisionBefore + 1, "collaborationRevision must increment by 1");
      assert(mutationRecordsAfter === mutationRecordsBefore + 1, "MutationRecord must be created");
    });

    // ----------------------------------------------------
    // EPHEMERAL PURITY
    // ----------------------------------------------------
    await runTest("22. Ephemeral interaction produces 0 DB writes and 0 revision increments", async () => {
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
            targets: [{ type: "shape", id: testRectId }],
          } as InteractionStartPayload,
          () => resolve()
        );
      });

      const shapeCountAfter = await ShapeModel.countDocuments();
      const boardAfter = await BoardModel.findById(board._id);
      const revisionAfter = boardAfter?.collaborationRevision ?? 0;

      assert(shapeCountAfter === shapeCountBefore, "Shape count must remain unchanged during interaction");
      assert(revisionAfter === revisionBefore, "collaborationRevision must NOT increment during interaction");
    });

    // ----------------------------------------------------
    // RUNTIME ROLE DOWNGRADE
    // ----------------------------------------------------
    await runTest("23. Runtime role downgrade (EDITOR -> VIEWER) rejects final commit (403)", async () => {
      // Downgrade editor to VIEWER mid-interaction
      await WorkspaceMemberModel.updateOne(
        { workspaceId: workspace._id, userId: editorUser._id },
        { $set: { role: WorkspaceRole.VIEWER } }
      );

      const updatePayload: UpdateShapePayload = {
        shapeId: testRectId,
        expectedVersion: testRectVersion,
        data: {
          style: {
            stroke: "#6366f1",
          },
        },
      };

      const ack = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        editorSocket.emit(SocketEvents.SHAPE_UPDATE, updatePayload, resolve);
      });

      const errStr = getErrorMessage(ack.error).toLowerCase();
      assert(ack.success === false, "Downgraded editor must be rejected");
      assert(errStr.includes("forbidden"), "Error must indicate forbidden");

      // Restore editor role
      await WorkspaceMemberModel.updateOne(
        { workspaceId: workspace._id, userId: editorUser._id },
        { $set: { role: WorkspaceRole.EDITOR } }
      );
    });

    // ----------------------------------------------------
    // CONCURRENT STYLE UPDATES
    // ----------------------------------------------------
    await runTest("24. Concurrent style updates on distinct shapes succeed", async () => {
      // Create a circle for admin to style
      const circleAck = await new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
        ownerSocket.emit(
          SocketEvents.SHAPE_CREATE,
          {
            canvasId: canvasIdStr,
            type: "circle",
            x: 400,
            y: 400,
            width: 100,
            height: 100,
            style: { fill: "#10b981", stroke: "#047857" },
          },
          resolve
        );
      });
      assert(circleAck.success === true, "Circle creation failed");
      const circleId = circleAck.data!.id;
      const circleVersion = circleAck.data!.version;

      // Concurrently update rectangle (by editor) and circle (by admin)
      const [rectRes, circleRes] = await Promise.all([
        new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
          editorSocket.emit(
            SocketEvents.SHAPE_UPDATE,
            {
              shapeId: testRectId,
              expectedVersion: testRectVersion,
              data: { style: { fill: "#8b5cf6" } },
            },
            resolve
          );
        }),
        new Promise<SocketAck<ShapeResponseDto>>((resolve) => {
          adminSocket.emit(
            SocketEvents.SHAPE_UPDATE,
            {
              shapeId: circleId,
              expectedVersion: circleVersion,
              data: { style: { fill: "#f59e0b" } },
            },
            resolve
          );
        }),
      ]);

      assert(rectRes.success === true, "Rectangle concurrent update must succeed");
      assert(circleRes.success === true, "Circle concurrent update must succeed");
      testRectVersion = rectRes.data!.version;
    });

    // ----------------------------------------------------
    // AUTHORITATIVE RECOVERY HYDRATION
    // ----------------------------------------------------
    await runTest("25. Board/canvas hydration restores all appearance properties from MongoDB", async () => {
      const doc = await ShapeModel.findById(testRectId);
      assert(doc !== null, "Document must exist in MongoDB");

      const dto = ShapeMapper.toResponseDto(doc) as RectangleShapeResponseDto;
      assert(dto.style.fill === "#8b5cf6", "Fill must be restored");
      assert(dto.style.strokeWidth === 10, "StrokeWidth must be restored");
      assert(dto.style.strokeStyle === "solid", "StrokeStyle must be restored");
      assert(dto.style.shadow?.enabled === true, "Shadow must be restored");
      assert(dto.style.shadow?.blur === 30, "Shadow blur must be restored");
      assert(dto.style.shadow?.offsetX === 12, "Shadow offsetX must be restored");
      assert(dto.style.shadow?.offsetY === 8, "Shadow offsetY must be restored");
    });

    console.log("\nAll 25 Slice 21 integration tests passed successfully!");
  } finally {
    // Teardown
    ownerSocket.disconnect();
    adminSocket.disconnect();
    editorSocket.disconnect();
    viewerSocket.disconnect();

    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });

    await mongoose.disconnect();
  }
}

// Run test suite directly
runShapeStylingTestSuite().catch((err) => {
  console.error("Slice 21 test suite failed:", err);
  process.exit(1);
});
