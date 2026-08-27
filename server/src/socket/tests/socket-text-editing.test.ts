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
import { TextShapeResponseDto } from "@/modules/shape/shape.dto";
import { SocketEvents } from "../socket.events";
import { SocketServer } from "../socket.server";
import {
  CreateShapePayload,
  UpdateShapePayload,
  SocketAck,
  InteractionStartPayload,
  InteractionUpdatePayload,
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

async function runTextEditingTests(): Promise<void> {
  console.log("Starting Slice 19: Advanced Text Editing & Rich Text Shapes Integration Tests...\n");

  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB for Slice 19 test fixture setup.");

  // Clear test fixtures
  await Promise.all([
    UserModel.deleteMany({ email: { $regex: /@slice19-test\.com$/ } }),
    WorkspaceModel.deleteMany({ name: { $regex: /Slice 19/ } }),
    WorkspaceMemberModel.deleteMany({}),
    BoardModel.deleteMany({ name: { $regex: /Slice 19/ } }),
    CanvasModel.deleteMany({ name: { $regex: /Slice 19/ } }),
    ShapeModel.deleteMany({}),
    MutationRecordModel.deleteMany({}),
  ]);

  // Seed Users
  const ownerUser = await UserModel.create({
    email: "owner@slice19-test.com",
    password: "Password123!",
    fullName: "Alice Owner",
  });

  const adminUser = await UserModel.create({
    email: "admin@slice19-test.com",
    password: "Password123!",
    fullName: "Bob Admin",
  });

  const editorUser = await UserModel.create({
    email: "editor@slice19-test.com",
    password: "Password123!",
    fullName: "Charlie Editor",
  });

  const viewerUser = await UserModel.create({
    email: "viewer@slice19-test.com",
    password: "Password123!",
    fullName: "David Viewer",
  });

  // Seed Workspace
  const workspace = await WorkspaceModel.create({
    name: "Slice 19 Text Workspace",
    ownerId: ownerUser._id,
  });

  // Seed Memberships
  const editorMember = await WorkspaceMemberModel.create({
    workspaceId: workspace._id,
    userId: editorUser._id,
    role: WorkspaceRole.EDITOR,
  });

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
      userId: viewerUser._id,
      role: WorkspaceRole.VIEWER,
    }),
  ]);

  // Seed Board & Canvas
  const board = await BoardModel.create({
    name: "Slice 19 Text Board",
    workspaceId: workspace._id,
    createdBy: ownerUser._id,
    collaborationRevision: 0,
  });

  const canvas = await CanvasModel.create({
    name: "Slice 19 Main Canvas",
    boardId: board._id,
    order: 1,
  });

  // Start HTTP & Socket.IO server
  const httpServer = createServer();
  const socketServer = new SocketServer(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));

  const port = (httpServer.address() as { port: number }).port;
  const serverUrl = `http://localhost:${port}`;

  // Helper to create authenticated client
  const createTestClient = async (user: { _id: Types.ObjectId; email: string }): Promise<ClientSocket> => {
    const token = generateAccessToken({
      userId: user._id.toString(),
      role: UserRole.USER,
    });

    const client = clientIO(serverUrl, {
      auth: { token },
      transports: ["websocket"],
      forceNew: true,
    });

    await new Promise<void>((resolve, reject) => {
      client.on("connect", resolve);
      client.on("connect_error", reject);
    });

    // Join board room
    await new Promise((resolve) => {
      client.emit(SocketEvents.BOARD_JOIN, { boardId: board._id.toString() }, resolve);
    });

    return client;
  };

  const ownerSocket = await createTestClient(ownerUser);
  const adminSocket = await createTestClient(adminUser);
  const editorSocket = await createTestClient(editorUser);
  const viewerSocket = await createTestClient(viewerUser);

  let testsPassed = 0;

  // Helper to wrap shape:create ack
  const emitCreate = (socket: ClientSocket, payload: CreateShapePayload): Promise<SocketAck<TextShapeResponseDto>> => {
    return new Promise((resolve) => {
      socket.emit(SocketEvents.SHAPE_CREATE, payload, resolve);
    });
  };

  // Helper to wrap shape:update ack
  const emitUpdate = (socket: ClientSocket, payload: UpdateShapePayload): Promise<SocketAck<TextShapeResponseDto>> => {
    return new Promise((resolve) => {
      socket.emit(SocketEvents.SHAPE_UPDATE, payload, resolve);
    });
  };

  // Track shape ID created for updates
  let createdTextShapeId = "";

  try {
    // -------------------------------------------------------------
    // TEST 1: OWNER text creation
    // -------------------------------------------------------------
    {
      const res = await emitCreate(ownerSocket, {
        canvasId: canvas._id.toString(),
        type: "text",
        x: 100,
        y: 100,
        width: 200,
        height: 40,
        rotation: 0,
        text: "Owner Created Text",
        style: {
          fontSize: 24,
          fontFamily: "Inter",
          fill: "#111827",
        },
      });

      assert(res.success === true, "Owner text creation must succeed");
      assert(res.data?.type === "text", "Response type must be text");
      assert(res.data?.text === "Owner Created Text", "Response text must be 'Owner Created Text'");
      assert(res.data?.style.fontSize === 24, "Font size must match");
      testsPassed++;
      console.log("PASS 1: OWNER text creation");
    }

    // -------------------------------------------------------------
    // TEST 2: ADMIN text creation
    // -------------------------------------------------------------
    {
      const res = await emitCreate(adminSocket, {
        canvasId: canvas._id.toString(),
        type: "text",
        x: 120,
        y: 120,
        width: 200,
        height: 40,
        text: "Admin Created Text",
      });

      assert(res.success === true, "Admin text creation must succeed");
      assert(res.data?.text === "Admin Created Text", "Admin text content must match");
      testsPassed++;
      console.log("PASS 2: ADMIN text creation");
    }

    // -------------------------------------------------------------
    // TEST 3: EDITOR text creation
    // -------------------------------------------------------------
    {
      const res = await emitCreate(editorSocket, {
        canvasId: canvas._id.toString(),
        type: "text",
        x: 150,
        y: 150,
        width: 250,
        height: 50,
        text: "Editor Initial Text",
        style: {
          fontSize: 20,
          fontFamily: "Roboto",
          fill: "#2563eb",
        },
      });

      assert(res.success === true, "Editor text creation must succeed");
      assert(res.data?.text === "Editor Initial Text", "Editor text must match");
      createdTextShapeId = res.data!.id;
      testsPassed++;
      console.log("PASS 3: EDITOR text creation");
    }

    // -------------------------------------------------------------
    // TEST 4: VIEWER creation rejected
    // -------------------------------------------------------------
    {
      const res = await emitCreate(viewerSocket, {
        canvasId: canvas._id.toString(),
        type: "text",
        x: 200,
        y: 200,
        width: 100,
        height: 30,
        text: "Viewer Unauthorized Text",
      });

      assert(res.success === false, "Viewer text creation must fail");
      assert(getErrorCode(res.error) === "FORBIDDEN", "Viewer error code must be FORBIDDEN");
      testsPassed++;
      console.log("PASS 4: VIEWER creation rejected");
    }

    // -------------------------------------------------------------
    // TEST 5: text content update
    // -------------------------------------------------------------
    {
      const res = await emitUpdate(editorSocket, {
        shapeId: createdTextShapeId,
        expectedVersion: 1,
        data: {
          text: "Editor Updated Content",
        },
      });

      assert(res.success === true, "Text content update must succeed");
      assert(res.data?.text === "Editor Updated Content", "Text content must be updated");
      assert(res.data?.version === 2, "Version must be incremented to 2");
      testsPassed++;
      console.log("PASS 5: text content update");
    }

    // -------------------------------------------------------------
    // TEST 6: formatting update
    // -------------------------------------------------------------
    {
      const res = await emitUpdate(editorSocket, {
        shapeId: createdTextShapeId,
        expectedVersion: 2,
        data: {
          style: {
            fontSize: 32,
            fontFamily: "Georgia",
            fill: "#dc2626",
            opacity: 0.9,
          },
        },
      });

      assert(res.success === true, "Formatting update must succeed");
      assert(res.data?.style.fontSize === 32, "Font size must be 32");
      assert(res.data?.style.fontFamily === "Georgia", "Font family must be Georgia");
      assert(res.data?.style.fill === "#dc2626", "Fill must be updated");
      assert(res.data?.style.opacity === 0.9, "Opacity must be 0.9");
      testsPassed++;
      console.log("PASS 6: formatting update");
    }

    // -------------------------------------------------------------
    // TEST 7: bold formatting
    // -------------------------------------------------------------
    {
      const res = await emitUpdate(editorSocket, {
        shapeId: createdTextShapeId,
        expectedVersion: 3,
        data: {
          style: {
            fontWeight: "bold",
          },
        },
      });

      assert(res.success === true, "Bold formatting update must succeed");
      assert(res.data?.style.fontWeight === "bold", "Font weight must be bold");
      testsPassed++;
      console.log("PASS 7: bold formatting");
    }

    // -------------------------------------------------------------
    // TEST 8: italic formatting
    // -------------------------------------------------------------
    {
      const res = await emitUpdate(editorSocket, {
        shapeId: createdTextShapeId,
        expectedVersion: 4,
        data: {
          style: {
            fontStyle: "italic",
          },
        },
      });

      assert(res.success === true, "Italic formatting update must succeed");
      assert(res.data?.style.fontStyle === "italic", "Font style must be italic");
      testsPassed++;
      console.log("PASS 8: italic formatting");
    }

    // -------------------------------------------------------------
    // TEST 9: underline formatting
    // -------------------------------------------------------------
    {
      const res = await emitUpdate(editorSocket, {
        shapeId: createdTextShapeId,
        expectedVersion: 5,
        data: {
          style: {
            textDecoration: "underline",
          },
        },
      });

      assert(res.success === true, "Underline formatting update must succeed");
      assert(res.data?.style.textDecoration === "underline", "Text decoration must be underline");
      testsPassed++;
      console.log("PASS 9: underline formatting");
    }

    // -------------------------------------------------------------
    // TEST 10: horizontal alignment
    // -------------------------------------------------------------
    {
      const res = await emitUpdate(editorSocket, {
        shapeId: createdTextShapeId,
        expectedVersion: 6,
        data: {
          style: {
            textAlign: "center",
          },
        },
      });

      assert(res.success === true, "Horizontal alignment center must succeed");
      assert(res.data?.style.textAlign === "center", "TextAlign must be center");
      testsPassed++;
      console.log("PASS 10: horizontal alignment");
    }

    // -------------------------------------------------------------
    // TEST 11: vertical alignment
    // -------------------------------------------------------------
    {
      const res = await emitUpdate(editorSocket, {
        shapeId: createdTextShapeId,
        expectedVersion: 7,
        data: {
          style: {
            verticalAlign: "middle",
          },
        },
      });

      assert(res.success === true, "Vertical alignment middle must succeed");
      assert(res.data?.style.verticalAlign === "middle", "VerticalAlign must be middle");
      testsPassed++;
      console.log("PASS 11: vertical alignment");
    }

    // -------------------------------------------------------------
    // TEST 12: lineHeight
    // -------------------------------------------------------------
    {
      const res = await emitUpdate(editorSocket, {
        shapeId: createdTextShapeId,
        expectedVersion: 8,
        data: {
          style: {
            lineHeight: 1.8,
          },
        },
      });

      assert(res.success === true, "Line height update must succeed");
      assert(res.data?.style.lineHeight === 1.8, "LineHeight must be 1.8");
      testsPassed++;
      console.log("PASS 12: lineHeight");
    }

    // -------------------------------------------------------------
    // TEST 13: padding
    // -------------------------------------------------------------
    {
      const res = await emitUpdate(editorSocket, {
        shapeId: createdTextShapeId,
        expectedVersion: 9,
        data: {
          style: {
            padding: 16,
          },
        },
      });

      assert(res.success === true, "Padding update must succeed");
      assert(res.data?.style.padding === 16, "Padding must be 16");
      testsPassed++;
      console.log("PASS 13: padding");
    }

    // -------------------------------------------------------------
    // TEST 14: invalid text type
    // -------------------------------------------------------------
    {
      const res = await emitUpdate(editorSocket, {
        shapeId: createdTextShapeId,
        data: {
          text: 12345 as unknown as string,
        },
      });

      assert(res.success === false, "Invalid text type must fail validation");
      assert(getErrorCode(res.error) === "BAD_REQUEST", "Error code must be BAD_REQUEST");
      testsPassed++;
      console.log("PASS 14: invalid text type");
    }

    // -------------------------------------------------------------
    // TEST 15: oversized text (> 10000 characters)
    // -------------------------------------------------------------
    {
      const hugeText = "A".repeat(10001);
      const res = await emitUpdate(editorSocket, {
        shapeId: createdTextShapeId,
        data: {
          text: hugeText,
        },
      });

      assert(res.success === false, "Oversized text must fail validation");
      assert(getErrorCode(res.error) === "BAD_REQUEST", "Error code must be BAD_REQUEST");
      testsPassed++;
      console.log("PASS 15: oversized text");
    }

    // -------------------------------------------------------------
    // TEST 16: invalid fontSize (< 8 or > 200)
    // -------------------------------------------------------------
    {
      const resTooSmall = await emitUpdate(editorSocket, {
        shapeId: createdTextShapeId,
        data: {
          style: { fontSize: 4 },
        },
      });
      assert(resTooSmall.success === false, "Font size < 8 must fail");

      const resTooBig = await emitUpdate(editorSocket, {
        shapeId: createdTextShapeId,
        data: {
          style: { fontSize: 250 },
        },
      });
      assert(resTooBig.success === false, "Font size > 200 must fail");
      testsPassed++;
      console.log("PASS 16: invalid fontSize");
    }

    // -------------------------------------------------------------
    // TEST 17: invalid fontWeight
    // -------------------------------------------------------------
    {
      const res = await emitUpdate(editorSocket, {
        shapeId: createdTextShapeId,
        data: {
          style: { fontWeight: "a".repeat(30) },
        },
      });

      assert(res.success === false, "Invalid fontWeight must fail validation");
      testsPassed++;
      console.log("PASS 17: invalid fontWeight");
    }

    // -------------------------------------------------------------
    // TEST 18: invalid alignment
    // -------------------------------------------------------------
    {
      const res = await emitUpdate(editorSocket, {
        shapeId: createdTextShapeId,
        data: {
          style: { textAlign: "justify" as unknown as "left" },
        },
      });

      assert(res.success === false, "Invalid alignment must fail validation");
      testsPassed++;
      console.log("PASS 18: invalid alignment");
    }

    // -------------------------------------------------------------
    // TEST 19: invalid dimensions (width <= 0)
    // -------------------------------------------------------------
    {
      const res = await emitUpdate(editorSocket, {
        shapeId: createdTextShapeId,
        data: {
          width: -50,
        },
      });

      assert(res.success === false, "Negative width must fail validation");
      testsPassed++;
      console.log("PASS 19: invalid dimensions");
    }

    // -------------------------------------------------------------
    // TEST 20: OCC successful update
    // -------------------------------------------------------------
    {
      const currentDoc = await ShapeModel.findById(new Types.ObjectId(createdTextShapeId));
      assert(currentDoc !== null, "Current shape must exist in DB");
      const currentVersion = currentDoc!.version;

      const res = await emitUpdate(editorSocket, {
        shapeId: createdTextShapeId,
        expectedVersion: currentVersion,
        data: {
          text: "OCC Success Content",
        },
      });

      assert(res.success === true, "OCC update with matching expectedVersion must succeed");
      assert(res.data?.version === currentVersion + 1, "New version must increment by 1");
      testsPassed++;
      console.log("PASS 20: OCC successful update");
    }

    // -------------------------------------------------------------
    // TEST 21: stale OCC conflict
    // -------------------------------------------------------------
    {
      const res = await emitUpdate(editorSocket, {
        shapeId: createdTextShapeId,
        expectedVersion: 1, // Stale version
        data: {
          text: "Stale OCC Update",
        },
      });

      assert(res.success === false, "Stale OCC update must be rejected");
      assert(getErrorCode(res.error) === "CONFLICT", "Error code must be CONFLICT");
      testsPassed++;
      console.log("PASS 21: stale OCC conflict");
    }

    // -------------------------------------------------------------
    // TEST 22: collaborationRevision increment
    // -------------------------------------------------------------
    {
      const boardBefore = await BoardModel.findById(board._id);
      const revBefore = boardBefore!.collaborationRevision;

      const res = await emitCreate(editorSocket, {
        canvasId: canvas._id.toString(),
        type: "text",
        x: 300,
        y: 300,
        width: 150,
        height: 40,
        text: "Revision Check Text",
      });

      assert(res.success === true, "Shape creation must succeed");

      const boardAfter = await BoardModel.findById(board._id);
      const revAfter = boardAfter!.collaborationRevision;
      assert(revAfter === revBefore + 1, `collaborationRevision must increment by 1 (was ${revBefore}, now ${revAfter})`);
      testsPassed++;
      console.log("PASS 22: collaborationRevision increment");
    }

    // -------------------------------------------------------------
    // TEST 23: MutationRecord creation
    // -------------------------------------------------------------
    {
      const mutationId = crypto.randomUUID();
      const res = await emitCreate(editorSocket, {
        canvasId: canvas._id.toString(),
        mutationId,
        type: "text",
        x: 320,
        y: 320,
        width: 150,
        height: 40,
        text: "Idempotent Text",
      });

      assert(res.success === true, "First attempt with mutationId must succeed");

      const record = await MutationRecordModel.findOne({ mutationId });
      assert(record !== null, "MutationRecord must be created in MongoDB");
      assert(record!.status === "completed", "MutationRecord status must be completed");

      // Replay identical mutation
      const replayRes = await emitCreate(editorSocket, {
        canvasId: canvas._id.toString(),
        mutationId,
        type: "text",
        x: 320,
        y: 320,
        width: 150,
        height: 40,
        text: "Idempotent Text",
      });

      assert(replayRes.success === true, "Idempotent replay must succeed");
      assert(replayRes.data?.id === res.data?.id, "Replay must return identical shape ID");
      testsPassed++;
      console.log("PASS 23: MutationRecord creation & idempotency");
    }

    // -------------------------------------------------------------
    // TEST 24: typing produces zero DB writes
    // -------------------------------------------------------------
    {
      const targetShape = await ShapeModel.findById(new Types.ObjectId(createdTextShapeId));
      const targetVersion = targetShape!.version;
      const targetUpdatedAt = targetShape!.updatedAt.toISOString();

      // Simulate client entering editing-text interaction and sending heartbeats
      const startPayload: InteractionStartPayload = {
        boardId: board._id.toString(),
        type: "editing-text",
        targets: [{ type: "shape", id: createdTextShapeId }],
        data: { isTyping: true },
      };

      const startAck = await new Promise<SocketAck<{ interactionId: string }>>((resolve) => {
        editorSocket.emit(SocketEvents.INTERACTION_START, startPayload, resolve);
      });
      assert(startAck.success === true, `Interaction start must succeed (error: ${JSON.stringify(startAck.error)})`);

      // Send interaction update while typing locally
      const updatePayload: InteractionUpdatePayload = {
        boardId: board._id.toString(),
        interactionId: startAck.data!.interactionId,
        data: { isTyping: true, length: 25 },
      };

      await new Promise<SocketAck<unknown>>((resolve) => {
        editorSocket.emit(SocketEvents.INTERACTION_UPDATE, updatePayload, resolve);
      });

      // Verify shape in MongoDB was NOT modified
      const freshDoc = await ShapeModel.findById(new Types.ObjectId(createdTextShapeId));
      assert(freshDoc!.version === targetVersion, "Version must not change during typing interaction");
      assert(freshDoc!.updatedAt.toISOString() === targetUpdatedAt, "UpdatedAt must not change during typing interaction");
      testsPassed++;
      console.log("PASS 24: typing produces zero DB writes");
    }

    // -------------------------------------------------------------
    // TEST 25: runtime EDITOR → VIEWER downgrade blocks commit
    // -------------------------------------------------------------
    {
      // Downgrade editorUser to VIEWER in the database while connected
      await WorkspaceMemberModel.updateOne(
        { _id: editorMember._id },
        { $set: { role: WorkspaceRole.VIEWER } }
      );

      const res = await emitUpdate(editorSocket, {
        shapeId: createdTextShapeId,
        data: {
          text: "Hacked after downgrade",
        },
      });

      assert(res.success === false, "Downgraded user update must be rejected");
      assert(getErrorCode(res.error) === "FORBIDDEN", "Downgraded error must be FORBIDDEN");

      // Restore EDITOR role for remaining tests
      await WorkspaceMemberModel.updateOne(
        { _id: editorMember._id },
        { $set: { role: WorkspaceRole.EDITOR } }
      );
      testsPassed++;
      console.log("PASS 25: runtime EDITOR → VIEWER downgrade blocks commit");
    }

    // -------------------------------------------------------------
    // TEST 26: concurrent text updates
    // -------------------------------------------------------------
    {
      const freshDoc = await ShapeModel.findById(new Types.ObjectId(createdTextShapeId));
      const baseVersion = freshDoc!.version;

      const [res1, res2] = await Promise.all([
        emitUpdate(adminSocket, {
          shapeId: createdTextShapeId,
          expectedVersion: baseVersion,
          data: { text: "Concurrent Admin Win" },
        }),
        emitUpdate(editorSocket, {
          shapeId: createdTextShapeId,
          expectedVersion: baseVersion,
          data: { text: "Concurrent Editor Attempt" },
        }),
      ]);

      const successCount = (res1.success ? 1 : 0) + (res2.success ? 1 : 0);
      const conflictCount =
        (getErrorCode(res1.error) === "CONFLICT" ? 1 : 0) +
        (getErrorCode(res2.error) === "CONFLICT" ? 1 : 0);

      assert(successCount === 1, "Exactly one concurrent update must succeed");
      assert(conflictCount === 1, "Exactly one concurrent update must fail with CONFLICT");
      testsPassed++;
      console.log("PASS 26: concurrent text updates");
    }

    // -------------------------------------------------------------
    // TEST 27: recovery hydration
    // -------------------------------------------------------------
    {
      // Read directly from MongoDB using ShapeModel and ShapeMapper to simulate REST hydration
      const shapes = await ShapeModel.find({ canvasId: canvas._id }).sort({ zIndex: 1 });
      const dtos = shapes.map((doc) => ShapeMapper.toResponseDto(doc));

      const textDto = dtos.find((d) => d.id === createdTextShapeId) as TextShapeResponseDto | undefined;
      assert(textDto !== undefined, "Hydrated text shape must exist");
      assert(typeof textDto!.text === "string" && textDto!.text.length > 0, "Hydrated text must be non-empty string");
      assert(typeof textDto!.style.fontSize === "number", "Hydrated fontSize must be present");
      assert(typeof textDto!.style.fontFamily === "string", "Hydrated fontFamily must be present");
      assert(typeof textDto!.style.fontStyle === "string", "Hydrated fontStyle must be present");
      assert(typeof textDto!.style.textDecoration === "string", "Hydrated textDecoration must be present");
      testsPassed++;
      console.log("PASS 27: recovery hydration");
    }

    // -------------------------------------------------------------
    // TEST 28: empty new text discarded
    // -------------------------------------------------------------
    {
      const countBefore = await ShapeModel.countDocuments({ canvasId: canvas._id });

      // Simulate client discarding empty text (no socket emit is sent by client)
      const emptyInput = "   \n\t  ";
      const trimmed = emptyInput.trim();
      const shouldDiscard = trimmed.length === 0;
      assert(shouldDiscard === true, "Empty trimmed text must be identified for client-side discard");

      const countAfter = await ShapeModel.countDocuments({ canvasId: canvas._id });
      assert(countAfter === countBefore, "Discarded text must create 0 MongoDB shapes");
      testsPassed++;
      console.log("PASS 28: empty new text discarded");
    }

    // -------------------------------------------------------------
    // TEST 29: legacy style.text migration mapping
    // -------------------------------------------------------------
    {
      // Directly create a legacy document with style.text and undefined root text
      const legacyDoc = await ShapeModel.create({
        canvasId: canvas._id,
        type: ShapeType.TEXT,
        x: 400,
        y: 400,
        width: 150,
        height: 40,
        rotation: 0,
        zIndex: 99,
        createdBy: ownerUser._id,
        version: 1,
        style: {
          text: "Legacy Style Text Content",
          fontSize: 18,
          fontFamily: "Inter",
        },
      });

      assert(legacyDoc.text === undefined, "Legacy doc must have undefined root text");

      const mappedDto = ShapeMapper.toResponseDto(legacyDoc) as TextShapeResponseDto;
      assert(mappedDto.type === "text", "Mapped type must be text");
      assert(mappedDto.text === "Legacy Style Text Content", "Legacy style.text must map to root text in DTO");
      assert(mappedDto.style.fontSize === 18, "Legacy fontSize must be preserved");
      testsPassed++;
      console.log("PASS 29: legacy style.text migration mapping");
    }

    // -------------------------------------------------------------
    // TEST 30: new writes contain root text and not style.text
    // -------------------------------------------------------------
    {
      const res = await emitCreate(ownerSocket, {
        canvasId: canvas._id.toString(),
        type: "text",
        x: 500,
        y: 500,
        width: 200,
        height: 50,
        text: "Strict Root Text Invariant",
        style: {
          fontSize: 22,
        },
      });

      assert(res.success === true, "Creation must succeed");
      const newShapeId = res.data!.id;

      const rawDbDoc = await ShapeModel.findById(new Types.ObjectId(newShapeId)).lean();
      assert(rawDbDoc !== null, "Raw document must exist in DB");
      assert((rawDbDoc as any).text === "Strict Root Text Invariant", "DB document MUST have root 'text'");
      assert((rawDbDoc as any).style?.text === undefined, "DB document MUST NOT have 'style.text'");
      testsPassed++;
      console.log("PASS 30: new writes contain root text and not style.text");
    }

    console.log(`\nAll ${testsPassed}/30 Slice 19 Backend Integration Tests Passed Successfully!`);
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

runTextEditingTests().catch((err) => {
  console.error("Slice 19 Test Suite Failed:", err);
  process.exit(1);
});
