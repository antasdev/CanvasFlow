import { createServer } from "http";
import mongoose, { Types } from "mongoose";

import app from "@/app";
import env from "@/config/env";
import { generateAccessToken } from "@/modules/auth/auth.tokens";
import { UserModel } from "@/modules/user/user.model";
import { UserRole } from "@/modules/user/user.types";
import { WorkspaceModel } from "@/modules/workspace/workspace.model";
import { WorkspaceMemberModel } from "@/modules/workspace/workspaceMember.model";
import { WorkspaceRole, WorkspaceVisibility } from "@/modules/workspace/workspace.types";
import { BoardModel } from "@/modules/board/board.model";
import { BoardVisibility } from "@/modules/board/board.types";
import { CanvasModel } from "@/modules/canvas/canvas.model";
import { CommentModel } from "../comment.model";
import { CommentResponseDto } from "../comment.dto";

type SingleCommentApiResponse = {
  success: boolean;
  data: CommentResponseDto;
  message?: string;
};

type CommentListApiResponse = {
  success: boolean;
  data: CommentResponseDto[];
  message?: string;
};

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runCommentApiTests(): Promise<void> {
  console.log("Starting Comment REST API Integration Tests...\n");

  let isDbConnected = false;
  try {
    await mongoose.connect(env.MONGODB_URI);
    isDbConnected = true;
    console.log("Connected to MongoDB for Comment REST API tests.");
  } catch (err) {
    console.warn("MongoDB connection unavailable, skipping tests:", err);
    return;
  }

  const httpServer = createServer(app);
  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve());
  });

  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://localhost:${port}/api/v1`;

  const userIds: Types.ObjectId[] = [];
  const workspaceIds: Types.ObjectId[] = [];
  const boardIds: Types.ObjectId[] = [];
  const canvasIds: Types.ObjectId[] = [];
  const commentIds: Types.ObjectId[] = [];

  const createTestUser = async (name: string) => {
    const user = await UserModel.create({
      fullName: name,
      email: `api_${name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}@example.com`,
      password: "Password123!",
      role: UserRole.USER,
    });
    userIds.push(user._id as Types.ObjectId);
    const token = generateAccessToken({
      userId: user._id.toString(),
      role: user.role,
    });
    return { user, token };
  };

  try {
    const owner = await createTestUser("API Owner");
    const editor = await createTestUser("API Editor");
    const viewer = await createTestUser("API Viewer");
    const outsider = await createTestUser("API Outsider");

    const workspace = await WorkspaceModel.create({
      name: "API Test Workspace",
      ownerId: owner.user._id,
      visibility: WorkspaceVisibility.PRIVATE,
    });
    workspaceIds.push(workspace._id as Types.ObjectId);

    await WorkspaceMemberModel.create([
      { workspaceId: workspace._id, userId: editor.user._id, role: WorkspaceRole.EDITOR, joinedAt: new Date() },
      { workspaceId: workspace._id, userId: viewer.user._id, role: WorkspaceRole.VIEWER, joinedAt: new Date() },
    ]);

    const board = await BoardModel.create({
      name: "API Test Board",
      workspaceId: workspace._id,
      createdBy: owner.user._id,
      visibility: BoardVisibility.PRIVATE,
    });
    boardIds.push(board._id as Types.ObjectId);

    const canvas = await CanvasModel.create({
      boardId: board._id,
      name: "Page 1",
      order: 1,
    });
    canvasIds.push(canvas._id as Types.ObjectId);

    // ----------------------------------------------------
    // TEST 1: Unauthenticated request rejected
    // ----------------------------------------------------
    console.log("Test 1: Unauthenticated request returns 401 Unauthorized...");
    const unauthRes = await fetch(`${baseUrl}/boards/${board._id}/comments`);
    assert(unauthRes.status === 401, "Expected 401 for unauthenticated request");
    console.log("✓ Unauthenticated request rejected with 401.");

    // ----------------------------------------------------
    // TEST 2: Outsider rejected
    // ----------------------------------------------------
    console.log("Test 2: Outsider request returns 403 Forbidden...");
    const outsiderRes = await fetch(`${baseUrl}/boards/${board._id}/comments`, {
      headers: { Authorization: `Bearer ${outsider.token}` },
    });
    assert(outsiderRes.status === 403, "Expected 403 for outsider");
    console.log("✓ Outsider forbidden from board comments with 403.");

    // ----------------------------------------------------
    // TEST 3: POST Canvas Comment
    // ----------------------------------------------------
    console.log("Test 3: Viewer creating root comment on canvas...");
    const createRes = await fetch(
      `${baseUrl}/boards/${board._id}/canvases/${canvas._id}/comments`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${viewer.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: "Viewer canvas comment via REST",
          position: { x: 120, y: 340 },
        }),
      }
    );

    assert(createRes.status === 201, `Expected 201 Created, got ${createRes.status}`);
    const createJson = (await createRes.json()) as SingleCommentApiResponse;
    assert(createJson.success === true, "Response success is true");
    assert(createJson.data.content === "Viewer canvas comment via REST", "Content matches");
    assert(createJson.data.canvasId === canvas._id.toString(), "canvasId matches");
    assert(createJson.data.position?.x === 120, "Position x matches");
    const rootCommentId = createJson.data.id;
    commentIds.push(new Types.ObjectId(rootCommentId));
    console.log("✓ Root comment created via POST /boards/:boardId/canvases/:canvasId/comments.");

    // ----------------------------------------------------
    // TEST 4: POST Reply to thread
    // ----------------------------------------------------
    console.log("Test 4: Editor replying to comment thread...");
    const replyRes = await fetch(
      `${baseUrl}/boards/${board._id}/comments/${rootCommentId}/replies`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${editor.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: "Editor reply via REST",
        }),
      }
    );

    assert(replyRes.status === 201, `Expected 201, got ${replyRes.status}`);
    const replyJson = (await replyRes.json()) as SingleCommentApiResponse;
    assert(replyJson.data.parentCommentId === rootCommentId, "parentCommentId links to root");
    const replyId = replyJson.data.id;
    commentIds.push(new Types.ObjectId(replyId));
    console.log("✓ Reply created via POST /boards/:boardId/comments/:commentId/replies.");

    // ----------------------------------------------------
    // TEST 5: GET Canvas Comments
    // ----------------------------------------------------
    console.log("Test 5: Fetching canvas comments list...");
    const getCanvasRes = await fetch(
      `${baseUrl}/boards/${board._id}/canvases/${canvas._id}/comments`,
      {
        headers: { Authorization: `Bearer ${viewer.token}` },
      }
    );

    assert(getCanvasRes.status === 200, "Expected 200 OK");
    const getCanvasJson = (await getCanvasRes.json()) as CommentListApiResponse;
    assert(Array.isArray(getCanvasJson.data), "data is array");
    assert(getCanvasJson.data.length === 2, "2 comments returned (root + reply)");
    console.log("✓ Canvas comments fetched via GET /boards/:boardId/canvases/:canvasId/comments.");

    // ----------------------------------------------------
    // TEST 6: GET Single Comment
    // ----------------------------------------------------
    console.log("Test 6: Fetching single comment by ID...");
    const getOneRes = await fetch(
      `${baseUrl}/boards/${board._id}/comments/${rootCommentId}`,
      {
        headers: { Authorization: `Bearer ${viewer.token}` },
      }
    );
    assert(getOneRes.status === 200, "Expected 200 OK");
    const getOneJson = (await getOneRes.json()) as SingleCommentApiResponse;
    assert(getOneJson.data.id === rootCommentId, "id matches rootCommentId");
    console.log("✓ Single comment fetched via GET /boards/:boardId/comments/:commentId.");

    // ----------------------------------------------------
    // TEST 7: PATCH Update Comment (Author-Only & OCC)
    // ----------------------------------------------------
    console.log("Test 7: Updating comment content (author-only check & OCC)...");
    // Non-author attempt
    const badEditRes = await fetch(
      `${baseUrl}/boards/${board._id}/comments/${rootCommentId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${editor.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: "Illegal edit by editor" }),
      }
    );
    assert(badEditRes.status === 403, "Non-author edit rejected with 403");

    // Author attempt with stale version
    const staleEditRes = await fetch(
      `${baseUrl}/boards/${board._id}/comments/${rootCommentId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${viewer.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: "Stale edit",
          expectedVersion: 999,
        }),
      }
    );
    assert(staleEditRes.status === 409, "Stale expectedVersion rejected with 409 Conflict");

    // Valid author edit
    const validEditRes = await fetch(
      `${baseUrl}/boards/${board._id}/comments/${rootCommentId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${viewer.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          content: "Updated viewer content",
          expectedVersion: 1,
        }),
      }
    );
    assert(validEditRes.status === 200, "Author edit succeeded with 200");
    const validEditJson = (await validEditRes.json()) as SingleCommentApiResponse;
    assert(validEditJson.data.content === "Updated viewer content", "Content updated");
    assert(validEditJson.data.isEdited === true, "isEdited is true");
    assert(validEditJson.data.version === 2, "Version incremented to 2");
    console.log("✓ Comment updated with author authorization and OCC version increment.");

    // ----------------------------------------------------
    // TEST 8: PATCH Resolve Thread
    // ----------------------------------------------------
    console.log("Test 8: Resolving thread by Editor...");
    const resolveRes = await fetch(
      `${baseUrl}/boards/${board._id}/comments/${rootCommentId}/resolve`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${editor.token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          isResolved: true,
          expectedVersion: 2,
        }),
      }
    );

    assert(resolveRes.status === 200, "Resolve succeeded with 200");
    const resolveJson = (await resolveRes.json()) as SingleCommentApiResponse;
    assert(resolveJson.data.isResolved === true, "isResolved is true");
    assert(resolveJson.data.resolvedBy === editor.user._id.toString(), "resolvedBy is editor");
    console.log("✓ Comment thread resolved via PATCH /boards/:boardId/comments/:commentId/resolve.");

    // ----------------------------------------------------
    // TEST 9: DELETE Soft Delete Comment
    // ----------------------------------------------------
    console.log("Test 9: Soft-deleting comment and verifying masked response...");
    const deleteRes = await fetch(
      `${baseUrl}/boards/${board._id}/comments/${replyId}`,
      {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${editor.token}`,
        },
      }
    );

    assert(deleteRes.status === 200, "Delete succeeded with 200");
    const deleteJson = (await deleteRes.json()) as SingleCommentApiResponse;
    assert(deleteJson.data.isDeleted === true, "isDeleted is true");
    assert(deleteJson.data.content === "", "Content masked to empty string");
    console.log("✓ Comment soft-deleted via DELETE /boards/:boardId/comments/:commentId.");

    console.log("\nAll Comment REST API Integration Tests Passed Successfully!");
  } finally {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    if (isDbConnected) {
      await CommentModel.deleteMany({ _id: { $in: commentIds } });
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

runCommentApiTests().catch((err) => {
  console.error("Comment API Test Failure:", err);
  process.exit(1);
});
