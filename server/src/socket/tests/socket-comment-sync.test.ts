import { createServer } from "http";
import mongoose, { Types } from "mongoose";
import { io as clientIO, Socket as ClientSocket } from "socket.io-client";

import env from "@/config/env";
import { generateAccessToken } from "@/modules/auth/auth.tokens";
import { UserRole } from "@/modules/user/user.types";
import { UserModel } from "@/modules/user/user.model";
import { WorkspaceModel } from "@/modules/workspace/workspace.model";
import { WorkspaceMemberModel } from "@/modules/workspace/workspaceMember.model";
import { WorkspaceRole, WorkspaceVisibility } from "@/modules/workspace/workspace.types";
import { BoardModel } from "@/modules/board/board.model";
import { BoardVisibility } from "@/modules/board/board.types";
import { CanvasModel } from "@/modules/canvas/canvas.model";
import { ShapeModel } from "@/modules/shape/shape.model";
import { ShapeType } from "@/modules/shape/shape.types";
import { shapeService } from "@/modules/shape/shape.service";
import { CommentModel } from "@/modules/comment/comment.model";
import { commentRepository } from "@/modules/comment/comment.repository";
import { commentService } from "@/modules/comment/comment.service";

import {
  CommentResponseDto,
  CreateCommentPayload,
  DeleteCommentPayload,
  ResolveCommentPayload,
  SocketAck,
  SocketEvents,
  SocketServer,
  UpdateCommentPayload,
} from "../index";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runSocketCommentSyncTests(): Promise<void> {
  console.log("Starting Real-Time Comment & Collaborative Annotation Integration Tests (Slice 9)...\n");

  try {
    await mongoose.connect(env.MONGODB_URI);
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
  const port = typeof address === "object" && address ? address.port : 0;
  const serverUrl = `http://localhost:${port}`;

  // Test User Identifiers
  const ownerUserId = new Types.ObjectId();
  const memberUserId = new Types.ObjectId();
  const outsiderUserId = new Types.ObjectId();

  // Create mock users in DB for populate
  await UserModel.create([
    {
      _id: ownerUserId,
      fullName: "Owner User",
      email: `owner_${Date.now()}@example.com`,
      password: "hashedpassword123",
      role: UserRole.USER,
    },
    {
      _id: memberUserId,
      fullName: "Member User",
      email: `member_${Date.now()}@example.com`,
      password: "hashedpassword123",
      role: UserRole.USER,
    },
    {
      _id: outsiderUserId,
      fullName: "Outsider User",
      email: `outsider_${Date.now()}@example.com`,
      password: "hashedpassword123",
      role: UserRole.USER,
    },
  ]);

  const ownerToken = generateAccessToken({
    userId: ownerUserId.toString(),
    role: UserRole.USER,
  });

  const memberToken = generateAccessToken({
    userId: memberUserId.toString(),
    role: UserRole.USER,
  });

  const outsiderToken = generateAccessToken({
    userId: outsiderUserId.toString(),
    role: UserRole.USER,
  });

  // DB entities
  let workspace1Id: Types.ObjectId | null = null;
  let workspace2Id: Types.ObjectId | null = null;
  let board1Id: Types.ObjectId | null = null;
  let board2Id: Types.ObjectId | null = null;
  let canvas1Id: Types.ObjectId | null = null;
  let canvas2Id: Types.ObjectId | null = null;
  let shape1Id: Types.ObjectId | null = null;
  let shape2Id: Types.ObjectId | null = null;

  try {
    // 1. Seed Workspace 1 (Shared with Member)
    const ws1 = await WorkspaceModel.create({
      name: "Comment Test Workspace 1",
      ownerId: ownerUserId,
      visibility: WorkspaceVisibility.PRIVATE,
    });
    workspace1Id = ws1._id as Types.ObjectId;

    await WorkspaceMemberModel.create({
      workspaceId: workspace1Id,
      userId: memberUserId,
      role: WorkspaceRole.EDITOR,
    });

    const b1 = await BoardModel.create({
      workspaceId: workspace1Id,
      name: "Comment Test Board 1",
      createdBy: ownerUserId,
      visibility: BoardVisibility.PRIVATE,
    });
    board1Id = b1._id as Types.ObjectId;

    const c1 = await CanvasModel.create({
      boardId: board1Id,
      name: "Page 1",
      order: 1,
      backgroundColor: "#ffffff",
    });
    canvas1Id = c1._id as Types.ObjectId;

    // Seed a shape on Board 1
    const s1 = await ShapeModel.create({
      canvasId: canvas1Id,
      type: ShapeType.RECTANGLE,
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      rotation: 0,
      zIndex: 1,
      style: { fill: "#ffffff", stroke: "#000000", strokeWidth: 2, opacity: 1 },
      createdBy: ownerUserId,
    });
    shape1Id = s1._id as Types.ObjectId;

    // 2. Seed Workspace 2 / Board 2 (Isolated for Outsider & Cross-Board tests)
    const ws2 = await WorkspaceModel.create({
      name: "Comment Test Workspace 2",
      ownerId: outsiderUserId,
      visibility: WorkspaceVisibility.PRIVATE,
    });
    workspace2Id = ws2._id as Types.ObjectId;

    const b2 = await BoardModel.create({
      workspaceId: workspace2Id,
      name: "Comment Test Board 2",
      createdBy: outsiderUserId,
      visibility: BoardVisibility.PRIVATE,
    });
    board2Id = b2._id as Types.ObjectId;

    const c2 = await CanvasModel.create({
      boardId: board2Id,
      name: "Page 1",
      order: 1,
      backgroundColor: "#ffffff",
    });
    canvas2Id = c2._id as Types.ObjectId;

    const s2 = await ShapeModel.create({
      canvasId: canvas2Id,
      type: ShapeType.RECTANGLE,
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      rotation: 0,
      zIndex: 1,
      style: { fill: "#f0f0f0", stroke: "#000000", strokeWidth: 1, opacity: 1 },
      createdBy: outsiderUserId,
    });
    shape2Id = s2._id as Types.ObjectId;

    // Connect Clients
    const ownerClient: ClientSocket = clientIO(serverUrl, {
      auth: { token: `Bearer ${ownerToken}` },
      transports: ["websocket"],
      reconnection: false,
    });

    const memberClient: ClientSocket = clientIO(serverUrl, {
      auth: { token: `Bearer ${memberToken}` },
      transports: ["websocket"],
      reconnection: false,
    });

    const outsiderClient: ClientSocket = clientIO(serverUrl, {
      auth: { token: `Bearer ${outsiderToken}` },
      transports: ["websocket"],
      reconnection: false,
    });

    await Promise.all([
      new Promise<void>((res) => ownerClient.on("connect", () => res())),
      new Promise<void>((res) => memberClient.on("connect", () => res())),
      new Promise<void>((res) => outsiderClient.on("connect", () => res())),
    ]);

    // Join Board 1 for Owner and Member
    await Promise.all([
      new Promise<void>((res) => {
        ownerClient.emit(
          SocketEvents.BOARD_JOIN,
          { boardId: board1Id!.toString() },
          () => res()
        );
      }),
      new Promise<void>((res) => {
        memberClient.emit(
          SocketEvents.BOARD_JOIN,
          { boardId: board1Id!.toString() },
          () => res()
        );
      }),
    ]);

    // Join Board 2 for Outsider
    await new Promise<void>((res) => {
      outsiderClient.emit(
        SocketEvents.BOARD_JOIN,
        { boardId: board2Id!.toString() },
        () => res()
      );
    });

    console.log("✓ Sockets initialized and joined to board rooms.\n");

    // -------------------------------------------------------------
    // Scenario 1-6: Comment Creation, Persistence & Broadcast
    // -------------------------------------------------------------
    console.log("Scenario 1-6: Canvas-Level & Shape-Level Comment Creation & Real-Time Sync...");

    let capturedCreatedOnMember: CommentResponseDto | null = null;
    let ownerReceivedBroadcast = false;
    let outsiderReceivedBroadcast = false;

    memberClient.on(SocketEvents.COMMENT_CREATED, (dto: CommentResponseDto) => {
      capturedCreatedOnMember = dto;
    });

    ownerClient.on(SocketEvents.COMMENT_CREATED, () => {
      ownerReceivedBroadcast = true;
    });

    outsiderClient.on(SocketEvents.COMMENT_CREATED, () => {
      outsiderReceivedBroadcast = true;
    });

    // 1. Create canvas-level comment
    const createPayload: CreateCommentPayload = {
      boardId: board1Id!.toString(),
      content: "Please check this canvas section.",
    };

    const createAck = await new Promise<SocketAck<CommentResponseDto>>((res) => {
      ownerClient.emit(
        SocketEvents.COMMENT_CREATE,
        createPayload,
        (response: SocketAck<CommentResponseDto>) => res(response)
      );
    });

    assert(createAck.success === true, "Comment creation must succeed");
    assert(createAck.data !== undefined, "Comment creation ack must return data");
    assert(createAck.data?.content === "Please check this canvas section.", "Content should match");
    assert(createAck.data?.shapeId === null, "Canvas-level comment shapeId must be null");
    assert(createAck.data?.parentCommentId === null, "Top-level comment parentId must be null");
    assert(createAck.data?.isResolved === false, "New comment isResolved must be false");
    assert(createAck.data?.isEdited === false, "New comment isEdited must be false");
    assert(createAck.data?.isDeleted === false, "New comment isDeleted must be false");
    assert(createAck.data?.author?.fullName === "Owner User", "Author details populated");

    // Wait a brief moment for socket broadcasts
    await new Promise((res) => setTimeout(res, 50));

    // 3. Persistence verification
    const persisted = await CommentModel.findById(createAck.data!.id);
    assert(persisted !== null, "Comment must be persisted to MongoDB");
    assert(persisted?.content === "Please check this canvas section.", "Persisted content matches");

    // 4, 5, 6. Broadcast checks
    assert(capturedCreatedOnMember !== null, "Peers in board room must receive comment:created");
    assert(
      (capturedCreatedOnMember as CommentResponseDto | null)?.id === createAck.data!.id,
      "Peer received correct comment DTO"
    );
    assert(!ownerReceivedBroadcast, "Sender must be excluded from broadcast");
    assert(!outsiderReceivedBroadcast, "Other board rooms must not receive broadcast (room isolation)");

    const canvasCommentId = createAck.data!.id;
    console.log("✓ Canvas comment creation, ack, peer broadcast, persistence & sender exclusion verified.");

    // 2. Create shape-level comment
    const shapeCommentPayload: CreateCommentPayload = {
      boardId: board1Id!.toString(),
      shapeId: shape1Id!.toString(),
      content: "Change background color of this rectangle.",
    };

    const shapeCommentAck = await new Promise<SocketAck<CommentResponseDto>>((res) => {
      ownerClient.emit(
        SocketEvents.COMMENT_CREATE,
        shapeCommentPayload,
        (response: SocketAck<CommentResponseDto>) => res(response)
      );
    });

    assert(shapeCommentAck.success === true, "Shape comment creation must succeed");
    assert(
      shapeCommentAck.data?.shapeId === shape1Id!.toString(),
      "Shape comment must have matching shapeId"
    );

    const shapeCommentId = shapeCommentAck.data!.id;
    console.log("✓ Shape-level comment creation verified.");

    // -------------------------------------------------------------
    // Scenario 7-10: Threading & 1-Level Reply Validation
    // -------------------------------------------------------------
    console.log("\nScenario 7-10: Threading, Reply Hierarchy & Rejections...");

    // 7. Valid reply to top-level comment
    const replyPayload: CreateCommentPayload = {
      boardId: board1Id!.toString(),
      parentCommentId: canvasCommentId,
      content: "I agree, let's update it.",
    };

    const replyAck = await new Promise<SocketAck<CommentResponseDto>>((res) => {
      memberClient.emit(
        SocketEvents.COMMENT_CREATE,
        replyPayload,
        (response: SocketAck<CommentResponseDto>) => res(response)
      );
    });

    assert(replyAck.success === true, "Reply creation must succeed");
    assert(
      replyAck.data?.parentCommentId === canvasCommentId,
      "Reply must reference parentCommentId"
    );

    const replyCommentId = replyAck.data!.id;
    console.log("✓ Valid reply to top-level comment created.");

    // 8. Reject reply to a reply (Enforces 1-level limit)
    const nestedReplyPayload: CreateCommentPayload = {
      boardId: board1Id!.toString(),
      parentCommentId: replyCommentId,
      content: "Nested reply attempting 2 levels deep.",
    };

    const nestedReplyAck = await new Promise<SocketAck<CommentResponseDto>>((res) => {
      memberClient.emit(
        SocketEvents.COMMENT_CREATE,
        nestedReplyPayload,
        (response: SocketAck<CommentResponseDto>) => res(response)
      );
    });

    assert(nestedReplyAck.success === false, "Nested reply must be rejected");
    assert(
      typeof nestedReplyAck.error === "object" &&
        nestedReplyAck.error?.code === "BAD_REQUEST",
      "Nested reply rejection code should be BAD_REQUEST"
    );
    console.log("✓ Reply-to-reply correctly rejected (1-level thread hierarchy enforced).");

    // 9. Reject parent comment from another board (cross-board parent injection)
    const crossBoardParentPayload: CreateCommentPayload = {
      boardId: board2Id!.toString(),
      parentCommentId: canvasCommentId, // Belongs to Board 1!
      content: "Cross board parent attack.",
    };

    const crossBoardParentAck = await new Promise<SocketAck<CommentResponseDto>>((res) => {
      outsiderClient.emit(
        SocketEvents.COMMENT_CREATE,
        crossBoardParentPayload,
        (response: SocketAck<CommentResponseDto>) => res(response)
      );
    });

    assert(crossBoardParentAck.success === false, "Cross-board parent must be rejected");
    console.log("✓ Cross-board parent injection correctly rejected.");

    // -------------------------------------------------------------
    // Scenario 11-14: Authorization & Comment Editing
    // -------------------------------------------------------------
    console.log("\nScenario 11-14: Editing, Permissions & Authorization...");

    let capturedUpdatedOnMember: CommentResponseDto | null = null;
    memberClient.on(SocketEvents.COMMENT_UPDATED, (dto: CommentResponseDto) => {
      capturedUpdatedOnMember = dto;
    });

    // 11. Author can edit own comment
    const editPayload: UpdateCommentPayload = {
      boardId: board1Id!.toString(),
      commentId: canvasCommentId,
      content: "Please check this canvas section (Updated heading).",
    };

    const editAck = await new Promise<SocketAck<CommentResponseDto>>((res) => {
      ownerClient.emit(
        SocketEvents.COMMENT_UPDATE,
        editPayload,
        (response: SocketAck<CommentResponseDto>) => res(response)
      );
    });

    assert(editAck.success === true, "Author must be allowed to edit own comment");
    assert(
      editAck.data?.content === "Please check this canvas section (Updated heading).",
      "Updated content returned"
    );
    assert(editAck.data?.isEdited === true, "isEdited flag must be true");

    await new Promise((res) => setTimeout(res, 50));
    assert(capturedUpdatedOnMember !== null, "Peers must receive comment:updated");
    assert(
      (capturedUpdatedOnMember as CommentResponseDto | null)?.isEdited === true,
      "Peer sees isEdited: true"
    );
    console.log("✓ Author editing and comment:updated broadcast verified.");

    // 12. Non-author cannot edit someone else's comment
    const unauthorizedEditPayload: UpdateCommentPayload = {
      boardId: board1Id!.toString(),
      commentId: canvasCommentId, // Created by Owner!
      content: "Malicious edit by member.",
    };

    const unauthorizedEditAck = await new Promise<SocketAck<CommentResponseDto>>((res) => {
      memberClient.emit(
        SocketEvents.COMMENT_UPDATE,
        unauthorizedEditPayload,
        (response: SocketAck<CommentResponseDto>) => res(response)
      );
    });

    assert(unauthorizedEditAck.success === false, "Non-author edit must be rejected");
    assert(
      typeof unauthorizedEditAck.error === "object" &&
        unauthorizedEditAck.error?.code === "FORBIDDEN",
      "Unauthorized edit should return FORBIDDEN"
    );
    console.log("✓ Non-author edit attempt cleanly rejected with FORBIDDEN.");

    // -------------------------------------------------------------
    // Scenario 15, 21-23: Resolving / Unresolving Threads
    // -------------------------------------------------------------
    console.log("\nScenario 15, 21-23: Resolving and Unresolving Comment Threads...");

    let capturedResolvedOnMember: CommentResponseDto | null = null;
    memberClient.on(SocketEvents.COMMENT_RESOLVED, (dto: CommentResponseDto) => {
      capturedResolvedOnMember = dto;
    });

    // 21. Resolve comment
    const resolvePayload: ResolveCommentPayload = {
      boardId: board1Id!.toString(),
      commentId: canvasCommentId,
      isResolved: true,
    };

    const resolveAck = await new Promise<SocketAck<CommentResponseDto>>((res) => {
      ownerClient.emit(
        SocketEvents.COMMENT_RESOLVE,
        resolvePayload,
        (response: SocketAck<CommentResponseDto>) => res(response)
      );
    });

    assert(resolveAck.success === true, "Resolving comment must succeed");
    assert(resolveAck.data?.isResolved === true, "isResolved must be true");

    await new Promise((res) => setTimeout(res, 50));
    assert(capturedResolvedOnMember !== null, "Peers must receive comment:resolved");
    assert(
      (capturedResolvedOnMember as CommentResponseDto | null)?.isResolved === true,
      "Peer sees isResolved: true"
    );
    console.log("✓ Comment resolution and broadcast verified.");

    // 22. Unresolve comment
    const unresolvePayload: ResolveCommentPayload = {
      boardId: board1Id!.toString(),
      commentId: canvasCommentId,
      isResolved: false,
    };

    const unresolveAck = await new Promise<SocketAck<CommentResponseDto>>((res) => {
      ownerClient.emit(
        SocketEvents.COMMENT_RESOLVE,
        unresolvePayload,
        (response: SocketAck<CommentResponseDto>) => res(response)
      );
    });

    assert(unresolveAck.success === true, "Unresolving comment must succeed");
    assert(unresolveAck.data?.isResolved === false, "isResolved must be false");
    console.log("✓ Comment unresolving verified.");

    // -------------------------------------------------------------
    // Scenario 13, 14, 16-20: Soft Deletion & Reply Preservation
    // -------------------------------------------------------------
    console.log("\nScenario 13, 14, 16-20: Soft Deletion & Thread Preservation...");

    // 14. Non-authorized delete rejected
    const unauthorizedDeletePayload: DeleteCommentPayload = {
      boardId: board1Id!.toString(),
      commentId: canvasCommentId, // Owner's comment
    };

    const unauthorizedDeleteAck = await new Promise<SocketAck<CommentResponseDto>>((res) => {
      outsiderClient.emit(
        SocketEvents.COMMENT_DELETE,
        unauthorizedDeletePayload,
        (response: SocketAck<CommentResponseDto>) => res(response)
      );
    });

    assert(unauthorizedDeleteAck.success === false, "Outsider delete must be rejected");

    // 13. Author deletes top-level comment
    let capturedDeletedOnMember = false;
    memberClient.on(SocketEvents.COMMENT_DELETED, () => {
      capturedDeletedOnMember = true;
    });

    const deleteAck = await new Promise<SocketAck<CommentResponseDto>>((res) => {
      ownerClient.emit(
        SocketEvents.COMMENT_DELETE,
        {
          boardId: board1Id!.toString(),
          commentId: canvasCommentId,
        },
        (response: SocketAck<CommentResponseDto>) => res(response)
      );
    });

    assert(
      deleteAck.success === true,
      `Author deletion must succeed: ${JSON.stringify(deleteAck.error)}`
    );
    assert(deleteAck.data?.isDeleted === true, "isDeleted must be true");
    assert(deleteAck.data?.content === "", "Soft deleted content must be masked to empty string");

    // Check DB persistence
    const softDeletedDoc = await CommentModel.findById(canvasCommentId);
    assert(softDeletedDoc !== null, "Soft-deleted document remains in MongoDB");
    assert(softDeletedDoc?.deletedAt !== null, "deletedAt timestamp must be set");
    assert(softDeletedDoc?.content === "", "DB content cleared on delete");

    // 18. Reply remains preserved in DB
    const preservedReply = await CommentModel.findById(replyCommentId);
    assert(preservedReply !== null, "Reply must remain intact in MongoDB after parent deletion");
    assert(
      preservedReply?.content === "I agree, let's update it.",
      "Reply content preserved"
    );

    // 19. Deleted comment cannot be edited
    const editDeletedAck = await new Promise<SocketAck<CommentResponseDto>>((res) => {
      ownerClient.emit(
        SocketEvents.COMMENT_UPDATE,
        {
          boardId: board1Id!.toString(),
          commentId: canvasCommentId,
          content: "Trying to edit deleted comment.",
        },
        (response: SocketAck<CommentResponseDto>) => res(response)
      );
    });
    assert(editDeletedAck.success === false, "Deleted comment cannot be edited");

    // 20. Deleted comment cannot receive replies (Scenario 10)
    const replyToDeletedAck = await new Promise<SocketAck<CommentResponseDto>>((res) => {
      memberClient.emit(
        SocketEvents.COMMENT_CREATE,
        {
          boardId: board1Id!.toString(),
          parentCommentId: canvasCommentId,
          content: "Trying to reply to deleted parent.",
        },
        (response: SocketAck<CommentResponseDto>) => res(response)
      );
    });
    assert(replyToDeletedAck.success === false, "Cannot reply to a deleted comment");

    console.log("✓ Soft deletion, content masking, reply preservation, and edit/reply lockouts verified.");

    // -------------------------------------------------------------
    // Scenario 24-28: Security & Validation Rejections
    // -------------------------------------------------------------
    console.log("\nScenario 24-28: Security, Malformed Inputs & Validation Boundaries...");

    // 24. Cross-board mutation: Outsider trying to comment on Board 1
    const crossBoardAck = await new Promise<SocketAck<CommentResponseDto>>((res) => {
      outsiderClient.emit(
        SocketEvents.COMMENT_CREATE,
        {
          boardId: board1Id!.toString(),
          content: "Outsider intruder comment.",
        },
        (response: SocketAck<CommentResponseDto>) => res(response)
      );
    });
    assert(crossBoardAck.success === false, "Outsider cannot comment on private board");

    // 25. Shape from another board rejection
    const crossShapeAck = await new Promise<SocketAck<CommentResponseDto>>((res) => {
      ownerClient.emit(
        SocketEvents.COMMENT_CREATE,
        {
          boardId: board1Id!.toString(),
          shapeId: shape2Id!.toString(), // Shape from Board 2!
          content: "Attaching shape from Board 2.",
        },
        (response: SocketAck<CommentResponseDto>) => res(response)
      );
    });
    assert(crossShapeAck.success === false, "Shape from different board must be rejected");

    // 26. Empty content rejected
    const emptyContentAck = await new Promise<SocketAck<CommentResponseDto>>((res) => {
      ownerClient.emit(
        SocketEvents.COMMENT_CREATE,
        {
          boardId: board1Id!.toString(),
          content: "   ",
        },
        (response: SocketAck<CommentResponseDto>) => res(response)
      );
    });
    assert(emptyContentAck.success === false, "Whitespace-only comment must be rejected");

    // 27. Oversized content rejected (> 2000 chars)
    const oversizedContentAck = await new Promise<SocketAck<CommentResponseDto>>((res) => {
      ownerClient.emit(
        SocketEvents.COMMENT_CREATE,
        {
          boardId: board1Id!.toString(),
          content: "A".repeat(2001),
        },
        (response: SocketAck<CommentResponseDto>) => res(response)
      );
    });
    assert(oversizedContentAck.success === false, "Content > 2000 chars must be rejected");

    // 28. Malformed ObjectId rejected
    const malformedIdAck = await new Promise<SocketAck<CommentResponseDto>>((res) => {
      ownerClient.emit(
        SocketEvents.COMMENT_CREATE,
        {
          boardId: "invalid-id-format",
          content: "Valid content.",
        },
        (response: SocketAck<CommentResponseDto>) => res(response)
      );
    });
    assert(malformedIdAck.success === false, "Malformed boardId must be rejected");

    console.log("✓ Security and validation rejections verified.");

    // -------------------------------------------------------------
    // Scenario 29-31: Shape Deletion Decoupling & Comment Preservation
    // -------------------------------------------------------------
    console.log("\nScenario 29-31: Shape Deletion Decoupling & Lifecycle...");

    // Verify shapeComment has shapeId before deletion
    const commentBeforeShapeDelete = await CommentModel.findById(shapeCommentId);
    assert(
      commentBeforeShapeDelete?.shapeId?.toString() === shape1Id!.toString(),
      "Comment has shapeId before shape deletion"
    );

    // Delete Shape 1 via shapeService.deleteShape
    await shapeService.deleteShape(shape1Id!);

    // Comment should now have shapeId = null
    const commentAfterShapeDelete = await CommentModel.findById(shapeCommentId);
    assert(commentAfterShapeDelete !== null, "Comment survives shape deletion");
    assert(
      commentAfterShapeDelete?.shapeId === null,
      "Comment shapeId becomes null (converted to canvas-level comment)"
    );
    assert(
      commentAfterShapeDelete?.content === "Change background color of this rectangle.",
      "Comment content remains completely intact"
    );

    console.log("✓ Shape deletion decoupling and comment preservation verified.");

    // -------------------------------------------------------------
    // Cleanup sockets & server
    // -------------------------------------------------------------
    ownerClient.disconnect();
    memberClient.disconnect();
    outsiderClient.disconnect();
  } finally {
    // Clean up DB entities
    if (workspace1Id) {
      await WorkspaceMemberModel.deleteMany({ workspaceId: workspace1Id });
      await BoardModel.deleteMany({ workspaceId: workspace1Id });
      await WorkspaceModel.findByIdAndDelete(workspace1Id);
    }
    if (workspace2Id) {
      await WorkspaceMemberModel.deleteMany({ workspaceId: workspace2Id });
      await BoardModel.deleteMany({ workspaceId: workspace2Id });
      await WorkspaceModel.findByIdAndDelete(workspace2Id);
    }
    if (canvas1Id) await CanvasModel.findByIdAndDelete(canvas1Id);
    if (canvas2Id) await CanvasModel.findByIdAndDelete(canvas2Id);
    if (shape1Id) await ShapeModel.findByIdAndDelete(shape1Id);
    if (shape2Id) await ShapeModel.findByIdAndDelete(shape2Id);
    await CommentModel.deleteMany({
      boardId: { $in: [board1Id, board2Id].filter(Boolean) },
    });
    await UserModel.deleteMany({
      _id: { $in: [ownerUserId, memberUserId, outsiderUserId] },
    });

    await socketServer.close();
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  }

  console.log("\nAll 30+ Real-Time Comment Synchronization Scenarios Passed Successfully!\n");
}

runSocketCommentSyncTests().catch((error) => {
  console.error("Test failed:", error);
  process.exit(1);
});
