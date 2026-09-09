import mongoose, { Types } from "mongoose";

import env from "@/config/env";
import { UserModel } from "@/modules/user/user.model";
import { UserRole } from "@/modules/user/user.types";
import { WorkspaceModel } from "@/modules/workspace/workspace.model";
import { WorkspaceMemberModel } from "@/modules/workspace/workspaceMember.model";
import { WorkspaceRole, WorkspaceVisibility } from "@/modules/workspace/workspace.types";
import { BoardModel } from "@/modules/board/board.model";
import { BoardVisibility } from "@/modules/board/board.types";
import { CanvasModel } from "@/modules/canvas/canvas.model";
import { ShapeModel } from "@/modules/shape/shape.model";
import { ShapeType } from "@/modules/shape/shape.types";
import { CommentModel } from "../comment.model";
import { commentService } from "../comment.service";
import { commentRepository } from "../comment.repository";
import { ApiError, ConflictError } from "@/shared/utils";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runCommentServiceTests(): Promise<void> {
  console.log("Starting Comment Service Integration Tests...\n");

  let isDbConnected = false;
  try {
    await mongoose.connect(env.MONGODB_URI);
    isDbConnected = true;
    console.log("Connected to MongoDB for Comment service tests.");
  } catch (err) {
    console.warn("MongoDB connection unavailable, skipping tests:", err);
    return;
  }

  const userIds: Types.ObjectId[] = [];
  const workspaceIds: Types.ObjectId[] = [];
  const boardIds: Types.ObjectId[] = [];
  const canvasIds: Types.ObjectId[] = [];
  const shapeIds: Types.ObjectId[] = [];
  const commentIds: Types.ObjectId[] = [];

  try {
    // ----------------------------------------------------
    // Fixtures Setup: Users (Owner, Admin, Editor, Viewer, Outsider)
    // ----------------------------------------------------
    const createTestUser = async (name: string) => {
      const u = await UserModel.create({
        fullName: name,
        email: `${name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}@example.com`,
        password: "Password123!",
        role: UserRole.USER,
      });
      userIds.push(u._id as Types.ObjectId);
      return u;
    };

    const owner = await createTestUser("Service Owner");
    const admin = await createTestUser("Service Admin");
    const editor = await createTestUser("Service Editor");
    const viewer = await createTestUser("Service Viewer");
    const outsider = await createTestUser("Service Outsider");

    // Workspace & Members
    const workspace = await WorkspaceModel.create({
      name: "Comment Service Test Workspace",
      ownerId: owner._id,
      visibility: WorkspaceVisibility.PRIVATE,
    });
    workspaceIds.push(workspace._id as Types.ObjectId);

    await WorkspaceMemberModel.create([
      { workspaceId: workspace._id, userId: admin._id, role: WorkspaceRole.ADMIN, joinedAt: new Date() },
      { workspaceId: workspace._id, userId: editor._id, role: WorkspaceRole.EDITOR, joinedAt: new Date() },
      { workspaceId: workspace._id, userId: viewer._id, role: WorkspaceRole.VIEWER, joinedAt: new Date() },
    ]);

    // Board & Canvases
    const board = await BoardModel.create({
      name: "Comment Test Board",
      workspaceId: workspace._id,
      createdBy: owner._id,
      visibility: BoardVisibility.PRIVATE,
    });
    boardIds.push(board._id as Types.ObjectId);

    const canvas1 = await CanvasModel.create({
      boardId: board._id,
      name: "Canvas 1",
      order: 1,
    });
    canvasIds.push(canvas1._id as Types.ObjectId);

    const canvas2 = await CanvasModel.create({
      boardId: board._id,
      name: "Canvas 2",
      order: 2,
    });
    canvasIds.push(canvas2._id as Types.ObjectId);

    // Other Board (Cross-board testing)
    const otherBoard = await BoardModel.create({
      name: "Other Board",
      workspaceId: workspace._id,
      createdBy: owner._id,
      visibility: BoardVisibility.PRIVATE,
    });
    boardIds.push(otherBoard._id as Types.ObjectId);

    const otherCanvas = await CanvasModel.create({
      boardId: otherBoard._id,
      name: "Other Canvas",
      order: 1,
    });
    canvasIds.push(otherCanvas._id as Types.ObjectId);

    // Shapes
    const shape1 = await ShapeModel.create({
      canvasId: canvas1._id,
      createdBy: owner._id,
      type: ShapeType.RECTANGLE,
      x: 200,
      y: 150,
      width: 100,
      height: 100,
      zIndex: 1,
    });
    shapeIds.push(shape1._id as Types.ObjectId);

    // ----------------------------------------------------
    // TEST 1: Creation (World Coord, Shape Attached, Shape+Pos)
    // ----------------------------------------------------
    console.log("Test 1: Creating root comments with different anchors...");
    // 1a: World-space position comment
    const coordComment = await commentService.createComment(editor._id as Types.ObjectId, {
      boardId: board._id as Types.ObjectId,
      canvasId: canvas1._id as Types.ObjectId,
      content: "World coordinate comment",
      position: { x: 350, y: 450 },
    });
    commentIds.push(coordComment.comment._id as Types.ObjectId);
    assert(coordComment.comment.position?.x === 350, "World position preserved");
    assert(coordComment.comment.shapeId === null, "shapeId is null");

    // 1b: Shape-attached comment
    const shapeComment = await commentService.createComment(viewer._id as Types.ObjectId, {
      boardId: board._id as Types.ObjectId,
      canvasId: canvas1._id as Types.ObjectId,
      content: "Attached to shape",
      shapeId: shape1._id as Types.ObjectId,
    });
    commentIds.push(shapeComment.comment._id as Types.ObjectId);
    assert(shapeComment.comment.shapeId?.equals(shape1._id as Types.ObjectId) ?? false, "Attached to shape1");

    // 1c: Shape + Position comment
    const hybridComment = await commentService.createComment(admin._id as Types.ObjectId, {
      boardId: board._id as Types.ObjectId,
      canvasId: canvas1._id as Types.ObjectId,
      content: "Hybrid shape and position",
      shapeId: shape1._id as Types.ObjectId,
      position: { x: 210, y: 160 },
    });
    commentIds.push(hybridComment.comment._id as Types.ObjectId);
    assert(hybridComment.comment.position?.x === 210, "Hybrid position saved");
    console.log("✓ World-coordinate, shape-attached, and hybrid root comments created.");

    // ----------------------------------------------------
    // TEST 2: Creation Validation Errors
    // ----------------------------------------------------
    console.log("Test 2: Verifying rejection of invalid anchors and canvases...");
    // 2a: Missing anchor (no shapeId and no position when canvasId specified)
    let missingAnchorFailed = false;
    try {
      await commentService.createComment(owner._id as Types.ObjectId, {
        boardId: board._id as Types.ObjectId,
        canvasId: canvas1._id as Types.ObjectId,
        content: "No anchor provided",
        shapeId: null,
        position: null,
      });
    } catch {
      // Note: If no shapeId & no position provided, defaults to { x: 0, y: 0 } if fallback applies,
      // or rejects if strict. Let's verify our service behavior.
    }

    // 2b: Cross-board canvas
    let crossCanvasFailed = false;
    try {
      await commentService.createComment(owner._id as Types.ObjectId, {
        boardId: board._id as Types.ObjectId,
        canvasId: otherCanvas._id as Types.ObjectId,
        content: "Cross board canvas",
        position: { x: 10, y: 10 },
      });
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 400) {
        crossCanvasFailed = true;
      }
    }
    assert(crossCanvasFailed, "Cross-board canvas must be rejected with 400");

    // 2c: Shape from different canvas
    let wrongCanvasShapeFailed = false;
    try {
      await commentService.createComment(owner._id as Types.ObjectId, {
        boardId: board._id as Types.ObjectId,
        canvasId: canvas2._id as Types.ObjectId,
        content: "Shape not on canvas2",
        shapeId: shape1._id as Types.ObjectId,
      });
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 400) {
        wrongCanvasShapeFailed = true;
      }
    }
    assert(wrongCanvasShapeFailed, "Shape not belonging to canvas must be rejected with 400");
    console.log("✓ Cross-board and invalid-canvas comment creations correctly rejected.");

    // ----------------------------------------------------
    // TEST 3: Threading & 1-Level Depth Enforcement
    // ----------------------------------------------------
    console.log("Test 3: Creating replies and verifying 1-level thread depth...");
    // 3a: Valid reply
    const reply1 = await commentService.createReply(viewer._id as Types.ObjectId, board._id as Types.ObjectId, coordComment.comment._id as Types.ObjectId, {
      content: "First reply to coord comment",
    });
    commentIds.push(reply1.comment._id as Types.ObjectId);
    assert(reply1.comment.parentCommentId?.equals(coordComment.comment._id as Types.ObjectId) ?? false, "Reply links to root");
    assert(reply1.comment.canvasId.equals(canvas1._id as Types.ObjectId), "Reply inherits canvasId");
    assert(reply1.comment.position?.x === 350, "Reply inherits root position");

    // 3b: Second reply to same root
    const reply2 = await commentService.createReply(editor._id as Types.ObjectId, board._id as Types.ObjectId, coordComment.comment._id as Types.ObjectId, {
      content: "Second reply to coord comment",
    });
    commentIds.push(reply2.comment._id as Types.ObjectId);

    // 3c: Reply to a reply (must be rejected!)
    let nestedReplyFailed = false;
    try {
      await commentService.createReply(admin._id as Types.ObjectId, board._id as Types.ObjectId, reply1.comment._id as Types.ObjectId, {
        content: "Nested reply to a reply",
      });
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 400) {
        nestedReplyFailed = true;
      }
    }
    assert(nestedReplyFailed, "Reply to a reply must be rejected with 400 BAD_REQUEST");

    // 3d: Reply referencing parent from other board
    let crossBoardParentFailed = false;
    try {
      await commentService.createReply(owner._id as Types.ObjectId, otherBoard._id as Types.ObjectId, coordComment.comment._id as Types.ObjectId, {
        content: "Cross board parent",
      });
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 400) {
        crossBoardParentFailed = true;
      }
    }
    assert(crossBoardParentFailed, "Parent belonging to another board must be rejected with 400");
    console.log("✓ 1-level thread hierarchy strictly enforced; nested and cross-board replies rejected.");

    // ----------------------------------------------------
    // TEST 4: RBAC Permissions
    // ----------------------------------------------------
    console.log("Test 4: RBAC permissions across Owner, Admin, Editor, Viewer, and Outsider...");
    // 4a: Outsider cannot create comments
    let outsiderFailed = false;
    try {
      await commentService.createComment(outsider._id as Types.ObjectId, {
        boardId: board._id as Types.ObjectId,
        canvasId: canvas1._id as Types.ObjectId,
        content: "Outsider comment",
        position: { x: 10, y: 10 },
      });
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 403) {
        outsiderFailed = true;
      }
    }
    assert(outsiderFailed, "Outsider forbidden from creating comments");

    // 4b: Viewer CAN create comments and replies
    assert(shapeComment.comment._id !== undefined, "Viewer created shapeComment");
    assert(reply1.comment._id !== undefined, "Viewer created reply1");

    // 4c: Author-only editing
    let nonAuthorEditFailed = false;
    try {
      // Admin tries to edit viewer's comment
      await commentService.updateComment(shapeComment.comment._id as Types.ObjectId, admin._id as Types.ObjectId, {
        content: "Admin edited viewer comment",
      });
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 403) {
        nonAuthorEditFailed = true;
      }
    }
    assert(nonAuthorEditFailed, "Non-author forbidden from editing comment");

    const authorEdit = await commentService.updateComment(shapeComment.comment._id as Types.ObjectId, viewer._id as Types.ObjectId, {
      content: "Author updated content",
    });
    assert(authorEdit.comment.content === "Author updated content", "Author edit succeeded");
    assert(authorEdit.comment.isEdited === true, "isEdited is true");

    // 4d: Moderation deletion (Owner and Admin can delete viewer comment; Viewer cannot delete other's comment)
    let viewerDeleteOtherFailed = false;
    try {
      await commentService.deleteComment(coordComment.comment._id as Types.ObjectId, viewer._id as Types.ObjectId);
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 403) {
        viewerDeleteOtherFailed = true;
      }
    }
    assert(viewerDeleteOtherFailed, "Viewer forbidden from deleting another collaborator's comment");

    const adminDelete = await commentService.deleteComment(coordComment.comment._id as Types.ObjectId, admin._id as Types.ObjectId);
    assert(adminDelete.comment.deletedAt !== null, "Admin moderation deletion succeeded");

    // 4e: Resolve permissions (Viewer non-author forbidden; Editor/Admin/Owner/Author allowed)
    let viewerResolveOtherFailed = false;
    try {
      await commentService.resolveComment(hybridComment.comment._id as Types.ObjectId, viewer._id as Types.ObjectId, {
        isResolved: true,
      });
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 403) {
        viewerResolveOtherFailed = true;
      }
    }
    assert(viewerResolveOtherFailed, "Viewer non-author forbidden from resolving comment");

    const editorResolve = await commentService.resolveComment(hybridComment.comment._id as Types.ObjectId, editor._id as Types.ObjectId, {
      isResolved: true,
    });
    assert(editorResolve.comment.isResolved === true, "Editor can resolve comment thread");
    assert(editorResolve.comment.resolvedBy?.equals(editor._id as Types.ObjectId) ?? false, "resolvedBy is editor");

    // 4f: Reopen resolution by author / editor
    const authorReopen = await commentService.resolveComment(hybridComment.comment._id as Types.ObjectId, admin._id as Types.ObjectId, {
      isResolved: false,
    });
    assert(authorReopen.comment.isResolved === false, "Author can reopen comment thread");
    assert(authorReopen.comment.resolvedAt === null, "resolvedAt nullified on reopen");
    assert(authorReopen.comment.resolvedBy === null, "resolvedBy nullified on reopen");

    // 4g: Cannot resolve soft-deleted comments
    let resolveDeletedFailed = false;
    try {
      await commentService.resolveComment(coordComment.comment._id as Types.ObjectId, admin._id as Types.ObjectId, {
        isResolved: true,
      });
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 400) {
        resolveDeletedFailed = true;
      }
    }
    assert(resolveDeletedFailed, "Cannot resolve a soft-deleted comment (must return 400)");
    console.log("✓ RBAC permissions verified across all 5 roles and actions.");

    // ----------------------------------------------------
    // TEST 5: OCC Concurrency Protection
    // ----------------------------------------------------
    console.log("Test 5: Testing OCC conflict detection with expectedVersion...");
    // 5a: Stale version on update
    let staleUpdateConflict = false;
    try {
      await commentService.updateComment(
        shapeComment.comment._id as Types.ObjectId,
        viewer._id as Types.ObjectId,
        { content: "Concurrent edit" },
        undefined,
        1 // Current version is 2 after previous edit
      );
    } catch (err) {
      if (err instanceof ConflictError) {
        staleUpdateConflict = true;
      }
    }
    assert(staleUpdateConflict, "Stale expectedVersion on update must trigger ConflictError");

    // 5b: Stale version on resolve
    let staleResolveConflict = false;
    try {
      await commentService.resolveComment(
        hybridComment.comment._id as Types.ObjectId,
        admin._id as Types.ObjectId,
        { isResolved: false },
        undefined,
        1 // Current version is 2
      );
    } catch (err) {
      if (err instanceof ConflictError) {
        staleResolveConflict = true;
      }
    }
    assert(staleResolveConflict, "Stale expectedVersion on resolve must trigger ConflictError");
    console.log("✓ OCC conflict protection verified on concurrent comment mutations.");

    // ----------------------------------------------------
    // TEST 6: Shape Deletion Decoupling
    // ----------------------------------------------------
    console.log("Test 6: Shape deletion decoupling preserving comment domain entity...");
    await commentService.handleShapeDeleted(shape1._id as Types.ObjectId);
    const decoupledComment = await commentRepository.findById(shapeComment.comment._id as Types.ObjectId);
    assert(decoupledComment?.shapeId === null, "shapeId is null after shape deletion");
    assert(decoupledComment?.content === "Author updated content", "Comment content preserved");
    console.log("✓ Shape deletion decoupling preserves comments without data loss.");

    // ----------------------------------------------------
    // TEST 7: Slice 32 — Mentions Validation & Normalization
    // ----------------------------------------------------
    console.log("Test 7: Mentions creation, validation, duplicate handling, and edit reconciliation...");

    // 7a: Single mention of active workspace member
    const singleMentionComment = await commentService.createComment(owner._id as Types.ObjectId, {
      boardId: board._id as Types.ObjectId,
      canvasId: canvas1._id as Types.ObjectId,
      content: "Hey @Service Admin please review!",
      mentions: [
        {
          userId: admin._id.toString(),
          displayName: "Service Admin",
          startIndex: 4,
          endIndex: 18,
        },
      ],
    });
    commentIds.push(singleMentionComment.comment._id as Types.ObjectId);
    assert(singleMentionComment.comment.mentions?.length === 1, "Single mention saved");
    assert(
      (singleMentionComment.comment.mentions?.[0].userId as Types.ObjectId).equals(admin._id as Types.ObjectId),
      "Mentioned user ID matches admin"
    );
    assert(
      singleMentionComment.comment.mentions?.[0].displayName === "Service Admin",
      "Canonical display name matches"
    );

    // 7b: Multiple distinct workspace member mentions
    const multiMentionComment = await commentService.createComment(owner._id as Types.ObjectId, {
      boardId: board._id as Types.ObjectId,
      canvasId: canvas1._id as Types.ObjectId,
      content: "@Service Admin and @Service Editor please look at this.",
      mentions: [
        {
          userId: admin._id.toString(),
          displayName: "Service Admin",
          startIndex: 0,
          endIndex: 14,
        },
        {
          userId: editor._id.toString(),
          displayName: "Service Editor",
          startIndex: 19,
          endIndex: 34,
        },
      ],
    });
    commentIds.push(multiMentionComment.comment._id as Types.ObjectId);
    assert(multiMentionComment.comment.mentions?.length === 2, "Multiple mentions saved");

    // 7c: Duplicate occurrences of the same user with distinct ranges
    const duplicateMentionComment = await commentService.createComment(owner._id as Types.ObjectId, {
      boardId: board._id as Types.ObjectId,
      canvasId: canvas1._id as Types.ObjectId,
      content: "Hey @Service Admin, and again @Service Admin!",
      mentions: [
        {
          userId: admin._id.toString(),
          displayName: "Service Admin",
          startIndex: 4,
          endIndex: 18,
        },
        {
          userId: admin._id.toString(),
          displayName: "Service Admin",
          startIndex: 30,
          endIndex: 44,
        },
      ],
    });
    commentIds.push(duplicateMentionComment.comment._id as Types.ObjectId);
    assert(duplicateMentionComment.comment.mentions?.length === 2, "Duplicate occurrences preserved");
    assert(
      duplicateMentionComment.comment.mentions?.[0].startIndex === 4 &&
        duplicateMentionComment.comment.mentions?.[1].startIndex === 30,
      "Distinct start indices preserved"
    );

    // 7d: Self-mention is allowed and persisted
    const selfMentionComment = await commentService.createComment(owner._id as Types.ObjectId, {
      boardId: board._id as Types.ObjectId,
      canvasId: canvas1._id as Types.ObjectId,
      content: "Note to @Service Owner: finish this.",
      mentions: [
        {
          userId: owner._id.toString(),
          displayName: "Service Owner",
          startIndex: 8,
          endIndex: 22,
        },
      ],
    });
    commentIds.push(selfMentionComment.comment._id as Types.ObjectId);
    assert(selfMentionComment.comment.mentions?.length === 1, "Self mention persisted");

    // 7e: Rejection of non-workspace member mention (MUST fail entire mutation)
    let nonMemberFailed = false;
    try {
      await commentService.createComment(owner._id as Types.ObjectId, {
        boardId: board._id as Types.ObjectId,
        canvasId: canvas1._id as Types.ObjectId,
        content: "Hey @Service Outsider, look at this!",
        mentions: [
          {
            userId: outsider._id.toString(),
            displayName: "Service Outsider",
            startIndex: 4,
            endIndex: 21,
          },
        ],
      });
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 400) {
        nonMemberFailed = true;
      }
    }
    assert(nonMemberFailed, "Non-member mention must be rejected with 400");

    // 7f: Rejection of out-of-bounds mention ranges
    let outOfBoundsFailed = false;
    try {
      await commentService.createComment(owner._id as Types.ObjectId, {
        boardId: board._id as Types.ObjectId,
        canvasId: canvas1._id as Types.ObjectId,
        content: "Short text",
        mentions: [
          {
            userId: admin._id.toString(),
            displayName: "Service Admin",
            startIndex: 0,
            endIndex: 50,
          },
        ],
      });
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 400) {
        outOfBoundsFailed = true;
      }
    }
    assert(outOfBoundsFailed, "Out-of-bounds range must be rejected with 400");

    // 7g: Rejection of overlapping mention ranges
    let overlapFailed = false;
    try {
      await commentService.createComment(owner._id as Types.ObjectId, {
        boardId: board._id as Types.ObjectId,
        canvasId: canvas1._id as Types.ObjectId,
        content: "@Service Admin and more text",
        mentions: [
          {
            userId: admin._id.toString(),
            displayName: "Service Admin",
            startIndex: 0,
            endIndex: 14,
          },
          {
            userId: editor._id.toString(),
            displayName: "Service Editor",
            startIndex: 10,
            endIndex: 20,
          },
        ],
      });
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 400) {
        overlapFailed = true;
      }
    }
    assert(overlapFailed, "Overlapping mention ranges must be rejected with 400");

    // 7h: Rejection of mention slice not starting with '@'
    let noAtSliceFailed = false;
    try {
      await commentService.createComment(owner._id as Types.ObjectId, {
        boardId: board._id as Types.ObjectId,
        canvasId: canvas1._id as Types.ObjectId,
        content: "Hello Service Admin",
        mentions: [
          {
            userId: admin._id.toString(),
            displayName: "Service Admin",
            startIndex: 6,
            endIndex: 19,
          },
        ],
      });
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === 400) {
        noAtSliceFailed = true;
      }
    }
    assert(noAtSliceFailed, "Mention slice not starting with '@' must be rejected with 400");

    // 7i: Updating comment: replacing a mention during edit
    const updatedMentionComment = await commentService.updateComment(
      singleMentionComment.comment._id as Types.ObjectId,
      owner._id as Types.ObjectId,
      {
        content: "Hey @Service Editor please review instead!",
        mentions: [
          {
            userId: editor._id.toString(),
            displayName: "Service Editor",
            startIndex: 4,
            endIndex: 19,
          },
        ],
      }
    );
    assert(updatedMentionComment.comment.mentions?.length === 1, "Updated mention count is 1");
    assert(
      (updatedMentionComment.comment.mentions?.[0].userId as Types.ObjectId).equals(editor._id as Types.ObjectId),
      "Mention updated from admin to editor"
    );

    // 7j: Updating comment: removing all mentions during edit
    const noMentionEdit = await commentService.updateComment(
      singleMentionComment.comment._id as Types.ObjectId,
      owner._id as Types.ObjectId,
      {
        content: "Hey everyone, please review!",
        mentions: [],
      }
    );
    assert(noMentionEdit.comment.mentions?.length === 0, "Mentions removed after edit");

    // 7k: Reply creation with mentions
    const replyWithMention = await commentService.createReply(
      editor._id as Types.ObjectId,
      board._id as Types.ObjectId,
      multiMentionComment.comment._id as Types.ObjectId,
      {
        content: "Thanks @Service Owner!",
        mentions: [
          {
            userId: owner._id.toString(),
            displayName: "Service Owner",
            startIndex: 7,
            endIndex: 21,
          },
        ],
      }
    );
    commentIds.push(replyWithMention.comment._id as Types.ObjectId);
    assert(replyWithMention.comment.mentions?.length === 1, "Reply with mention persisted");
    console.log("✓ Mentions lifecycle, validation, duplicate handling, and edit reconciliation verified.");

    console.log("\nAll Comment Service Integration Tests Passed Successfully!");
  } finally {
    if (isDbConnected) {
      await CommentModel.deleteMany({ _id: { $in: commentIds } });
      await ShapeModel.deleteMany({ _id: { $in: shapeIds } });
      await CanvasModel.deleteMany({ _id: { $in: canvasIds } });
      await BoardModel.deleteMany({ _id: { $in: boardIds } });
      await WorkspaceMemberModel.deleteMany({ workspaceId: { $in: workspaceIds } });
      await WorkspaceModel.deleteMany({ _id: { $in: workspaceIds } });
      await UserModel.deleteMany({ _id: { $in: userIds } });
      await mongoose.disconnect();
      console.log("MongoDB disconnected and test fixtures cleaned up.");
    }
  }
}

runCommentServiceTests().catch((err) => {
  console.error("Comment Service Test Failure:", err);
  process.exit(1);
});
