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
import { BoardVisibility } from "@/modules/board/board.types";
import { CanvasModel } from "@/modules/canvas/canvas.model";
import { ShapeModel } from "@/modules/shape/shape.model";
import { shapeService, ShapeMapper } from "@/modules/shape";
import { CommentModel } from "@/modules/comment/comment.model";
import { SocketServer } from "../socket.server";
import { SocketEvents } from "../socket.events";
import {
  BoardRecoveryRequestPayload,
  BoardRecoveryStatePayload,
  ClientToServerEvents,
  CommentCreatedPayload,
  CommentDeletedPayload,
  CommentResolvedPayload,
  CommentResponseDto,
  CommentUpdatedPayload,
  CreateCommentPayload,
  CreateShapePayload,
  DeleteCommentPayload,
  DeleteShapePayload,
  ResolveCommentPayload,
  ServerToClientEvents,
  ShapeCreatedPayload,
  ShapeResponseDto,
  ShapeUpdatedPayload,
  SocketAck,
  UpdateCommentPayload,
  UpdateShapePayload,
} from "../socket.types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

type TestSocket = ClientSocket<ServerToClientEvents, ClientToServerEvents>;

async function runSocketConflictProtectionTests(): Promise<void> {
  console.log("Starting Real-Time Concurrent Mutation Conflict Protection Tests (Slice 12)...\n");

  let isDbConnected = false;
  try {
    await mongoose.connect(env.MONGODB_URI);
    isDbConnected = true;
    console.log("Connected to MongoDB for integration testing.");
  } catch (err) {
    console.warn("MongoDB connection unavailable, skipping live DB tests:", err);
    return;
  }

  const httpServer = createServer();
  const socketServer = new SocketServer(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve());
  });

  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : 3000;
  const serverUrl = `http://localhost:${port}`;

  const createAuthClient = (token: string): Promise<TestSocket> => {
    return new Promise((resolve) => {
      const client: TestSocket = clientIO(serverUrl, {
        auth: { token: `Bearer ${token}` },
        transports: ["websocket"],
        reconnection: false,
      });
      client.on("connect", () => resolve(client));
    });
  };

  let clientA!: TestSocket;
  let clientB!: TestSocket;

  try {
    // 0. Seed Test Data
    const ownerUserId = new Types.ObjectId("8a8a92ec09ac3f2f9b0d41e1");
    const collaboratorUserId = new Types.ObjectId("8a8a92ec09ac3f2f9b0d41e2");

    await Promise.all([
      UserModel.deleteMany({ _id: { $in: [ownerUserId, collaboratorUserId] } }),
      WorkspaceModel.deleteMany({ name: "Conflict Test Workspace" }),
      BoardModel.deleteMany({ name: "Conflict Test Board" }),
      CanvasModel.deleteMany({}),
      ShapeModel.deleteMany({}),
      CommentModel.deleteMany({}),
    ]);

    await UserModel.create([
      {
        _id: ownerUserId,
        email: `owner_occ_${Date.now()}@example.com`,
        password: "Password123!",
        fullName: "Owner User",
        role: UserRole.USER,
      },
      {
        _id: collaboratorUserId,
        email: `collab_occ_${Date.now()}@example.com`,
        password: "Password123!",
        fullName: "Collaborator User",
        role: UserRole.USER,
      },
    ]);

    const workspace = await WorkspaceModel.create({
      name: "Conflict Test Workspace",
      ownerId: ownerUserId,
    });

    await WorkspaceMemberModel.create({
      workspaceId: workspace._id,
      userId: collaboratorUserId,
      role: WorkspaceRole.EDITOR,
    });

    const board = await BoardModel.create({
      workspaceId: workspace._id,
      name: "Conflict Test Board",
      visibility: BoardVisibility.PUBLIC,
      createdBy: ownerUserId,
      collaborationRevision: 1,
    });

    const canvas = await CanvasModel.create({
      boardId: board._id,
      name: "Main Canvas",
      order: 1,
    });

    const ownerToken = generateAccessToken({
      userId: ownerUserId.toString(),
      role: UserRole.USER,
    });

    const collaboratorToken = generateAccessToken({
      userId: collaboratorUserId.toString(),
      role: UserRole.USER,
    });

    clientA = await createAuthClient(ownerToken);
    clientB = await createAuthClient(collaboratorToken);

    // Join both clients to board room
    await new Promise<void>((resolve) => {
      clientA.emit(SocketEvents.BOARD_JOIN, { boardId: board._id.toString() }, () => {
        clientB.emit(SocketEvents.BOARD_JOIN, { boardId: board._id.toString() }, () => {
          resolve();
        });
      });
    });

    console.log("✓ Test setup and authenticated board joining completed.");

    // =========================================================================
    // SCENARIO 1: Initial Shape Creation has Version 1
    // =========================================================================
    let initialShapeDto: ShapeResponseDto | null = null;

    await new Promise<void>((resolve) => {
      const payload: CreateShapePayload = {
        canvasId: canvas._id.toString(),
        type: "rectangle",
        x: 100,
        y: 100,
        width: 200,
        height: 100,
        style: {
          fill: "#ff0000",
        },
      };

      clientA.emit(SocketEvents.SHAPE_CREATE, payload, (ack: SocketAck<ShapeResponseDto>) => {
        assert(ack.success === true, "Shape creation must succeed");
        assert(ack.data !== undefined, "Created shape data must be present");
        assert(ack.data?.version === 1, `Initial shape version must be 1, got ${ack.data?.version}`);
        initialShapeDto = ack.data!;
        resolve();
      });
    });

    const shapeInDb = await ShapeModel.findById(initialShapeDto!.id);
    assert(shapeInDb?.version === 1, `Shape in DB must have version 1, got ${shapeInDb?.version}`);
    console.log("✓ Scenario 1: Initial Shape creation assigned version 1 in DTO and DB.");

    // =========================================================================
    // SCENARIO 2: Sequential Shape Updates Increment Version Monotonically
    // =========================================================================
    let v2ShapeDto: ShapeResponseDto | null = null;
    let v3ShapeDto: ShapeResponseDto | null = null;

    // Update 1: expectedVersion = 1 -> should succeed and become v2
    await new Promise<void>((resolve) => {
      const updatePayload: UpdateShapePayload = {
        shapeId: initialShapeDto!.id,
        expectedVersion: 1,
        data: {
          x: 120,
        },
      };

      clientA.emit(SocketEvents.SHAPE_UPDATE, updatePayload, (ack: SocketAck<ShapeResponseDto>) => {
        assert(ack.success === true, "Update with expectedVersion=1 must succeed");
        assert(ack.data?.version === 2, `Updated shape version must be 2, got ${ack.data?.version}`);
        assert(ack.data?.x === 120, "x should be 120");
        v2ShapeDto = ack.data!;
        resolve();
      });
    });

    // Update 2: expectedVersion = 2 -> should succeed and become v3
    await new Promise<void>((resolve) => {
      const updatePayload: UpdateShapePayload = {
        shapeId: initialShapeDto!.id,
        expectedVersion: 2,
        data: {
          x: 150,
        },
      };

      clientB.emit(SocketEvents.SHAPE_UPDATE, updatePayload, (ack: SocketAck<ShapeResponseDto>) => {
        assert(ack.success === true, "Update with expectedVersion=2 must succeed");
        assert(ack.data?.version === 3, `Updated shape version must be 3, got ${ack.data?.version}`);
        assert(ack.data?.x === 150, "x should be 150");
        v3ShapeDto = ack.data!;
        resolve();
      });
    });

    const shapeInDbV3 = await ShapeModel.findById(initialShapeDto!.id);
    assert(shapeInDbV3?.version === 3, `Shape in DB must have version 3, got ${shapeInDbV3?.version}`);
    console.log("✓ Scenario 2: Sequential updates incremented version monotonically (v1 -> v2 -> v3).");

    // =========================================================================
    // SCENARIO 3: Concurrent Shape Updates with Stale expectedVersion Result in 409 Conflict
    // =========================================================================
    // Shape is currently at v3. Client A attempts to update with stale expectedVersion = 1 or 2.
    await new Promise<void>((resolve) => {
      const staleUpdatePayload: UpdateShapePayload = {
        shapeId: initialShapeDto!.id,
        expectedVersion: 1, // Stale! Current is 3
        data: {
          x: 999,
        },
      };

      clientA.emit(SocketEvents.SHAPE_UPDATE, staleUpdatePayload, (ack: SocketAck<ShapeResponseDto>) => {
        assert(ack.success === false, "Update with stale expectedVersion must fail");
        assert(typeof ack.error === "object", "Error must be a structured SocketAckError");
        if (typeof ack.error === "object") {
          assert(ack.error.code === "CONFLICT", `Error code must be CONFLICT, got ${ack.error.code}`);
          assert(ack.error.resourceType === "shape", `resourceType must be shape, got ${ack.error.resourceType}`);
          assert(ack.error.resourceId === initialShapeDto!.id, "resourceId must match");
          assert(ack.error.currentVersion === 3, `currentVersion must be 3, got ${ack.error.currentVersion}`);
        }
        resolve();
      });
    });
    console.log("✓ Scenario 3: Stale expectedVersion returned structured 409 CONFLICT with currentVersion=3.");

    // =========================================================================
    // SCENARIO 4: Failed OCC Update Causes Zero Mutation, Zero Revision Increment, Zero Broadcast
    // =========================================================================
    const boardBeforeConflict = await BoardModel.findById(board._id);
    const revisionBeforeConflict = boardBeforeConflict!.collaborationRevision;

    let broadcastReceived = false;
    const updateListener = () => {
      broadcastReceived = true;
    };
    clientB.on(SocketEvents.SHAPE_UPDATED, updateListener);

    await new Promise<void>((resolve) => {
      const conflictPayload: UpdateShapePayload = {
        shapeId: initialShapeDto!.id,
        expectedVersion: 2, // Stale! Current is 3
        data: {
          x: 888,
          width: 999,
        },
      };

      clientA.emit(SocketEvents.SHAPE_UPDATE, conflictPayload, (ack: SocketAck<ShapeResponseDto>) => {
        assert(ack.success === false, "Conflict update must fail");
        resolve();
      });
    });

    // Wait a brief moment to ensure no socket event was broadcast
    await new Promise((resolve) => setTimeout(resolve, 100));
    clientB.off(SocketEvents.SHAPE_UPDATED, updateListener);

    assert(broadcastReceived === false, "No SHAPE_UPDATED event should be broadcast on conflict");

    const shapeAfterConflict = await ShapeModel.findById(initialShapeDto!.id);
    assert(shapeAfterConflict?.version === 3, `Shape version must remain 3, got ${shapeAfterConflict?.version}`);
    assert(shapeAfterConflict?.x === 150, `Shape x must remain 150, got ${shapeAfterConflict?.x}`);
    assert(shapeAfterConflict?.width === 200, `Shape width must remain 200, got ${shapeAfterConflict?.width}`);

    const boardAfterConflict = await BoardModel.findById(board._id);
    assert(
      boardAfterConflict?.collaborationRevision === revisionBeforeConflict,
      `Board revision must NOT increment on conflict (${revisionBeforeConflict} vs ${boardAfterConflict?.collaborationRevision})`
    );
    console.log("✓ Scenario 4: Conflicting mutation aborted with zero entity mutation, zero revision increment, and zero broadcast.");

    // =========================================================================
    // SCENARIO 5: OCC Works With or Without Soft-Locks
    // =========================================================================
    // Lock shape with Client A, mutate with expectedVersion=3 -> succeeds and becomes v4
    await new Promise<void>((resolve) => {
      clientA.emit(
        SocketEvents.SHAPE_LOCK,
        { boardId: board._id.toString(), shapeId: initialShapeDto!.id },
        (ack) => {
          assert(ack.success === true, "Locking shape must succeed");
          resolve();
        }
      );
    });

    await new Promise<void>((resolve) => {
      const updatePayload: UpdateShapePayload = {
        shapeId: initialShapeDto!.id,
        expectedVersion: 3,
        data: {
          x: 200,
        },
      };

      clientA.emit(SocketEvents.SHAPE_UPDATE, updatePayload, (ack: SocketAck<ShapeResponseDto>) => {
        assert(ack.success === true, "Locked shape update with matching expectedVersion must succeed");
        assert(ack.data?.version === 4, `Version must increment to 4, got ${ack.data?.version}`);
        resolve();
      });
    });

    // Unlock shape
    await new Promise<void>((resolve) => {
      clientA.emit(
        SocketEvents.SHAPE_UNLOCK,
        { boardId: board._id.toString(), shapeId: initialShapeDto!.id },
        () => resolve()
      );
    });

    // Unlocked update with expectedVersion=4 -> succeeds and becomes v5
    await new Promise<void>((resolve) => {
      const updatePayload: UpdateShapePayload = {
        shapeId: initialShapeDto!.id,
        expectedVersion: 4,
        data: {
          x: 220,
        },
      };

      clientB.emit(SocketEvents.SHAPE_UPDATE, updatePayload, (ack: SocketAck<ShapeResponseDto>) => {
        assert(ack.success === true, "Unlocked shape update with matching expectedVersion must succeed");
        assert(ack.data?.version === 5, `Version must increment to 5, got ${ack.data?.version}`);
        resolve();
      });
    });
    console.log("✓ Scenario 5: OCC operates seamlessly with and without soft-locks.");

    // =========================================================================
    // SCENARIO 6: Delete Shape with Stale expectedVersion Fails with Conflict
    // =========================================================================
    // Shape is currently at v5. Delete with expectedVersion=3 -> fails with 409
    await new Promise<void>((resolve) => {
      const deletePayload: DeleteShapePayload = {
        shapeId: initialShapeDto!.id,
        expectedVersion: 3, // Stale!
      };

      clientA.emit(SocketEvents.SHAPE_DELETE, deletePayload, (ack) => {
        assert(ack.success === false, "Delete with stale expectedVersion must fail");
        if (typeof ack.error === "object") {
          assert(ack.error.code === "CONFLICT", `Delete error code must be CONFLICT, got ${ack.error.code}`);
          assert(ack.error.currentVersion === 5, `currentVersion must be 5, got ${ack.error.currentVersion}`);
        }
        resolve();
      });
    });

    // Shape should still exist
    const shapeStillExists = await ShapeModel.findById(initialShapeDto!.id);
    assert(shapeStillExists !== null, "Shape must still exist in DB after conflicting delete");

    // Delete with expectedVersion=5 -> succeeds
    await new Promise<void>((resolve) => {
      const deletePayload: DeleteShapePayload = {
        shapeId: initialShapeDto!.id,
        expectedVersion: 5,
      };

      clientA.emit(SocketEvents.SHAPE_DELETE, deletePayload, (ack) => {
        assert(ack.success === true, "Delete with matching expectedVersion=5 must succeed");
        resolve();
      });
    });

    const shapeDeleted = await ShapeModel.findById(initialShapeDto!.id);
    assert(shapeDeleted === null, "Shape must be deleted from DB");
    console.log("✓ Scenario 6: Shape deletion respects expectedVersion and rejects stale deletes.");

    // =========================================================================
    // SCENARIO 7: Initial Comment Creation has Version 1
    // =========================================================================
    let commentDto: CommentResponseDto | null = null;

    await new Promise<void>((resolve) => {
      const createCommentPayload: CreateCommentPayload = {
        boardId: board._id.toString(),
        content: "Initial collaborative review note",
      };

      clientA.emit(SocketEvents.COMMENT_CREATE, createCommentPayload, (ack: SocketAck<CommentResponseDto>) => {
        assert(ack.success === true, "Comment creation must succeed");
        assert(ack.data?.version === 1, `Comment initial version must be 1, got ${ack.data?.version}`);
        commentDto = ack.data!;
        resolve();
      });
    });

    const commentInDb = await CommentModel.findById(commentDto!.id);
    assert(commentInDb?.version === 1, `Comment in DB must have version 1, got ${commentInDb?.version}`);
    console.log("✓ Scenario 7: Initial Comment creation assigned version 1.");

    // =========================================================================
    // SCENARIO 8: Concurrent Comment Updates with Stale expectedVersion Result in 409 Conflict
    // =========================================================================
    // Update comment with expectedVersion=1 -> succeeds and becomes v2
    await new Promise<void>((resolve) => {
      const updatePayload: UpdateCommentPayload = {
        boardId: board._id.toString(),
        commentId: commentDto!.id,
        expectedVersion: 1,
        content: "Updated comment text v2",
      };

      clientA.emit(SocketEvents.COMMENT_UPDATE, updatePayload, (ack: SocketAck<CommentResponseDto>) => {
        assert(ack.success === true, "Comment update with expectedVersion=1 must succeed");
        assert(ack.data?.version === 2, `Comment version must be 2, got ${ack.data?.version}`);
        assert(ack.data?.content === "Updated comment text v2", "Content must match");
        resolve();
      });
    });

    // Client B attempts to update with stale expectedVersion=1 -> fails with CONFLICT
    await new Promise<void>((resolve) => {
      const staleUpdatePayload: UpdateCommentPayload = {
        boardId: board._id.toString(),
        commentId: commentDto!.id,
        expectedVersion: 1, // Stale! Current is 2
        content: "Overwriting comment from stale client",
      };

      clientA.emit(SocketEvents.COMMENT_UPDATE, staleUpdatePayload, (ack: SocketAck<CommentResponseDto>) => {
        assert(ack.success === false, "Comment update with stale expectedVersion must fail");
        if (typeof ack.error === "object") {
          assert(ack.error.code === "CONFLICT", `Error code must be CONFLICT, got ${ack.error.code}`);
          assert(ack.error.resourceType === "comment", `resourceType must be comment, got ${ack.error.resourceType}`);
          assert(ack.error.resourceId === commentDto!.id, "resourceId must match");
          assert(ack.error.currentVersion === 2, `currentVersion must be 2, got ${ack.error.currentVersion}`);
        }
        resolve();
      });
    });

    const commentInDbAfterConflict = await CommentModel.findById(commentDto!.id);
    assert(commentInDbAfterConflict?.content === "Updated comment text v2", "Comment content must remain unchanged");
    assert(commentInDbAfterConflict?.version === 2, "Comment version must remain 2");
    console.log("✓ Scenario 8: Stale comment update rejected with 409 CONFLICT; state remained unpolluted.");

    // =========================================================================
    // SCENARIO 9: Concurrent Comment Resolve/Unresolve Conflict Rejection
    // =========================================================================
    // Resolve comment with expectedVersion=2 -> succeeds and becomes v3
    await new Promise<void>((resolve) => {
      const resolvePayload: ResolveCommentPayload = {
        boardId: board._id.toString(),
        commentId: commentDto!.id,
        expectedVersion: 2,
        isResolved: true,
      };

      clientB.emit(SocketEvents.COMMENT_RESOLVE, resolvePayload, (ack: SocketAck<CommentResponseDto>) => {
        assert(ack.success === true, "Comment resolve with expectedVersion=2 must succeed");
        assert(ack.data?.version === 3, `Comment version must be 3, got ${ack.data?.version}`);
        assert(ack.data?.isResolved === true, "Comment must be resolved");
        resolve();
      });
    });

    // Attempt to unresolve with stale expectedVersion=2 -> fails with CONFLICT
    await new Promise<void>((resolve) => {
      const staleResolvePayload: ResolveCommentPayload = {
        boardId: board._id.toString(),
        commentId: commentDto!.id,
        expectedVersion: 2, // Stale! Current is 3
        isResolved: false,
      };

      clientA.emit(SocketEvents.COMMENT_RESOLVE, staleResolvePayload, (ack: SocketAck<CommentResponseDto>) => {
        assert(ack.success === false, "Stale resolve must fail");
        if (typeof ack.error === "object") {
          assert(ack.error.code === "CONFLICT", `Error code must be CONFLICT, got ${ack.error.code}`);
          assert(ack.error.currentVersion === 3, `currentVersion must be 3, got ${ack.error.currentVersion}`);
        }
        resolve();
      });
    });
    console.log("✓ Scenario 9: Stale comment resolve/unresolve rejected with 409 CONFLICT.");

    // =========================================================================
    // SCENARIO 10: Concurrent Comment Soft-Delete Conflict Rejection
    // =========================================================================
    // Attempt soft delete with stale expectedVersion=2 -> fails with CONFLICT
    await new Promise<void>((resolve) => {
      const staleDeletePayload: DeleteCommentPayload = {
        boardId: board._id.toString(),
        commentId: commentDto!.id,
        expectedVersion: 2, // Stale! Current is 3
      };

      clientA.emit(SocketEvents.COMMENT_DELETE, staleDeletePayload, (ack: SocketAck<CommentResponseDto>) => {
        assert(ack.success === false, "Delete comment with stale expectedVersion must fail");
        if (typeof ack.error === "object") {
          assert(ack.error.code === "CONFLICT", `Error code must be CONFLICT, got ${ack.error.code}`);
          assert(ack.error.currentVersion === 3, `currentVersion must be 3, got ${ack.error.currentVersion}`);
        }
        resolve();
      });
    });

    const commentNotDeleted = await CommentModel.findById(commentDto!.id);
    assert(commentNotDeleted?.deletedAt === null, "Comment must not be deleted");

    // Soft delete with expectedVersion=3 -> succeeds and becomes v4
    await new Promise<void>((resolve) => {
      const validDeletePayload: DeleteCommentPayload = {
        boardId: board._id.toString(),
        commentId: commentDto!.id,
        expectedVersion: 3,
      };

      clientA.emit(SocketEvents.COMMENT_DELETE, validDeletePayload, (ack: SocketAck<CommentResponseDto>) => {
        assert(ack.success === true, "Delete comment with expectedVersion=3 must succeed");
        assert(ack.data?.version === 4, `Deleted comment version must be 4, got ${ack.data?.version}`);
        assert(ack.data?.isDeleted === true, "Comment must be marked deleted");
        resolve();
      });
    });

    const commentSoftDeleted = await CommentModel.findById(commentDto!.id);
    assert(commentSoftDeleted?.deletedAt !== null, "Comment must be marked deleted in DB");
    assert(commentSoftDeleted?.version === 4, `Deleted comment version in DB must be 4, got ${commentSoftDeleted?.version}`);
    console.log("✓ Scenario 10: Stale comment soft-delete rejected; valid delete updated version to 4.");

    // =========================================================================
    // SCENARIO 11: End-to-End OCC Conflict & Authoritative Hydration Recovery Flow
    // =========================================================================
    const canvasObjectId = canvas._id as Types.ObjectId;
    const boardObjectId = board._id as Types.ObjectId;

    // 1. Create a fresh shape
    let recoveryShapeDto: ShapeResponseDto | null = null;
    await new Promise<void>((resolve) => {
      const payload: CreateShapePayload = {
        canvasId: canvasObjectId.toString(),
        type: "text",
        x: 500,
        y: 500,
        width: 150,
        height: 50,
        style: {
          text: "Recovery test text",
        },
      };

      clientA.emit(SocketEvents.SHAPE_CREATE, payload, (ack: SocketAck<ShapeResponseDto>) => {
        assert(ack.success === true, "Shape creation must succeed");
        assert(ack.data?.version === 1, "Initial version must be 1");
        recoveryShapeDto = ack.data!;
        resolve();
      });
    });

    // 2. Client B advances the shape from v1 to v2 behind Client A's back
    await new Promise<void>((resolve) => {
      clientB.emit(
        SocketEvents.SHAPE_UPDATE,
        {
          shapeId: recoveryShapeDto!.id,
          expectedVersion: 1,
          data: {
            x: 600,
          },
        },
        (ack: SocketAck<ShapeResponseDto>) => {
          assert(ack.success === true, "Client B update must succeed");
          assert(ack.data?.version === 2, "Client B update version must be 2");
          resolve();
        }
      );
    });

    // 3. Client A attempts to update assuming shape is still v1 -> gets 409 CONFLICT
    let conflictAcknowledged: boolean = false;
    await new Promise<void>((resolve) => {
      clientA.emit(
        SocketEvents.SHAPE_UPDATE,
        {
          shapeId: recoveryShapeDto!.id,
          expectedVersion: 1, // Stale!
          data: {
            x: 700,
          },
        },
        (ack: SocketAck<ShapeResponseDto>) => {
          assert(ack.success === false, "Client A stale update must fail");
          if (typeof ack.error === "object") {
            assert(ack.error.code === "CONFLICT", "Must be CONFLICT");
            assert(ack.error.currentVersion === 2, "Reported currentVersion must be 2");
            conflictAcknowledged = true;
          }
          resolve();
        }
      );
    });
    assert(conflictAcknowledged, "Client A must receive conflict ack");

    // 4. Client A initiates board recovery (Slice 10 recovery protocol)
    let recoveredShape: ShapeResponseDto | null = null;
    await new Promise<void>((resolve) => {
      const recoveryPayload: BoardRecoveryRequestPayload = {
        boardId: boardObjectId.toString(),
      };

      clientA.emit(
        SocketEvents.BOARD_RECOVERY_REQUEST,
        recoveryPayload,
        async (ack: SocketAck<BoardRecoveryStatePayload>) => {
          assert(ack.success === true, "Board recovery request must succeed");
          assert(ack.data !== undefined, "Recovery state must be provided");
          assert(ack.data?.boardId === boardObjectId.toString(), "BoardId must match");

          // Authoritative REST/DB hydration
          const shapes = await shapeService.getCanvasShapes(canvasObjectId);
          const mapped = shapes.map((s) => ShapeMapper.toResponseDto(s));
          const found = mapped.find((s) => s.id === recoveryShapeDto!.id);
          assert(found !== undefined, "Recovered shapes must include recoveryShape");
          assert(found?.version === 2, `Recovered shape version must be 2, got ${found?.version}`);
          assert(found?.x === 600, `Recovered shape x must be 600, got ${found?.x}`);
          recoveredShape = found!;
          resolve();
        }
      );
    });

    // 5. Client A re-attempts mutation with the freshly recovered version (expectedVersion=2) -> succeeds!
    await new Promise<void>((resolve) => {
      clientA.emit(
        SocketEvents.SHAPE_UPDATE,
        {
          shapeId: recoveredShape!.id,
          expectedVersion: recoveredShape!.version, // 2
          data: {
            x: 750,
          },
        },
        (ack: SocketAck<ShapeResponseDto>) => {
          assert(ack.success === true, "Re-attempted update after recovery must succeed");
          assert(ack.data?.version === 3, `Shape version must become 3, got ${ack.data?.version}`);
          assert(ack.data?.x === 750, `Shape x must be 750, got ${ack.data?.x}`);
          resolve();
        }
      );
    });
    console.log("✓ Scenario 11: Full OCC Conflict -> Recovery -> Re-attempt mutation flow succeeded end-to-end.");

    console.log("\nAll Real-Time Concurrent Mutation Conflict Protection Tests Passed Successfully! (11/11)\n");
  } finally {
    clientA?.disconnect();
    clientB?.disconnect();
    socketServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    if (isDbConnected) {
      await mongoose.disconnect();
    }
  }
}

runSocketConflictProtectionTests().catch((error) => {
  console.error("Socket Conflict Protection test failed:", error);
  process.exit(1);
});
