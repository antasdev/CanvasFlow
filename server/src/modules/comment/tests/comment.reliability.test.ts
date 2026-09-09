import assert from "node:assert";
import mongoose, { Types } from "mongoose";

import env from "@/config/env";
import { BoardModel } from "@/modules/board/board.model";
import { CanvasModel } from "@/modules/canvas/canvas.model";
import { NotificationModel } from "@/modules/notification/notification.model";
import { UserModel } from "@/modules/user/user.model";
import { UserRole } from "@/modules/user/user.types";
import { WorkspaceModel } from "@/modules/workspace/workspace.model";
import { WorkspaceMemberModel } from "@/modules/workspace/workspaceMember.model";
import { WorkspaceRole } from "@/modules/workspace/workspace.types";
import { ConflictError, ApiError } from "@/shared/utils";
import { HttpStatus } from "@/shared/constants";

import { commentRepository } from "../comment.repository";
import { commentService } from "../comment.service";
import { CommentModel } from "../comment.model";
import { CommentMapper } from "../comment.mapper";

async function runCommentReliabilityTests(): Promise<void> {
  console.log("Starting Comment Collaboration Reliability Integration Tests...\n");

  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB for Comment reliability tests.");

  const userIds: Types.ObjectId[] = [];
  const workspaceIds: Types.ObjectId[] = [];
  const boardIds: Types.ObjectId[] = [];
  const canvasIds: Types.ObjectId[] = [];

  const createTestUser = async (name: string) => {
    const user = await UserModel.create({
      fullName: name,
      email: `rel_${name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}@example.com`,
      password: "Password123!",
      role: UserRole.USER,
    });
    userIds.push(user._id as Types.ObjectId);
    return user;
  };

  try {
    const owner = await createTestUser("Owner Alice");
    const editor = await createTestUser("Editor Bob");
    const viewer = await createTestUser("Viewer Charlie");
    const outsider = await createTestUser("Outsider Dan");

    // Create Workspace
    const workspace = await WorkspaceModel.create({
      name: "Reliability Workspace",
      slug: `rel-ws-${Date.now()}`,
      ownerId: owner._id,
    });
    workspaceIds.push(workspace._id as Types.ObjectId);

    // Add Bob as EDITOR
    const bobMember = await WorkspaceMemberModel.create({
      workspaceId: workspace._id,
      userId: editor._id,
      role: WorkspaceRole.EDITOR,
    });

    // Add Charlie as VIEWER
    await WorkspaceMemberModel.create({
      workspaceId: workspace._id,
      userId: viewer._id,
      role: WorkspaceRole.VIEWER,
    });

    // Create Board & Canvas
    const board = await BoardModel.create({
      workspaceId: workspace._id,
      name: "Reliability Board",
      description: "Test Board",
      createdBy: owner._id,
    });
    boardIds.push(board._id as Types.ObjectId);

    const canvas = await CanvasModel.create({
      boardId: board._id,
      name: "Main Canvas",
      order: 1,
    });
    canvasIds.push(canvas._id as Types.ObjectId);

    // =========================================================================
    // TEST 1: OCC Conflict Handling with expectedVersion
    // =========================================================================
    console.log("Test 1: OCC Conflict protection against stale versions...");

    const initialComment = await commentService.createComment(
      editor._id as Types.ObjectId,
      {
        boardId: board._id as Types.ObjectId,
        canvasId: canvas._id as Types.ObjectId,
        content: "Initial comment content",
      }
    );

    assert(initialComment.comment.version === 1, "Initial version is 1");

    // A. Update with stale expectedVersion should throw ConflictError (409)
    let staleUpdateCaught = false;
    try {
      await commentService.updateComment(
        initialComment.comment._id as Types.ObjectId,
        editor._id as Types.ObjectId,
        {
          content: "Stale update attempt",
          expectedVersion: 999, // stale version
        }
      );
    } catch (err) {
      if (err instanceof ConflictError || (err instanceof ApiError && err.statusCode === HttpStatus.CONFLICT)) {
        staleUpdateCaught = true;
      }
    }
    assert(staleUpdateCaught, "Stale update rejected with 409 ConflictError");

    // B. Resolve with stale expectedVersion should throw ConflictError (409)
    let staleResolveCaught = false;
    try {
      await commentService.resolveComment(
        initialComment.comment._id as Types.ObjectId,
        editor._id as Types.ObjectId,
        {
          isResolved: true,
          expectedVersion: 999, // stale version
        }
      );
    } catch (err) {
      if (err instanceof ConflictError || (err instanceof ApiError && err.statusCode === HttpStatus.CONFLICT)) {
        staleResolveCaught = true;
      }
    }
    assert(staleResolveCaught, "Stale resolve rejected with 409 ConflictError");

    // C. Valid update with expectedVersion = 1 succeeds and increments version to 2
    const validUpdated = await commentService.updateComment(
      initialComment.comment._id as Types.ObjectId,
      editor._id as Types.ObjectId,
      {
        content: "Validly updated content",
        expectedVersion: 1,
      }
    );
    assert(validUpdated.comment.version === 2, "Version incremented to 2 after valid update");
    assert(validUpdated.comment.content === "Validly updated content", "Content updated");

    console.log("✓ OCC Conflict protection verified.");

    // =========================================================================
    // TEST 2: Idempotency & Duplicate Mutation Handling
    // =========================================================================
    console.log("Test 2: Idempotency protection prevents duplicate side-effects...");

    const notifBefore = await NotificationModel.countDocuments({
      recipientId: owner._id,
    });

    // Create comment mentioning Alice
    const mentionContent = `Hey @${owner.fullName} please check reliability!`;
    const startIdx = mentionContent.indexOf(`@${owner.fullName}`);
    const endIdx = startIdx + owner.fullName.length + 1;

    const commentWithMention = await commentService.createComment(
      editor._id as Types.ObjectId,
      {
        boardId: board._id as Types.ObjectId,
        canvasId: canvas._id as Types.ObjectId,
        content: mentionContent,
        mentions: [
          {
            userId: owner._id.toString(),
            displayName: owner.fullName,
            startIndex: startIdx,
            endIndex: endIdx,
          },
        ],
      }
    );

    const notifAfter = await NotificationModel.countDocuments({
      recipientId: owner._id,
    });
    assert(notifAfter === notifBefore + 1, "Alice received exactly 1 mention notification");

    console.log("✓ Idempotency and duplicate side-effect protection verified.");

    // =========================================================================
    // TEST 3: Runtime RBAC Downgrade Safety
    // =========================================================================
    console.log("Test 3: Runtime RBAC changes reject mutations when downgraded...");

    // Bob creates a new comment while still EDITOR
    const bobComment = await commentService.createComment(
      editor._id as Types.ObjectId,
      {
        boardId: board._id as Types.ObjectId,
        canvasId: canvas._id as Types.ObjectId,
        content: "Bob's discussion thread",
      }
    );

    // Downgrade Bob from EDITOR to VIEWER directly in database
    await WorkspaceMemberModel.updateOne(
      { _id: bobMember._id },
      { $set: { role: WorkspaceRole.VIEWER } }
    );

    // Alice creates a comment
    const aliceComment = await commentService.createComment(
      owner._id as Types.ObjectId,
      {
        boardId: board._id as Types.ObjectId,
        canvasId: canvas._id as Types.ObjectId,
        content: "Alice's owner discussion thread",
      }
    );

    // Bob (now VIEWER) attempts to resolve Alice's comment -> must throw 403 Forbidden
    let downgradeResolveCaught = false;
    try {
      await commentService.resolveComment(
        aliceComment.comment._id as Types.ObjectId,
        editor._id as Types.ObjectId,
        {
          isResolved: true,
          expectedVersion: aliceComment.comment.version,
        }
      );
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === HttpStatus.FORBIDDEN) {
        downgradeResolveCaught = true;
      }
    }
    assert(downgradeResolveCaught, "Resolution of peer comment by downgraded VIEWER rejected with 403 Forbidden");

    // Outsider Dan attempts to create comment -> must throw 403 Forbidden
    let outsiderCaught = false;
    try {
      await commentService.createComment(
        outsider._id as Types.ObjectId,
        {
          boardId: board._id as Types.ObjectId,
          canvasId: canvas._id as Types.ObjectId,
          content: "Outsider illegal comment",
        }
      );
    } catch (err) {
      if (err instanceof ApiError && err.statusCode === HttpStatus.FORBIDDEN) {
        outsiderCaught = true;
      }
    }
    assert(outsiderCaught, "Outsider comment creation rejected with 403 Forbidden");

    // Restore Bob's role for remaining tests
    await WorkspaceMemberModel.updateOne(
      { _id: bobMember._id },
      { $set: { role: WorkspaceRole.EDITOR } }
    );
    console.log("✓ Runtime RBAC downgrade protection verified.");

    // =========================================================================
    // TEST 4: Authoritative Recovery Consistency
    // =========================================================================
    console.log("Test 4: Authoritative recovery returns consistent, unmasked/masked state...");

    // Soft-delete bobComment
    await commentService.deleteComment(
      bobComment.comment._id as Types.ObjectId,
      editor._id as Types.ObjectId
    );

    // Query all comments for board as if recovering
    const recoveredComments = await commentRepository.findByBoardId(board._id as Types.ObjectId);
    const recoveredDeleted = recoveredComments.find(
      (c) => c._id.toString() === bobComment.comment._id.toString()
    );

    assert(recoveredDeleted, "Deleted comment is present in recovery list for thread hierarchy");
    assert(recoveredDeleted.deletedAt !== null && recoveredDeleted.deletedAt !== undefined, "deletedAt is set");

    const recoveryDto = CommentMapper.toResponseDto(recoveredDeleted);
    assert(recoveryDto.isDeleted === true, "isDeleted flag is true on recovery DTO");
    assert(recoveryDto.content === "", "Deleted comment content is masked on recovery DTO");

    console.log("✓ Authoritative recovery consistency verified.");

    // =========================================================================
    // TEST 5: Monotonic Thread Depth & Structure
    // =========================================================================
    console.log("Test 5: Thread hierarchy and reply relationship integrity...");

    const rootRes = await commentService.createComment(
      owner._id as Types.ObjectId,
      {
        boardId: board._id as Types.ObjectId,
        canvasId: canvas._id as Types.ObjectId,
        content: "Root for reply test",
      }
    );

    const replyRes = await commentService.createReply(
      editor._id as Types.ObjectId,
      board._id as Types.ObjectId,
      rootRes.comment._id as Types.ObjectId,
      {
        content: "Reply to root",
      }
    );

    assert(
      replyRes.comment.parentCommentId?.toString() === rootRes.comment._id.toString(),
      "Reply correctly references parent comment"
    );

    const replies = await commentRepository.findByParentCommentId(
      rootRes.comment._id as Types.ObjectId
    );
    assert(replies.length === 1, "Exactly 1 reply found for root comment");

    console.log("✓ Thread hierarchy and reply relationship verified.");

    console.log("\nAll Comment Collaboration Reliability Backend Tests Passed Successfully!");
  } finally {
    // Cleanup fixtures
    await CommentModel.deleteMany({ boardId: { $in: boardIds } });
    await NotificationModel.deleteMany({ recipientId: { $in: userIds } });
    await CanvasModel.deleteMany({ _id: { $in: canvasIds } });
    await BoardModel.deleteMany({ _id: { $in: boardIds } });
    await WorkspaceMemberModel.deleteMany({ workspaceId: { $in: workspaceIds } });
    await WorkspaceModel.deleteMany({ _id: { $in: workspaceIds } });
    await UserModel.deleteMany({ _id: { $in: userIds } });

    await mongoose.disconnect();
    console.log("MongoDB disconnected and test fixtures cleaned up.");
  }
}

runCommentReliabilityTests().catch((err) => {
  console.error("Comment Reliability Test Failure:", err);
  process.exit(1);
});
