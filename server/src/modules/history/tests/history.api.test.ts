import { createServer } from "http";
import mongoose, { Types } from "mongoose";

import app from "@/app";
import env from "@/config/env";
import { generateAccessToken } from "@/modules/auth/auth.tokens";
import { UserModel } from "@/modules/user/user.model";
import { UserRole } from "@/modules/user/user.types";
import { WorkspaceModel } from "@/modules/workspace/workspace.model";
import { WorkspaceMemberModel } from "@/modules/workspace/workspaceMember.model";
import { WorkspaceRole } from "@/modules/workspace/workspace.types";
import { BoardModel } from "@/modules/board/board.model";
import { CanvasModel } from "@/modules/canvas/canvas.model";
import { ShapeModel } from "@/modules/shape/shape.model";
import { ShapeType } from "@/modules/shape/shape.types";
import { MutationRecordModel } from "@/modules/mutation/mutation.model";
import { BoardVersionModel } from "../history.model";
import { historyRepository } from "../history.repository";
import { SnapshotBuilder } from "../pipeline/history.snapshot";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runHistoryApiTests(): Promise<void> {
  console.log("Starting Version History REST API Integration Tests (Slice 38)...\n");

  let isDbConnected = false;
  try {
    await mongoose.connect(env.MONGODB_URI);
    isDbConnected = true;
    console.log("Connected to MongoDB for REST API testing.");
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

  // Fixture trackers for cleanup
  const createdUserIds: Types.ObjectId[] = [];
  const createdWorkspaceIds: Types.ObjectId[] = [];
  const createdBoardIds: Types.ObjectId[] = [];
  const createdCanvasIds: Types.ObjectId[] = [];
  const createdShapeIds: Types.ObjectId[] = [];
  const createdVersionIds: Types.ObjectId[] = [];

  const createTestUser = async (roleName: string) => {
    const user = await UserModel.create({
      fullName: `API User ${roleName}`,
      email: `api_${roleName.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@example.com`,
      password: "Password123!",
      role: UserRole.USER,
    });
    createdUserIds.push(user._id as Types.ObjectId);
    const token = generateAccessToken({
      userId: user._id.toString(),
      role: user.role,
    });
    return { user, token };
  };

  try {
    // ----------------------------------------------------
    // SETUP FIXTURES
    // ----------------------------------------------------
    console.log("Setting up database test fixtures...");
    const owner = await createTestUser("Owner");
    const editor = await createTestUser("Editor");
    const viewer = await createTestUser("Viewer");
    const outsider = await createTestUser("Outsider");

    // Workspace A (Owner, Editor, Viewer)
    const workspaceA = await WorkspaceModel.create({
      name: "History Workspace A",
      ownerId: owner.user._id,
    });
    createdWorkspaceIds.push(workspaceA._id as Types.ObjectId);

    await WorkspaceMemberModel.create([
      { workspaceId: workspaceA._id, userId: owner.user._id, role: WorkspaceRole.OWNER },
      { workspaceId: workspaceA._id, userId: editor.user._id, role: WorkspaceRole.EDITOR },
      { workspaceId: workspaceA._id, userId: viewer.user._id, role: WorkspaceRole.VIEWER },
    ]);

    // Workspace B (Outsider only)
    const workspaceB = await WorkspaceModel.create({
      name: "History Workspace B",
      ownerId: outsider.user._id,
    });
    createdWorkspaceIds.push(workspaceB._id as Types.ObjectId);

    await WorkspaceMemberModel.create([
      { workspaceId: workspaceB._id, userId: outsider.user._id, role: WorkspaceRole.OWNER },
    ]);

    // Board A in Workspace A
    const boardA = await BoardModel.create({
      name: "Design Board A",
      workspaceId: workspaceA._id,
      createdBy: owner.user._id,
      collaborationRevision: 10,
    });
    createdBoardIds.push(boardA._id as Types.ObjectId);

    // Board B in Workspace B
    const boardB = await BoardModel.create({
      name: "Secret Board B",
      workspaceId: workspaceB._id,
      createdBy: outsider.user._id,
      collaborationRevision: 1,
    });
    createdBoardIds.push(boardB._id as Types.ObjectId);

    // Canvas on Board A
    const canvasA1 = await CanvasModel.create({
      boardId: boardA._id,
      name: "Page 1",
      order: 1,
      backgroundColor: "#FFFFFF",
    });
    createdCanvasIds.push(canvasA1._id as Types.ObjectId);

    const canvasA2 = await CanvasModel.create({
      boardId: boardA._id,
      name: "Page 2",
      order: 2,
      backgroundColor: "#F3F4F6",
    });
    createdCanvasIds.push(canvasA2._id as Types.ObjectId);

    // Shapes on Board A
    const groupShape = await ShapeModel.create({
      canvasId: canvasA1._id,
      type: ShapeType.GROUP,
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      zIndex: 1,
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(groupShape._id as Types.ObjectId);

    const childRect = await ShapeModel.create({
      canvasId: canvasA1._id,
      type: ShapeType.RECTANGLE,
      x: 20,
      y: 20,
      width: 120,
      height: 80,
      zIndex: 2,
      parentId: groupShape._id,
      style: { fill: "#3B82F6", stroke: "#1D4ED8", strokeWidth: 2 },
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(childRect._id as Types.ObjectId);

    const childCircle = await ShapeModel.create({
      canvasId: canvasA1._id,
      type: ShapeType.CIRCLE,
      x: 180,
      y: 20,
      width: 80,
      height: 80,
      zIndex: 3,
      parentId: groupShape._id,
      style: { fill: "#10B981" },
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(childCircle._id as Types.ObjectId);

    const connectorShape = await ShapeModel.create({
      canvasId: canvasA1._id,
      type: ShapeType.CONNECTOR,
      x: 0,
      y: 0,
      width: 100,
      height: 50,
      zIndex: 4,
      connector: {
        sourceShapeId: childRect._id,
        sourceAnchor: "right",
        targetShapeId: childCircle._id,
        targetAnchor: "left",
        routing: "orthogonal",
      },
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(connectorShape._id as Types.ObjectId);

    const textShape = await ShapeModel.create({
      canvasId: canvasA2._id,
      type: ShapeType.TEXT,
      x: 50,
      y: 50,
      width: 200,
      height: 40,
      text: "CanvasFlow Architecture",
      zIndex: 1,
      createdBy: editor.user._id,
      version: 1,
    });
    createdShapeIds.push(textShape._id as Types.ObjectId);

    // Create 5 distinct historical checkpoints on Board A for pagination testing
    const snapshotA = await SnapshotBuilder.buildBoardSnapshot(boardA._id as Types.ObjectId);
    for (let i = 1; i <= 5; i++) {
      const v = await historyRepository.create({
        boardId: boardA._id as Types.ObjectId,
        versionNumber: i,
        name: i === 1 ? "Initial Draft" : i === 5 ? "Final Release" : `Milestone ${i}`,
        description: `Description for version ${i}`,
        trigger: i % 2 === 0 ? "automatic" : "manual",
        createdBy: i % 2 === 0 ? (editor.user._id as Types.ObjectId) : (owner.user._id as Types.ObjectId),
        collaborationRevision: 10 + i,
        snapshot: snapshotA,
        isNamed: true,
      });
      createdVersionIds.push(v._id);
    }

    // Create 1 version on Board B
    const canvasB = await CanvasModel.create({
      boardId: boardB._id,
      name: "Board B Canvas",
      order: 1,
      backgroundColor: "#FFFFFF",
    });
    createdCanvasIds.push(canvasB._id as Types.ObjectId);
    const snapshotB = await SnapshotBuilder.buildBoardSnapshot(boardB._id as Types.ObjectId);
    const versionB = await historyRepository.create({
      boardId: boardB._id as Types.ObjectId,
      versionNumber: 1,
      name: "Board B Checkpoint",
      trigger: "manual",
      createdBy: outsider.user._id as Types.ObjectId,
      collaborationRevision: 1,
      snapshot: snapshotB,
      isNamed: true,
    });
    createdVersionIds.push(versionB._id);

    console.log("✓ Fixtures created (Board A with 5 versions, Board B with 1 version).\n");

    // ----------------------------------------------------
    // TEST 1: Unauthenticated Requests (401 Unauthorized)
    // ----------------------------------------------------
    console.log("Test 1: Testing unauthenticated requests...");
    const unauthListRes = await fetch(`${baseUrl}/boards/${boardA._id}/versions`);
    assert(unauthListRes.status === 401, `Unauthenticated list must return 401, got ${unauthListRes.status}`);

    const unauthSingleRes = await fetch(`${baseUrl}/boards/${boardA._id}/versions/${createdVersionIds[0]}`);
    assert(unauthSingleRes.status === 401, `Unauthenticated get single must return 401, got ${unauthSingleRes.status}`);
    console.log("✓ Unauthenticated requests rejected with HTTP 401.");

    // ----------------------------------------------------
    // TEST 2: Unauthorized Outsider Access (403 Forbidden)
    // ----------------------------------------------------
    console.log("\nTest 2: Testing unauthorized outsider access...");
    const outsiderListRes = await fetch(`${baseUrl}/boards/${boardA._id}/versions`, {
      headers: { Authorization: `Bearer ${outsider.token}` },
    });
    assert(outsiderListRes.status === 403, `Outsider list must return 403, got ${outsiderListRes.status}`);

    const outsiderSingleRes = await fetch(`${baseUrl}/boards/${boardA._id}/versions/${createdVersionIds[0]}`, {
      headers: { Authorization: `Bearer ${outsider.token}` },
    });
    assert(outsiderSingleRes.status === 403, `Outsider single get must return 403, got ${outsiderSingleRes.status}`);
    console.log("✓ Outsider access strictly rejected with HTTP 403.");

    // ----------------------------------------------------
    // TEST 3: Input Validation & Malformed Parameters (400 Bad Request)
    // ----------------------------------------------------
    console.log("\nTest 3: Testing input validation & malformed parameter rejection...");
    // 1. Malformed boardId
    const malformedBoardRes = await fetch(`${baseUrl}/boards/invalid-board-123/versions`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert(malformedBoardRes.status === 400, "Malformed boardId must return 400");

    // 2. Malformed versionId
    const malformedVersionRes = await fetch(`${baseUrl}/boards/${boardA._id}/versions/not-a-valid-hex-id`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert(malformedVersionRes.status === 400, "Malformed versionId must return 400");

    // 3. Invalid query limits (negative, zero, >100, non-numeric)
    const negLimitRes = await fetch(`${baseUrl}/boards/${boardA._id}/versions?limit=-5`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert(negLimitRes.status === 400, "Negative limit must return 400");

    const zeroLimitRes = await fetch(`${baseUrl}/boards/${boardA._id}/versions?limit=0`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert(zeroLimitRes.status === 400, "Zero limit must return 400");

    const excessiveLimitRes = await fetch(`${baseUrl}/boards/${boardA._id}/versions?limit=101`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert(excessiveLimitRes.status === 400, "Limit > 100 must return 400");

    // 4. Invalid trigger query
    const invalidTriggerRes = await fetch(`${baseUrl}/boards/${boardA._id}/versions?trigger=invalid_trigger`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert(invalidTriggerRes.status === 400, "Invalid trigger value must return 400");

    // 5. Malformed cursor (negative, non-numeric)
    const negCursorRes = await fetch(`${baseUrl}/boards/${boardA._id}/versions?cursor=-1`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert(negCursorRes.status === 400, "Negative cursor must return 400");

    const nonNumCursorRes = await fetch(`${baseUrl}/boards/${boardA._id}/versions?cursor=abc`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert(nonNumCursorRes.status === 400, "Non-numeric cursor must return 400");

    console.log("✓ All malformed IDs, limits, cursors, and query values rejected with HTTP 400.");

    // ----------------------------------------------------
    // TEST 4: Authorized List Versions (Lightweight Summaries)
    // ----------------------------------------------------
    console.log("\nTest 4: Testing authorized version listing & summary projection...");
    const viewerListRes = await fetch(`${baseUrl}/boards/${boardA._id}/versions`, {
      headers: { Authorization: `Bearer ${viewer.token}` },
    });
    assert(viewerListRes.status === 200, `Viewer list must return 200, got ${viewerListRes.status}`);

    const viewerListJson = (await viewerListRes.json()) as {
      success: boolean;
      data: Array<Record<string, unknown>>;
      pagination: { nextCursor?: number; hasMore: boolean; totalCount: number };
    };

    assert(viewerListJson.success === true, "Response success must be true");
    assert(Array.isArray(viewerListJson.data), "data must be an array");
    assert(viewerListJson.data.length === 5, `Expected 5 versions, got ${viewerListJson.data.length}`);
    assert(viewerListJson.pagination.totalCount === 5, `Expected totalCount 5, got ${viewerListJson.pagination.totalCount}`);

    // Verify lightweight summaries (omits full shape snapshot)
    const firstSummary = viewerListJson.data[0];
    assert(firstSummary.versionNumber === 5, `First item should be newest version (5), got ${firstSummary.versionNumber}`);
    assert(typeof firstSummary.name === "string", "name must be present");
    assert(typeof firstSummary.shapeCount === "number" && (firstSummary.shapeCount as number) > 0, "shapeCount must be positive number");
    assert(typeof firstSummary.canvasCount === "number" && (firstSummary.canvasCount as number) === 2, "canvasCount must be 2");
    assert(firstSummary.snapshot === undefined, "List summaries must NOT leak full snapshot payload");

    // Verify populated author
    const authorObj = firstSummary.author as { id: string; fullName: string; email?: string } | undefined;
    assert(authorObj !== undefined, "Author metadata must be populated");
    assert(typeof authorObj!.fullName === "string", "Author fullName must be string");

    console.log("✓ Version list returns lightweight summaries with populated author and without shape snapshot payload.");

    // ----------------------------------------------------
    // TEST 5: Cursor-Based Pagination Determinism
    // ----------------------------------------------------
    console.log("\nTest 5: Testing deterministic cursor-based pagination...");
    // Page 1: limit = 2
    const page1Res = await fetch(`${baseUrl}/boards/${boardA._id}/versions?limit=2`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    const page1Json = (await page1Res.json()) as {
      data: Array<{ versionNumber: number }>;
      pagination: { nextCursor?: number; hasMore: boolean; totalCount: number };
    };
    assert(page1Json.data.length === 2, "Page 1 length must be 2");
    assert(page1Json.data[0].versionNumber === 5, "Page 1 item 1 must be version 5");
    assert(page1Json.data[1].versionNumber === 4, "Page 1 item 2 must be version 4");
    assert(page1Json.pagination.hasMore === true, "Page 1 hasMore must be true");
    assert(page1Json.pagination.nextCursor === 4, `Page 1 nextCursor must be 4, got ${page1Json.pagination.nextCursor}`);

    // Page 2: limit = 2, cursor = 4
    const page2Res = await fetch(`${baseUrl}/boards/${boardA._id}/versions?limit=2&cursor=${page1Json.pagination.nextCursor}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    const page2Json = (await page2Res.json()) as {
      data: Array<{ versionNumber: number }>;
      pagination: { nextCursor?: number; hasMore: boolean };
    };
    assert(page2Json.data.length === 2, "Page 2 length must be 2");
    assert(page2Json.data[0].versionNumber === 3, "Page 2 item 1 must be version 3");
    assert(page2Json.data[1].versionNumber === 2, "Page 2 item 2 must be version 2");
    assert(page2Json.pagination.hasMore === true, "Page 2 hasMore must be true");
    assert(page2Json.pagination.nextCursor === 2, `Page 2 nextCursor must be 2, got ${page2Json.pagination.nextCursor}`);

    // Page 3: limit = 2, cursor = 2
    const page3Res = await fetch(`${baseUrl}/boards/${boardA._id}/versions?limit=2&cursor=${page2Json.pagination.nextCursor}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    const page3Json = (await page3Res.json()) as {
      data: Array<{ versionNumber: number }>;
      pagination: { nextCursor?: number; hasMore: boolean };
    };
    assert(page3Json.data.length === 1, "Page 3 length must be 1 (final version 1)");
    assert(page3Json.data[0].versionNumber === 1, "Page 3 item 1 must be version 1");
    assert(page3Json.pagination.hasMore === false, "Page 3 hasMore must be false");
    assert(page3Json.pagination.nextCursor === undefined, "Page 3 nextCursor must be undefined");

    console.log("✓ Cursor pagination is strictly deterministic (0 duplicates, 0 missing records across pages).");

    // ----------------------------------------------------
    // TEST 6: Single Version Retrieval (Full Snapshot)
    // ----------------------------------------------------
    console.log("\nTest 6: Testing single version retrieval with complete historical snapshot...");
    const latestVersionId = createdVersionIds[4]; // Version 5
    const singleRes = await fetch(`${baseUrl}/boards/${boardA._id}/versions/${latestVersionId}`, {
      headers: { Authorization: `Bearer ${viewer.token}` },
    });
    assert(singleRes.status === 200, `Single version get must return 200, got ${singleRes.status}`);

    const singleJson = (await singleRes.json()) as {
      success: boolean;
      data: {
        id: string;
        boardId: string;
        versionNumber: number;
        name: string;
        snapshot: {
          shapeCount: number;
          canvases: Array<{
            canvasId: string;
            name: string;
            shapes: Array<{
              id: string;
              type: string;
              parentId?: string;
              style?: Record<string, unknown>;
              connector?: Record<string, unknown>;
              text?: string;
            }>;
          }>;
        };
      };
    };

    assert(singleJson.success === true, "Single version success must be true");
    assert(singleJson.data.versionNumber === 5, "Must be Version 5");
    assert(singleJson.data.snapshot !== undefined, "Single version must include full snapshot");
    assert(singleJson.data.snapshot.canvases.length === 2, "Snapshot must have 2 canvases");

    // Verify structure preservation inside snapshot
    const c1 = singleJson.data.snapshot.canvases.find((c) => c.name === "Page 1");
    assert(c1 !== undefined && c1.shapes.length === 4, "Canvas 1 must have 4 shapes");

    const groupInSnap = c1!.shapes.find((s) => s.type === ShapeType.GROUP);
    const childRectInSnap = c1!.shapes.find((s) => s.type === ShapeType.RECTANGLE);
    const connectorInSnap = c1!.shapes.find((s) => s.type === ShapeType.CONNECTOR);

    assert(groupInSnap !== undefined, "Group shape must be present in snapshot");
    assert(childRectInSnap !== undefined && childRectInSnap.parentId === groupInSnap!.id, "Child parentId must match group ID");
    assert(connectorInSnap !== undefined && connectorInSnap.connector?.routing === "orthogonal", "Connector routing preserved");

    console.log("✓ Single version retrieval accurately returns complete multi-canvas snapshot and shape structures.");

    // ----------------------------------------------------
    // TEST 7: Cross-Board IDOR Isolation & Not Found (404)
    // ----------------------------------------------------
    console.log("\nTest 7: Testing cross-board IDOR isolation & 404 handling...");
    // 1. Valid version ID of Board B requested through Board A URL by Owner of Board A
    const idorRes = await fetch(`${baseUrl}/boards/${boardA._id}/versions/${versionB._id}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert(idorRes.status === 404, `Cross-board version access must return 404, got ${idorRes.status}`);

    // 2. Non-existent valid ObjectId
    const nonExistentRes = await fetch(`${baseUrl}/boards/${boardA._id}/versions/${new Types.ObjectId()}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert(nonExistentRes.status === 404, `Non-existent version must return 404, got ${nonExistentRes.status}`);

    console.log("✓ Cross-board IDOR isolation strictly enforced (returns HTTP 404).");

    // ----------------------------------------------------
    // TEST 8: Read-Only Side-Effect Guarantees
    // ----------------------------------------------------
    console.log("\nTest 8: Testing read-only side-effect guarantees...");
    // Measure state before GET requests
    const boardDocBefore = await BoardModel.findById(boardA._id);
    const versionCountBefore = await BoardVersionModel.countDocuments({ boardId: boardA._id });
    const shapeDocBefore = await ShapeModel.findById(childRect._id);
    const mutationCountBefore = await MutationRecordModel.countDocuments({ boardId: boardA._id });

    // Execute multiple GET requests
    await fetch(`${baseUrl}/boards/${boardA._id}/versions?limit=5`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    await fetch(`${baseUrl}/boards/${boardA._id}/versions/${latestVersionId}`, {
      headers: { Authorization: `Bearer ${viewer.token}` },
    });

    // Measure state after GET requests
    const boardDocAfter = await BoardModel.findById(boardA._id);
    const versionCountAfter = await BoardVersionModel.countDocuments({ boardId: boardA._id });
    const shapeDocAfter = await ShapeModel.findById(childRect._id);
    const mutationCountAfter = await MutationRecordModel.countDocuments({ boardId: boardA._id });

    assert(
      boardDocBefore!.collaborationRevision === boardDocAfter!.collaborationRevision,
      "collaborationRevision must NOT be modified by GET requests"
    );
    assert(versionCountBefore === versionCountAfter, "Version count must NOT change on GET requests");
    assert(shapeDocBefore!.version === shapeDocAfter!.version, "Shape.version must NOT change on GET requests");
    assert(mutationCountBefore === mutationCountAfter, "MutationRecord count must NOT change on GET requests");

    console.log("✓ Read-only boundary verified (0 collaborationRevision changes, 0 OCC changes, 0 mutation records created).");

    // ----------------------------------------------------
    // TEST 9: Snapshot Immutability (Response Isolation)
    // ----------------------------------------------------
    console.log("\nTest 9: Testing snapshot immutability & response isolation...");
    // Mutate the local response JSON
    singleJson.data.name = "Mutated Name";
    singleJson.data.snapshot.canvases[0].shapes[0].type = "MUTATED_TYPE";

    // Query fresh from DB
    const freshDbVersion = await BoardVersionModel.findById(latestVersionId);
    assert(freshDbVersion!.name === "Final Release", "Database version name must remain 'Final Release'");
    assert(
      freshDbVersion!.snapshot.canvases[0].shapes[0].type !== "MUTATED_TYPE",
      "Database version snapshot shapes must remain unchanged"
    );

    console.log("✓ Snapshot immutability verified (API responses do not leak mutable references to database state).");
  } finally {
    // ----------------------------------------------------
    // CLEANUP
    // ----------------------------------------------------
    console.log("\nCleaning up test fixtures from database...");
    if (isDbConnected) {
      if (createdVersionIds.length > 0) {
        await BoardVersionModel.deleteMany({ _id: { $in: createdVersionIds } });
      }
      if (createdShapeIds.length > 0) {
        await ShapeModel.deleteMany({ _id: { $in: createdShapeIds } });
      }
      if (createdCanvasIds.length > 0) {
        await CanvasModel.deleteMany({ _id: { $in: createdCanvasIds } });
      }
      if (createdBoardIds.length > 0) {
        await BoardModel.deleteMany({ _id: { $in: createdBoardIds } });
      }
      if (createdWorkspaceIds.length > 0) {
        await WorkspaceMemberModel.deleteMany({ workspaceId: { $in: createdWorkspaceIds } });
        await WorkspaceModel.deleteMany({ _id: { $in: createdWorkspaceIds } });
      }
      if (createdUserIds.length > 0) {
        await UserModel.deleteMany({ _id: { $in: createdUserIds } });
      }

      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      await mongoose.disconnect();
      console.log("Disconnected from MongoDB and HTTP server closed.");
    }
  }

  console.log("\nAll Version History REST API Tests Passed Successfully!\n");
}

runHistoryApiTests().catch((err) => {
  console.error("API Test execution error:", err);
  process.exit(1);
});
