import mongoose, { Types } from "mongoose";

import env from "@/config/env";
import { UserModel } from "@/modules/user/user.model";
import { UserRole } from "@/modules/user/user.types";
import { BoardModel } from "@/modules/board/board.model";
import { BoardVisibility } from "@/modules/board/board.types";
import { CanvasModel } from "@/modules/canvas/canvas.model";
import { ShapeModel } from "@/modules/shape/shape.model";
import { ShapeType } from "@/modules/shape/shape.types";
import { CommentModel } from "../comment.model";
import { commentRepository } from "../comment.repository";
import { CommentMapper } from "../comment.mapper";
import {
  createCommentSchema,
  positionSchema,
  createReplySchema,
} from "../comment.validation";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runCommentDomainTests(): Promise<void> {
  console.log("Starting Comment Domain & Repository Unit Tests...\n");

  let isDbConnected = false;
  try {
    await mongoose.connect(env.MONGODB_URI);
    isDbConnected = true;
    console.log("Connected to MongoDB for Comment domain tests.");
  } catch (err) {
    console.warn("MongoDB connection unavailable, skipping integration parts:", err);
    return;
  }

  // Track test fixtures for clean teardown
  const userIds: Types.ObjectId[] = [];
  const boardIds: Types.ObjectId[] = [];
  const canvasIds: Types.ObjectId[] = [];
  const shapeIds: Types.ObjectId[] = [];
  const commentIds: Types.ObjectId[] = [];

  try {
    // ----------------------------------------------------
    // TEST 1: Zod Schema Validations
    // ----------------------------------------------------
    console.log("Test 1: Validating positionSchema for finite numbers...");
    const validPos = positionSchema.safeParse({ x: 100.5, y: -200.75 });
    assert(validPos.success, "positionSchema should accept finite floats");

    const nanPos = positionSchema.safeParse({ x: NaN, y: 100 });
    assert(!nanPos.success, "positionSchema must reject NaN");

    const infPos = positionSchema.safeParse({ x: Infinity, y: 100 });
    assert(!infPos.success, "positionSchema must reject Infinity");

    const negInfPos = positionSchema.safeParse({ x: 100, y: -Infinity });
    assert(!negInfPos.success, "positionSchema must reject -Infinity");
    console.log("✓ positionSchema correctly restricts to finite numbers.");

    console.log("Test 2: Validating createCommentSchema & createReplySchema content limits...");
    const emptyContent = createCommentSchema.safeParse({
      params: { boardId: new Types.ObjectId().toString() },
      body: { content: "" },
    });
    assert(!emptyContent.success, "Empty content must be rejected");

    const whitespaceContent = createCommentSchema.safeParse({
      params: { boardId: new Types.ObjectId().toString() },
      body: { content: "   \n\t  " },
    });
    assert(!whitespaceContent.success, "Whitespace-only content must be rejected");

    const longContent = createCommentSchema.safeParse({
      params: { boardId: new Types.ObjectId().toString() },
      body: { content: "a".repeat(2001) },
    });
    assert(!longContent.success, "Content exceeding 2000 characters must be rejected");

    const validReply = createReplySchema.safeParse({
      params: {
        boardId: new Types.ObjectId().toString(),
        commentId: new Types.ObjectId().toString(),
      },
      body: { content: "A valid threaded reply" },
    });
    assert(validReply.success, "Valid reply content should pass");
    console.log("✓ Validation schemas enforce content lengths and trimming.");

    // ----------------------------------------------------
    // Fixture Setup
    // ----------------------------------------------------
    const user = await UserModel.create({
      fullName: "Domain Commenter",
      email: `commenter_${Date.now()}_${Math.random().toString(36).substring(2, 6)}@example.com`,
      password: "Password123!",
      role: UserRole.USER,
    });
    userIds.push(user._id as Types.ObjectId);

    const board = await BoardModel.create({
      name: "Domain Test Board",
      workspaceId: new Types.ObjectId(),
      createdBy: user._id,
      visibility: BoardVisibility.PRIVATE,
    });
    boardIds.push(board._id as Types.ObjectId);

    const canvas = await CanvasModel.create({
      boardId: board._id,
      name: "Canvas Page 1",
      order: 1,
    });
    canvasIds.push(canvas._id as Types.ObjectId);

    const shape = await ShapeModel.create({
      canvasId: canvas._id,
      createdBy: user._id,
      type: ShapeType.RECTANGLE,
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      zIndex: 1,
    });
    shapeIds.push(shape._id as Types.ObjectId);

    // ----------------------------------------------------
    // TEST 3: Comment Model Persistence & Required Fields
    // ----------------------------------------------------
    console.log("Test 3: Creating canvas-anchored root comment via repository...");
    const rootComment = await commentRepository.create({
      boardId: board._id as Types.ObjectId,
      canvasId: canvas._id as Types.ObjectId,
      authorId: user._id as Types.ObjectId,
      content: "First root comment on canvas",
      position: { x: 50, y: 80 },
    });
    commentIds.push(rootComment._id as Types.ObjectId);

    assert(rootComment._id !== undefined, "Comment ID should be defined");
    assert(rootComment.canvasId.equals(canvas._id as Types.ObjectId), "canvasId should match");
    assert(rootComment.position?.x === 50 && rootComment.position?.y === 80, "Position coordinates match");
    assert(rootComment.isResolved === false, "Default isResolved is false");
    assert(rootComment.isEdited === false, "Default isEdited is false");
    assert(rootComment.version === 1, "Default version is 1");
    assert(rootComment.parentCommentId === null, "Root comment parentCommentId is null");
    console.log("✓ Root comment persisted with required fields and defaults.");

    // ----------------------------------------------------
    // TEST 4: Thread Replies Persistence
    // ----------------------------------------------------
    console.log("Test 4: Creating threaded reply referencing root comment...");
    const replyComment = await commentRepository.create({
      boardId: board._id as Types.ObjectId,
      canvasId: canvas._id as Types.ObjectId,
      authorId: user._id as Types.ObjectId,
      parentCommentId: rootComment._id as Types.ObjectId,
      content: "Reply to first root comment",
    });
    commentIds.push(replyComment._id as Types.ObjectId);

    assert(replyComment.parentCommentId?.equals(rootComment._id as Types.ObjectId) ?? false, "parentCommentId links to root");
    assert(replyComment.version === 1, "Reply version is 1");

    const replies = await commentRepository.findReplies(rootComment._id as Types.ObjectId);
    assert(replies.length === 1, "findReplies returns 1 reply");
    assert(replies[0]._id.equals(replyComment._id as Types.ObjectId), "findReplies returns correct reply");
    console.log("✓ Reply persistence and thread relationship verified.");

    // ----------------------------------------------------
    // TEST 5: Shape-Attached Comments & Aggregation
    // ----------------------------------------------------
    console.log("Test 5: Shape-attached comment and countUnresolvedByShape aggregation...");
    const shapeComment = await commentRepository.create({
      boardId: board._id as Types.ObjectId,
      canvasId: canvas._id as Types.ObjectId,
      authorId: user._id as Types.ObjectId,
      shapeId: shape._id as Types.ObjectId,
      content: "Comment attached to rectangle shape",
    });
    commentIds.push(shapeComment._id as Types.ObjectId);

    const unresolvedMap = await commentRepository.countUnresolvedByShape(
      board._id as Types.ObjectId,
      canvas._id as Types.ObjectId,
      [shape._id as Types.ObjectId]
    );

    assert(unresolvedMap[shape._id.toString()] === 1, "countUnresolvedByShape aggregates 1 comment");
    console.log("✓ Unresolved comment counts aggregated efficiently by shape.");

    // ----------------------------------------------------
    // TEST 6: Resolving Comment with Metadata
    // ----------------------------------------------------
    console.log("Test 6: Resolving comment with expectedVersion and resolvedBy...");
    const resolved = await commentRepository.updateWithExpectedVersion(
      rootComment._id as Types.ObjectId,
      1,
      {
        isResolved: true,
        resolvedAt: new Date(),
        resolvedBy: user._id as Types.ObjectId,
      }
    );

    assert(resolved !== null, "updateWithExpectedVersion succeeded");
    assert(resolved?.isResolved === true, "isResolved updated to true");
    assert(resolved?.version === 2, "version incremented to 2");
    assert(resolved?.resolvedAt instanceof Date, "resolvedAt recorded");
    console.log("✓ Expected-version update and resolution tracking verified.");

    // ----------------------------------------------------
    // TEST 7: Soft Deletion & Content Masking in Mapper
    // ----------------------------------------------------
    console.log("Test 7: Soft-deleting comment and verifying DTO masking...");
    const softDeleted = await commentRepository.softDeleteWithExpectedVersion(
      replyComment._id as Types.ObjectId,
      1
    );

    assert(softDeleted !== null, "Soft delete succeeded");
    assert(softDeleted?.deletedAt !== null, "deletedAt timestamp set");
    assert(softDeleted?.version === 2, "Version incremented on delete");

    const dto = CommentMapper.toResponseDto(softDeleted!, softDeleted?.authorId as any);
    assert(dto.isDeleted === true, "DTO isDeleted is true");
    assert(dto.content === "", "DTO content is masked to empty string");
    assert(dto.parentCommentId === rootComment._id.toString(), "Parent thread link preserved");
    console.log("✓ Soft deletion masks content while preserving thread hierarchy.");

    // ----------------------------------------------------
    // TEST 8: Shape Decoupling on Shape Deletion
    // ----------------------------------------------------
    console.log("Test 8: Decoupling shape comments on shape deletion...");
    const decoupledCount = await commentRepository.nullifyShapeId(shape._id as Types.ObjectId);
    assert(decoupledCount === 1, "1 comment shapeId was nullified");

    const refetchedShapeComment = await commentRepository.findById(shapeComment._id as Types.ObjectId);
    assert(refetchedShapeComment?.shapeId === null, "shapeId is decoupled to null");
    console.log("✓ Shape deletion decoupling preserves comments as canvas-level items.");

    console.log("\nAll Comment Domain & Repository Unit Tests Passed Successfully!");
  } finally {
    if (isDbConnected) {
      // Cleanup fixtures
      await CommentModel.deleteMany({ _id: { $in: commentIds } });
      await ShapeModel.deleteMany({ _id: { $in: shapeIds } });
      await CanvasModel.deleteMany({ _id: { $in: canvasIds } });
      await BoardModel.deleteMany({ _id: { $in: boardIds } });
      await UserModel.deleteMany({ _id: { $in: userIds } });
      await mongoose.disconnect();
      console.log("MongoDB disconnected and test fixtures cleaned up.");
    }
  }
}

runCommentDomainTests().catch((err) => {
  console.error("Comment Domain Test Failure:", err);
  process.exit(1);
});
