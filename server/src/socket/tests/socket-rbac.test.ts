import { createServer } from "http";
import mongoose, { Types } from "mongoose";
import { io as clientIO, Socket as ClientSocket } from "socket.io-client";

import env from "@/config/env";
import { generateAccessToken } from "@/modules/auth/auth.tokens";
import { UserRole } from "@/modules/user/user.types";
import { WorkspaceModel } from "@/modules/workspace/workspace.model";
import { WorkspaceMemberModel } from "@/modules/workspace/workspaceMember.model";
import { WorkspaceRole, WorkspaceVisibility } from "@/modules/workspace/workspace.types";
import { BoardModel } from "@/modules/board/board.model";
import { BoardVisibility } from "@/modules/board/board.types";
import { CanvasModel } from "@/modules/canvas/canvas.model";
import { ShapeModel } from "@/modules/shape/shape.model";
import { ShapeType } from "@/modules/shape/shape.types";
import { MutationRecordModel } from "@/modules/mutation/mutation.model";
import { shapeService } from "@/modules/shape/shape.service";
import { boardService } from "@/modules/board/board.service";
import { workspaceService } from "@/modules/workspace/workspace.service";

import {
  SocketAck,
  SocketEvents,
  SocketServer,
  ShapeResponseDto,
} from "../index";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`[Assertion Failed]: ${message}`);
  }
}

function getErrorCode(error: any): string | undefined {
  if (!error) return undefined;
  if (typeof error === "string") return error;
  return error.code;
}

async function runSocketRBACTests(): Promise<void> {
  console.log("================================================================================");
  console.log("Running Runtime RBAC & Viewer Read-Only Security Integration Tests");
  console.log("================================================================================\n");

  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log("Connected to MongoDB for RBAC integration tests.");
  } catch (err) {
    console.warn("MongoDB connection unavailable, skipping test:", err);
    return;
  }

  const httpServer = createServer();
  const socketServer = new SocketServer(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve());
  });

  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const serverUrl = `http://localhost:${port}`;

  // Test User Identifiers
  const ownerId = new Types.ObjectId();
  const adminId = new Types.ObjectId();
  const editorId = new Types.ObjectId();
  const viewerId = new Types.ObjectId();
  const outsiderId = new Types.ObjectId();

  const ownerToken = generateAccessToken({ userId: ownerId.toString(), role: UserRole.USER });
  const adminToken = generateAccessToken({ userId: adminId.toString(), role: UserRole.USER });
  const editorToken = generateAccessToken({ userId: editorId.toString(), role: UserRole.USER });
  const viewerToken = generateAccessToken({ userId: viewerId.toString(), role: UserRole.USER });
  const outsiderToken = generateAccessToken({ userId: outsiderId.toString(), role: UserRole.USER });

  // Test Fixtures
  let workspace: any;
  let board: any;
  let canvas: any;
  let initialShape: any;

  // Socket Connections
  let ownerSocket: ClientSocket | null = null;
  let editorSocket: ClientSocket | null = null;
  let editorSocketTab2: ClientSocket | null = null;
  let viewerSocket: ClientSocket | null = null;

  try {
    // 1. Provision Workspace, Members, Board, Canvas, and Base Shape
    workspace = await WorkspaceModel.create({
      name: "RBAC Security Test Workspace",
      ownerId,
      visibility: WorkspaceVisibility.PRIVATE,
    });

    await WorkspaceMemberModel.create([
      { workspaceId: workspace._id, userId: adminId, role: WorkspaceRole.ADMIN },
      { workspaceId: workspace._id, userId: editorId, role: WorkspaceRole.EDITOR },
      { workspaceId: workspace._id, userId: viewerId, role: WorkspaceRole.VIEWER },
    ]);

    board = await BoardModel.create({
      workspaceId: workspace._id,
      name: "RBAC Test Board",
      createdBy: ownerId,
      visibility: BoardVisibility.PRIVATE,
      collaborationRevision: 1,
    });

    canvas = await CanvasModel.create({
      boardId: board._id,
      name: "Page 1",
      backgroundColor: "#FFFFFF",
      order: 1,
    });

    initialShape = await ShapeModel.create({
      canvasId: canvas._id,
      type: ShapeType.RECTANGLE,
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      rotation: 0,
      zIndex: 1,
      version: 1,
      createdBy: ownerId,
    });

    // Helper to create connected sockets
    const createSocket = (token: string): Promise<ClientSocket> => {
      return new Promise((resolve, reject) => {
        const socket = clientIO(serverUrl, {
          transports: ["websocket"],
          auth: { token },
          reconnection: false,
        });
        socket.on("connect", () => resolve(socket));
        socket.on("connect_error", (err) => reject(err));
      });
    };

    ownerSocket = await createSocket(ownerToken);
    editorSocket = await createSocket(editorToken);
    editorSocketTab2 = await createSocket(editorToken); // Multi-tab
    viewerSocket = await createSocket(viewerToken);

    // Join board rooms
    await Promise.all([
      new Promise((resolve) => ownerSocket!.emit("board:join", { boardId: board._id.toString() }, resolve)),
      new Promise((resolve) => editorSocket!.emit("board:join", { boardId: board._id.toString() }, resolve)),
      new Promise((resolve) => editorSocketTab2!.emit("board:join", { boardId: board._id.toString() }, resolve)),
      new Promise((resolve) => viewerSocket!.emit("board:join", { boardId: board._id.toString() }, resolve)),
    ]);

    console.log("✓ Sockets connected and joined board room.");

    // -------------------------------------------------------------------------
    // Test Group 1: Basic RBAC via BoardService.authorizeCanvasMutation
    // -------------------------------------------------------------------------
    console.log("\n--- Test Group 1: Basic RBAC Matrix ---");

    const ownerAuth = await boardService.authorizeCanvasMutation(board._id, ownerId);
    assert(ownerAuth.role === WorkspaceRole.OWNER, "Owner must be authorized as OWNER");
    console.log("✓ 1. OWNER is authorized for canvas mutation.");

    const adminAuth = await boardService.authorizeCanvasMutation(board._id, adminId);
    assert(adminAuth.role === WorkspaceRole.ADMIN, "Admin must be authorized as ADMIN");
    console.log("✓ 2. ADMIN is authorized for canvas mutation.");

    const editorAuth = await boardService.authorizeCanvasMutation(board._id, editorId);
    assert(editorAuth.role === WorkspaceRole.EDITOR, "Editor must be authorized as EDITOR");
    console.log("✓ 3. EDITOR is authorized for canvas mutation.");

    let viewerFailed = false;
    try {
      await boardService.authorizeCanvasMutation(board._id, viewerId);
    } catch (err: any) {
      viewerFailed = true;
      assert(err.statusCode === 403, "Viewer mutation must throw 403 FORBIDDEN");
    }
    assert(viewerFailed, "Viewer must NOT be authorized for canvas mutation");
    console.log("✓ 4. VIEWER is rejected from canvas mutation with 403 FORBIDDEN.");

    // -------------------------------------------------------------------------
    // Test Group 2: REST Shape Mutations
    // -------------------------------------------------------------------------
    console.log("\n--- Test Group 2: REST Shape Mutation Protection ---");

    // 5. Viewer REST Create Shape
    let restCreateFailed = false;
    try {
      await shapeService.createShape(viewerId, {
        canvasId: canvas._id,
        type: ShapeType.RECTANGLE,
        x: 50,
        y: 50,
        width: 100,
        height: 100,
        rotation: 0,
      });
    } catch (err: any) {
      restCreateFailed = true;
      assert(err.statusCode === 403, "REST shape creation by viewer must fail with 403");
    }
    assert(restCreateFailed, "Viewer REST create shape must be rejected");
    console.log("✓ 5. VIEWER cannot create shape via REST service.");

    // 6. Viewer REST Update Shape
    let restUpdateFailed = false;
    try {
      await shapeService.updateShape(
        initialShape._id,
        { x: 300, y: 300 },
        undefined,
        undefined,
        viewerId
      );
    } catch (err: any) {
      restUpdateFailed = true;
      assert(err.statusCode === 403, "REST shape update by viewer must fail with 403");
    }
    assert(restUpdateFailed, "Viewer REST update shape must be rejected");
    console.log("✓ 6. VIEWER cannot update shape via REST service.");

    // 7. Viewer REST Delete Shape
    let restDeleteFailed = false;
    try {
      await shapeService.deleteShape(initialShape._id, undefined, undefined, viewerId);
    } catch (err: any) {
      restDeleteFailed = true;
      assert(err.statusCode === 403, "REST shape delete by viewer must fail with 403");
    }
    assert(restDeleteFailed, "Viewer REST delete shape must be rejected");
    console.log("✓ 7. VIEWER cannot delete shape via REST service.");

    // -------------------------------------------------------------------------
    // Test Group 3: Socket.IO Shape Mutations
    // -------------------------------------------------------------------------
    console.log("\n--- Test Group 3: Socket.IO Shape Mutation Protection ---");

    // 8. Viewer Socket.IO shape:create
    const viewerCreateAck: SocketAck<ShapeResponseDto> = await new Promise((resolve) => {
      viewerSocket!.emit(
        "shape:create",
        {
          canvasId: canvas._id.toString(),
          type: "rectangle",
          x: 10,
          y: 10,
          width: 50,
          height: 50,
        },
        resolve
      );
    });
    assert(viewerCreateAck.success === false, "Viewer shape:create ack must be false");
    assert(getErrorCode(viewerCreateAck.error) === "FORBIDDEN", "Viewer shape:create error code must be FORBIDDEN");
    console.log("✓ 8. VIEWER cannot create shape via Socket.IO (received FORBIDDEN).");

    // 9. Viewer Socket.IO shape:update
    const viewerUpdateAck: SocketAck<ShapeResponseDto> = await new Promise((resolve) => {
      viewerSocket!.emit(
        "shape:update",
        {
          shapeId: initialShape._id.toString(),
          expectedVersion: 1,
          data: { x: 500, y: 500 },
        },
        resolve
      );
    });
    assert(viewerUpdateAck.success === false, "Viewer shape:update ack must be false");
    assert(getErrorCode(viewerUpdateAck.error) === "FORBIDDEN", "Viewer shape:update error code must be FORBIDDEN");
    console.log("✓ 9. VIEWER cannot update shape via Socket.IO (received FORBIDDEN).");

    // 10. Viewer Socket.IO shape:delete
    const viewerDeleteAck: SocketAck = await new Promise((resolve) => {
      viewerSocket!.emit(
        "shape:delete",
        {
          shapeId: initialShape._id.toString(),
          expectedVersion: 1,
        },
        resolve
      );
    });
    assert(viewerDeleteAck.success === false, "Viewer shape:delete ack must be false");
    assert(getErrorCode(viewerDeleteAck.error) === "FORBIDDEN", "Viewer shape:delete error code must be FORBIDDEN");
    console.log("✓ 10. VIEWER cannot delete shape via Socket.IO (received FORBIDDEN).");

    // 11. Viewer Socket.IO shape:lock
    const viewerLockAck: SocketAck = await new Promise((resolve) => {
      viewerSocket!.emit(
        "shape:lock",
        {
          boardId: board._id.toString(),
          shapeId: initialShape._id.toString(),
        },
        resolve
      );
    });
    assert(viewerLockAck.success === false, "Viewer shape:lock ack must be false");
    assert(getErrorCode(viewerLockAck.error) === "FORBIDDEN", "Viewer shape:lock error code must be FORBIDDEN");
    console.log("✓ 11. VIEWER cannot acquire shape soft-lock (received FORBIDDEN).");

    // -------------------------------------------------------------------------
    // Test Group 4: Runtime Role Transition (EDITOR -> VIEWER on Active Socket)
    // -------------------------------------------------------------------------
    console.log("\n--- Test Group 4: Runtime Role Transition on Active Connected Sockets ---");

    // Step A: Editor performs a valid mutation before demotion
    const editorPreAck: SocketAck<ShapeResponseDto> = await new Promise((resolve) => {
      editorSocket!.emit(
        "shape:create",
        {
          canvasId: canvas._id.toString(),
          type: "rectangle",
          x: 200,
          y: 200,
          width: 80,
          height: 80,
        },
        resolve
      );
    });
    assert(editorPreAck.success === true, "Editor pre-demotion shape:create must succeed");
    const editorCreatedShapeId = editorPreAck.data!.id;
    console.log(`✓ 12. EDITOR successfully created shape (${editorCreatedShapeId}) prior to demotion.`);

    // Step B: OWNER demotes EDITOR -> VIEWER in Database
    await workspaceService.updateMemberRole(workspace._id, ownerId, editorId, {
      role: WorkspaceRole.VIEWER,
    });
    console.log("✓ 13. OWNER updated editor's role to VIEWER in MongoDB.");

    // Step C: Existing EDITOR socket (WITHOUT disconnecting or refreshing) attempts shape mutation
    const editorPostAck: SocketAck<ShapeResponseDto> = await new Promise((resolve) => {
      editorSocket!.emit(
        "shape:update",
        {
          shapeId: editorCreatedShapeId,
          expectedVersion: 1,
          data: { x: 777 },
        },
        resolve
      );
    });
    assert(editorPostAck.success === false, "Demoted editor mutation on existing socket must be rejected");
    assert(getErrorCode(editorPostAck.error) === "FORBIDDEN", "Demoted editor must receive FORBIDDEN");
    console.log("✓ 14. Existing connected socket is IMMEDIATELY blocked with FORBIDDEN (No reconnect required).");

    // Step D: Multi-tab check (Tab 2 socket also immediately blocked)
    const editorTab2Ack: SocketAck = await new Promise((resolve) => {
      editorSocketTab2!.emit(
        "shape:delete",
        {
          shapeId: editorCreatedShapeId,
          expectedVersion: 1,
        },
        resolve
      );
    });
    assert(editorTab2Ack.success === false, "Editor Tab 2 socket must also be blocked");
    assert(getErrorCode(editorTab2Ack.error) === "FORBIDDEN", "Editor Tab 2 must receive FORBIDDEN");
    console.log("✓ 15. Secondary browser tab socket (Tab 2) is also immediately blocked.");

    // Step E: Reverse Transition (VIEWER -> EDITOR)
    await workspaceService.updateMemberRole(workspace._id, ownerId, editorId, {
      role: WorkspaceRole.EDITOR,
    });
    console.log("✓ 16. OWNER promoted member back to EDITOR.");

    // Step F: Existing socket can mutate again without reconnecting
    const editorRestoredAck: SocketAck<ShapeResponseDto> = await new Promise((resolve) => {
      editorSocket!.emit(
        "shape:update",
        {
          shapeId: editorCreatedShapeId,
          expectedVersion: 1,
          data: { x: 333 },
        },
        resolve
      );
    });
    assert(editorRestoredAck.success === true, "Restored editor mutation must succeed");
    console.log("✓ 17. Existing socket immediately regains mutation permissions after promotion.");

    // -------------------------------------------------------------------------
    // Test Group 5: Security & Anti-Spoofing
    // -------------------------------------------------------------------------
    console.log("\n--- Test Group 5: Security & Anti-Spoofing Guarantees ---");

    // 18. Spoofed Role in Payload
    const spoofedAck: SocketAck = await new Promise((resolve) => {
      viewerSocket!.emit(
        "shape:create",
        {
          canvasId: canvas._id.toString(),
          type: "rectangle",
          role: "OWNER", // Malicious spoof attempt
          x: 1,
          y: 1,
          width: 10,
          height: 10,
        } as any,
        resolve
      );
    });
    assert(spoofedAck.success === false, "Role spoofing must be rejected");
    assert(getErrorCode(spoofedAck.error) === "FORBIDDEN", "Role spoofing must return FORBIDDEN");
    console.log("✓ 18. Client role spoofing in payload ignored; server rejected mutation.");

    // 19. Outsider / Foreign Board Access
    let outsiderFailed = false;
    try {
      await boardService.authorizeCanvasMutation(board._id, outsiderId);
    } catch (err: any) {
      outsiderFailed = true;
      assert(err.statusCode === 403, "Outsider must throw 403");
    }
    assert(outsiderFailed, "Outsider must not be authorized on private workspace board");
    console.log("✓ 19. Foreign workspace outsider rejected with 403 FORBIDDEN.");

    // 20. Removed Member
    await workspaceService.removeWorkspaceMember(workspace._id, ownerId, viewerId);
    let removedFailed = false;
    try {
      await boardService.authorizeCanvasMutation(board._id, viewerId);
    } catch (err: any) {
      removedFailed = true;
      assert(err.statusCode === 403, "Removed member must throw 403");
    }
    assert(removedFailed, "Removed member must be forbidden");
    console.log("✓ 20. Removed member mutation attempt rejected with 403 FORBIDDEN.");

    // -------------------------------------------------------------------------
    // Test Group 6: Ephemeral Purity Guarantees
    // -------------------------------------------------------------------------
    console.log("\n--- Test Group 6: Ephemeral Zero-Persistence Purity Verification ---");

    const boardDocBefore = await BoardModel.findById(board._id);
    const revBefore = boardDocBefore!.collaborationRevision;
    const shapeDocBefore = await ShapeModel.findById(initialShape._id);
    const shapeVersionBefore = shapeDocBefore!.version;
    const mutationCountBefore = await MutationRecordModel.countDocuments({ boardId: board._id });

    // Viewer attempts mutation
    await new Promise((resolve) => {
      viewerSocket!.emit(
        "shape:update",
        {
          shapeId: initialShape._id.toString(),
          expectedVersion: shapeVersionBefore,
          data: { x: 9999 },
        },
        resolve
      );
    });

    const boardDocAfter = await BoardModel.findById(board._id);
    const revAfter = boardDocAfter!.collaborationRevision;
    const shapeDocAfter = await ShapeModel.findById(initialShape._id);
    const shapeVersionAfter = shapeDocAfter!.version;
    const mutationCountAfter = await MutationRecordModel.countDocuments({ boardId: board._id });

    assert(revBefore === revAfter, "collaborationRevision must NOT increment on rejected mutation");
    assert(shapeVersionBefore === shapeVersionAfter, "Shape version must NOT increment on rejected mutation");
    assert(mutationCountBefore === mutationCountAfter, "MutationRecord count must NOT increase on rejected mutation");
    assert(shapeDocAfter!.x === shapeDocBefore!.x, "Shape x coordinate must remain unchanged in MongoDB");
    console.log("✓ 21. Ephemeral purity verified: ZERO MongoDB writes, ZERO revision bumps, ZERO MutationRecords.");

    // -------------------------------------------------------------------------
    // Test Group 7: Presence & Ephemeral Collaboration for VIEWER
    // -------------------------------------------------------------------------
    console.log("\n--- Test Group 7: Viewer Presence & Ephemeral Separation ---");

    // Re-add viewer as VIEWER
    await WorkspaceMemberModel.create({
      workspaceId: workspace._id,
      userId: viewerId,
      role: WorkspaceRole.VIEWER,
    });

    // 22. Viewer Cursor Streaming (Allowed)
    const cursorPromise = new Promise<any>((resolve) => {
      ownerSocket!.on("cursor:moved", resolve);
      ownerSocket!.on("cursor:move", resolve);
    });

    viewerSocket!.emit("cursor:move", {
      boardId: board._id.toString(),
      x: 350.0,
      y: 720.0,
    });

    const cursorPayload = await cursorPromise;
    assert(cursorPayload.x === 350.0 && cursorPayload.y === 720.0, "Owner must receive viewer's cursor stream");
    console.log("✓ 22. VIEWER cursor streaming functional (Presence separated from durable mutations).");

    // -------------------------------------------------------------------------
    // Test Group 8: FORBIDDEN vs INTERACTION_CONFLICT Distinction
    // -------------------------------------------------------------------------
    console.log("\n--- Test Group 8: FORBIDDEN vs INTERACTION_CONFLICT Distinction ---");

    // Owner acquires lock on initial shape
    const ownerLockAck: SocketAck = await new Promise((resolve) => {
      ownerSocket!.emit(
        "shape:lock",
        {
          boardId: board._id.toString(),
          shapeId: initialShape._id.toString(),
        },
        resolve
      );
    });
    assert(ownerLockAck.success === true, "Owner must acquire lock");

    // Editor (authorized role) attempts lock while owner holds it -> SHAPE_LOCKED (conflict)
    const editorConflictAck: SocketAck = await new Promise((resolve) => {
      editorSocket!.emit(
        "shape:lock",
        {
          boardId: board._id.toString(),
          shapeId: initialShape._id.toString(),
        },
        resolve
      );
    });
    assert(editorConflictAck.success === false, "Editor lock should fail due to conflict");
    assert(getErrorCode(editorConflictAck.error) === "SHAPE_LOCKED", "Editor error must be SHAPE_LOCKED (Interaction conflict)");

    // Viewer (unauthorized role) attempts lock -> FORBIDDEN (authorization failure)
    const viewerForbiddenAck: SocketAck = await new Promise((resolve) => {
      viewerSocket!.emit(
        "shape:lock",
        {
          boardId: board._id.toString(),
          shapeId: initialShape._id.toString(),
        },
        resolve
      );
    });
    assert(viewerForbiddenAck.success === false, "Viewer lock should fail due to authorization");
    assert(getErrorCode(viewerForbiddenAck.error) === "FORBIDDEN", "Viewer error must be FORBIDDEN (Authorization failure)");

    console.log("✓ 23. SHAPE_LOCKED (Interaction conflict) is strictly distinguished from FORBIDDEN (RBAC failure).");

  } finally {
    if (ownerSocket && ownerSocket.connected) ownerSocket.disconnect();
    if (editorSocket && editorSocket.connected) editorSocket.disconnect();
    if (editorSocketTab2 && editorSocketTab2.connected) editorSocketTab2.disconnect();
    if (viewerSocket && viewerSocket.connected) viewerSocket.disconnect();

    await socketServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));

    // Cleanup DB fixtures
    if (workspace?._id) {
      await WorkspaceMemberModel.deleteMany({ workspaceId: workspace._id });
      await WorkspaceModel.deleteMany({ _id: workspace._id });
    }
    if (board?._id) {
      await BoardModel.deleteMany({ _id: board._id });
      await CanvasModel.deleteMany({ boardId: board._id });
    }
    if (canvas?._id) {
      await ShapeModel.deleteMany({ canvasId: canvas._id });
    }

    await mongoose.disconnect();
  }

  console.log("\n================================================================================");
  console.log("ALL RUNTIME RBAC & VIEWER READ-ONLY TESTS PASSED SUCCESSFULLY (100%)!");
  console.log("================================================================================\n");
}

runSocketRBACTests().catch((err) => {
  console.error("Runtime RBAC test failed:", err);
  process.exit(1);
});
