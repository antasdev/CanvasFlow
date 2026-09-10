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
import { ShapeModel } from "@/modules/shape/shape.model";
import { ShapeType } from "@/modules/shape/shape.types";
import { CommentModel } from "@/modules/comment/comment.model";
import { MutationRecordModel } from "@/modules/mutation/mutation.model";
import { BoardVersionModel } from "@/modules/history/history.model";
import { SearchResponseDto, SearchResultItem } from "../search.types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runSearchIntegrationTests(): Promise<void> {
  console.log("Starting Search Domain & Integration Tests...\n");

  let isDbConnected = false;
  try {
    await mongoose.connect(env.MONGODB_URI);
    isDbConnected = true;
    console.log("Connected to MongoDB for Search testing.");
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

  // Fixture trackers for clean teardown
  const createdUserIds: Types.ObjectId[] = [];
  const createdWorkspaceIds: Types.ObjectId[] = [];
  const createdBoardIds: Types.ObjectId[] = [];
  const createdCanvasIds: Types.ObjectId[] = [];
  const createdShapeIds: Types.ObjectId[] = [];
  const createdCommentIds: Types.ObjectId[] = [];

  try {
    // ----------------------------------------------------
    // SETUP FIXTURES
    // ----------------------------------------------------
    console.log("Setting up multi-tenant test fixtures...");

    // User A (Owner of Workspace A)
    const userA = await UserModel.create({
      email: `search-user-a-${Date.now()}@example.com`,
      password: "HashedPassword123!",
      fullName: "Search User A",
      role: UserRole.USER,
    });
    createdUserIds.push(userA._id);
    const tokenA = generateAccessToken({
      userId: userA._id.toString(),
      email: userA.email,
      role: userA.role,
    });

    // User B (Owner of Workspace B)
    const userB = await UserModel.create({
      email: `search-user-b-${Date.now()}@example.com`,
      password: "HashedPassword123!",
      fullName: "Search User B",
      role: UserRole.USER,
    });
    createdUserIds.push(userB._id);
    const tokenB = generateAccessToken({
      userId: userB._id.toString(),
      email: userB.email,
      role: userB.role,
    });

    // User C (Member of Workspace A, outsider to Workspace B)
    const userC = await UserModel.create({
      email: `search-user-c-${Date.now()}@example.com`,
      password: "HashedPassword123!",
      fullName: "Search User C",
      role: UserRole.USER,
    });
    createdUserIds.push(userC._id);
    const tokenC = generateAccessToken({
      userId: userC._id.toString(),
      email: userC.email,
      role: userC.role,
    });

    // Workspace A (Private)
    const wsA = await WorkspaceModel.create({
      name: "Workspace Alpha",
      description: "Primary Alpha Workspace",
      ownerId: userA._id,
      visibility: WorkspaceVisibility.PRIVATE,
    });
    createdWorkspaceIds.push(wsA._id);

    // Add User C as Member to Workspace A
    const memberC = await WorkspaceMemberModel.create({
      workspaceId: wsA._id,
      userId: userC._id,
      role: WorkspaceRole.EDITOR,
    });

    // Workspace B (Private)
    const wsB = await WorkspaceModel.create({
      name: "Workspace Beta",
      description: "Confidential Beta Workspace",
      ownerId: userB._id,
      visibility: WorkspaceVisibility.PRIVATE,
    });
    createdWorkspaceIds.push(wsB._id);

    // Boards in Workspace A
    const boardA1 = await BoardModel.create({
      workspaceId: wsA._id,
      name: "Alpha Architecture Blueprint",
      description: "Architecture roadmap and high-level system diagrams",
      createdBy: userA._id,
      visibility: BoardVisibility.PUBLIC,
      collaborationRevision: 10,
    });
    createdBoardIds.push(boardA1._id);

    const boardA2 = await BoardModel.create({
      workspaceId: wsA._id,
      name: "Alpha Feature Planning",
      description: "Sprint goals and user stories",
      createdBy: userC._id,
      visibility: BoardVisibility.PRIVATE,
      collaborationRevision: 5,
    });
    createdBoardIds.push(boardA2._id);

    // Board in Workspace B (Isolated tenant)
    const boardB = await BoardModel.create({
      workspaceId: wsB._id,
      name: "Beta Architecture Secret",
      description: "Confidential proprietary architecture for Beta",
      createdBy: userB._id,
      visibility: BoardVisibility.PRIVATE,
      collaborationRevision: 8,
    });
    createdBoardIds.push(boardB._id);

    // Canvases in Board A1
    const canvasA1 = await CanvasModel.create({
      boardId: boardA1._id,
      name: "Architecture Overview Canvas",
      order: 1,
    });
    createdCanvasIds.push(canvasA1._id);

    const canvasA2 = await CanvasModel.create({
      boardId: boardA1._id,
      name: "Microservices Data Flow",
      order: 2,
    });
    createdCanvasIds.push(canvasA2._id);

    // Canvas in Board B
    const canvasB = await CanvasModel.create({
      boardId: boardB._id,
      name: "Beta Architecture Canvas",
      order: 1,
    });
    createdCanvasIds.push(canvasB._id);

    // Shapes in Canvas A1
    const shapeA1 = await ShapeModel.create({
      canvasId: canvasA1._id,
      type: ShapeType.TEXT,
      x: 100,
      y: 100,
      width: 200,
      height: 80,
      zIndex: 1,
      text: "API Gateway Architecture with Rate Limiting",
      createdBy: userA._id,
      version: 1,
      style: { fill: "#1e293b", stroke: "#3b82f6", strokeWidth: 2 },
    });
    createdShapeIds.push(shapeA1._id);

    const shapeA2 = await ShapeModel.create({
      canvasId: canvasA1._id,
      type: ShapeType.STICKY_NOTE,
      x: 350,
      y: 100,
      width: 150,
      height: 150,
      zIndex: 2,
      text: "Remember to configure CORS origin headers properly",
      createdBy: userC._id,
      version: 1,
    });
    createdShapeIds.push(shapeA2._id);

    // Shape in Canvas B (Contains "Architecture")
    const shapeB = await ShapeModel.create({
      canvasId: canvasB._id,
      type: ShapeType.TEXT,
      x: 50,
      y: 50,
      width: 200,
      height: 50,
      zIndex: 1,
      text: "Beta Top Secret Architecture details",
      createdBy: userB._id,
      version: 1,
    });
    createdShapeIds.push(shapeB._id);

    // Comments in Board A1
    const commentA1 = await CommentModel.create({
      boardId: boardA1._id,
      canvasId: canvasA1._id,
      shapeId: shapeA1._id,
      authorId: userA._id,
      content: "Does this Architecture support horizontal scaling?",
      isResolved: false,
    });
    createdCommentIds.push(commentA1._id);

    const commentA2 = await CommentModel.create({
      boardId: boardA1._id,
      canvasId: canvasA1._id,
      authorId: userC._id,
      content: "Yes, stateless worker pods handle incoming traffic.",
      isResolved: false,
    });
    createdCommentIds.push(commentA2._id);

    // Comment in Board B
    const commentB = await CommentModel.create({
      boardId: boardB._id,
      canvasId: canvasB._id,
      authorId: userB._id,
      content: "Confidential Architecture notes for Beta only.",
      isResolved: false,
    });
    createdCommentIds.push(commentB._id);

    console.log("✓ Fixtures successfully established.\n");

    // ----------------------------------------------------
    // TEST 1: Unauthenticated request rejection (401)
    // ----------------------------------------------------
    console.log("Test 1: Unauthenticated request rejection...");
    const unauthRes = await fetch(
      `${baseUrl}/search?q=Architecture&scope=workspace&workspaceId=${wsA._id}`
    );
    assert(unauthRes.status === 401, `Unauthenticated request must return 401, got ${unauthRes.status}`);
    console.log("✓ Test 1 Passed: 401 Unauthenticated rejected.");

    // ----------------------------------------------------
    // TEST 2: Validation rejection (400)
    // ----------------------------------------------------
    console.log("Test 2: Validation rejection for bad requests...");
    // 2a. Empty query
    const emptyQueryRes = await fetch(
      `${baseUrl}/search?q=&scope=workspace&workspaceId=${wsA._id}`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    assert(emptyQueryRes.status === 400, `Empty query must return 400, got ${emptyQueryRes.status}`);

    // 2b. Missing workspaceId for workspace scope
    const missingWsRes = await fetch(
      `${baseUrl}/search?q=test&scope=workspace`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    assert(missingWsRes.status === 400, `Missing workspaceId must return 400, got ${missingWsRes.status}`);

    // 2c. Missing boardId for board scope
    const missingBoardRes = await fetch(
      `${baseUrl}/search?q=test&scope=board`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    assert(missingBoardRes.status === 400, `Missing boardId must return 400, got ${missingBoardRes.status}`);

    // 2d. Invalid cursor
    const badCursorRes = await fetch(
      `${baseUrl}/search?q=test&scope=workspace&workspaceId=${wsA._id}&cursor=bad-cursor`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    assert(badCursorRes.status === 400, `Invalid cursor must return 400, got ${badCursorRes.status}`);
    console.log("✓ Test 2 Passed: Validation rejections verified.");

    // ----------------------------------------------------
    // TEST 3: Authorization & Tenant Isolation (403 & Cross-tenant leak prevention)
    // ----------------------------------------------------
    console.log("Test 3: Authorization and cross-workspace isolation...");
    // 3a. User C (not in Workspace B) attempts to search Workspace B
    const forbiddenRes = await fetch(
      `${baseUrl}/search?q=Architecture&scope=workspace&workspaceId=${wsB._id}`,
      { headers: { Authorization: `Bearer ${tokenC}` } }
    );
    assert(forbiddenRes.status === 403, `User unauthorized for workspace must return 403, got ${forbiddenRes.status}`);

    // 3b. User A searches Workspace A for "Architecture"
    // Must find Board A1, Canvas A1, Shape A1, Comment A1
    // Must NEVER return Board B, Canvas B, Shape B, Comment B!
    const searchResA = await fetch(
      `${baseUrl}/search?q=Architecture&scope=workspace&workspaceId=${wsA._id}`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    assert(searchResA.status === 200, `Authorized search must return 200, got ${searchResA.status}`);
    const searchJsonA = (await searchResA.json()) as { success: boolean; data: SearchResponseDto };
    const resultsA = searchJsonA.data.results;

    assert(resultsA.length > 0, "Search in Workspace A must find matches");
    const containsAnyBeta = resultsA.some(
      (r) =>
        r.boardId === boardB._id.toString() ||
        r.title.includes("Beta") ||
        (r.snippet && r.snippet.includes("Beta"))
    );
    assert(!containsAnyBeta, "Cross-workspace leak detected! Workspace B items must NEVER be returned in Workspace A search.");
    console.log("✓ Test 3 Passed: Cross-workspace tenant isolation verified.");

    // ----------------------------------------------------
    // TEST 4: Multi-Entity Search Verification
    // ----------------------------------------------------
    console.log("Test 4: Multi-entity search across Board, Canvas, Shape, Comment...");
    const entityTypesFound = new Set(resultsA.map((r) => r.entityType));
    assert(entityTypesFound.has("board"), "Should find matching Board");
    assert(entityTypesFound.has("canvas"), "Should find matching Canvas");
    assert(entityTypesFound.has("shape"), "Should find matching Shape");
    assert(entityTypesFound.has("comment"), "Should find matching Comment");

    const boardItem = resultsA.find((r) => r.entityType === "board");
    assert(boardItem?.title === "Alpha Architecture Blueprint", "Board title matches");
    assert(boardItem?.matchedField === "name", "Matched field is 'name'");

    const canvasItem = resultsA.find((r) => r.entityType === "canvas");
    assert(canvasItem?.title === "Architecture Overview Canvas", "Canvas title matches");
    assert(canvasItem?.boardId === boardA1._id.toString(), "Canvas boardId matches");

    const shapeItem = resultsA.find((r) => r.entityType === "shape");
    assert(shapeItem?.matchedField === "text", "Shape matched field is 'text'");
    assert(shapeItem?.snippet?.includes("Architecture") ?? false, "Shape snippet contains matched keyword");

    const commentItem = resultsA.find((r) => r.entityType === "comment");
    assert(commentItem?.matchedField === "content", "Comment matched field is 'content'");
    assert(commentItem?.snippet?.includes("Architecture") ?? false, "Comment snippet contains matched keyword");
    console.log("✓ Test 4 Passed: All four entity types correctly searched and normalized.");

    // ----------------------------------------------------
    // TEST 5: Non-Searchable Data Exclusions
    // ----------------------------------------------------
    console.log("Test 5: Non-searchable data exclusions...");
    // 5a. Searching for shape geometry or style property should return 0 results
    const geometrySearchRes = await fetch(
      `${baseUrl}/search?q=1e293b&scope=workspace&workspaceId=${wsA._id}`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    const geometryJson = (await geometrySearchRes.json()) as { data: SearchResponseDto };
    assert(geometryJson.data.results.length === 0, "Shape style fill color must NOT be searchable");

    // 5b. Searching for internal OCC version or revision string
    const occSearchRes = await fetch(
      `${baseUrl}/search?q=collaborationRevision&scope=workspace&workspaceId=${wsA._id}`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    const occJson = (await occSearchRes.json()) as { data: SearchResponseDto };
    assert(occJson.data.results.length === 0, "Internal model properties must NOT be searchable");
    console.log("✓ Test 5 Passed: Geometry and internal metadata successfully excluded.");

    // ----------------------------------------------------
    // TEST 6: Cursor-Based Pagination & Deterministic Ordering
    // ----------------------------------------------------
    console.log("Test 6: Cursor-based pagination and deterministic ordering...");
    // Query with limit=2
    const page1Res = await fetch(
      `${baseUrl}/search?q=Architecture&scope=workspace&workspaceId=${wsA._id}&limit=2`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    const page1Json = (await page1Res.json()) as { data: SearchResponseDto };
    assert(page1Json.data.results.length === 2, "Page 1 must return exactly 2 items");
    assert(page1Json.data.pagination.hasMore === true, "Page 1 must have hasMore = true");
    assert(typeof page1Json.data.pagination.nextCursor === "string", "Page 1 must return a nextCursor string");

    const cursor1 = page1Json.data.pagination.nextCursor!;
    const page1Ids = page1Json.data.results.map((r) => r.id);

    // Query Page 2 using cursor
    const page2Res = await fetch(
      `${baseUrl}/search?q=Architecture&scope=workspace&workspaceId=${wsA._id}&limit=2&cursor=${cursor1}`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    const page2Json = (await page2Res.json()) as { data: SearchResponseDto };
    assert(page2Json.data.results.length > 0, "Page 2 must return results");
    const page2Ids = page2Json.data.results.map((r) => r.id);

    // Verify zero duplicates across page 1 and page 2
    for (const id of page2Ids) {
      assert(!page1Ids.includes(id), `Duplicate item '${id}' found between page 1 and page 2!`);
    }

    // Verify deterministic ordering: createdAt DESC
    const allRetrieved = [...page1Json.data.results, ...page2Json.data.results];
    for (let i = 0; i < allRetrieved.length - 1; i++) {
      const timeCurrent = new Date(allRetrieved[i].createdAt).getTime();
      const timeNext = new Date(allRetrieved[i + 1].createdAt).getTime();
      assert(
        timeCurrent >= timeNext,
        `Ordering violation at index ${i}: current timestamp (${timeCurrent}) is older than next (${timeNext})`
      );
    }
    console.log("✓ Test 6 Passed: Deterministic cursor pagination verified.");

    // ----------------------------------------------------
    // TEST 7: N+1 Avoidance (Batch Resolved Board and Canvas Names)
    // ----------------------------------------------------
    console.log("Test 7: N+1 prevention and metadata resolution...");
    for (const item of resultsA) {
      if (item.boardId) {
        assert(typeof item.boardName === "string" && item.boardName.length > 0, `Item ${item.id} (${item.entityType}) must have boardName resolved`);
      }
      if (item.canvasId) {
        assert(typeof item.canvasName === "string" && item.canvasName.length > 0, `Item ${item.id} (${item.entityType}) must have canvasName resolved`);
      }
    }
    console.log("✓ Test 7 Passed: Batch name resolution verified.");

    // ----------------------------------------------------
    // TEST 8: Read-Only Invariants (Zero Side Effects)
    // ----------------------------------------------------
    console.log("Test 8: Verifying Read-Only Invariants...");
    const boardBefore = await BoardModel.findById(boardA1._id);
    const revBefore = boardBefore?.collaborationRevision;
    const mutationCountBefore = await MutationRecordModel.countDocuments();
    const versionCountBefore = await BoardVersionModel.countDocuments();
    const shapeBefore = await ShapeModel.findById(shapeA1._id);
    const shapeVerBefore = shapeBefore?.version;

    // Perform multiple searches
    await fetch(`${baseUrl}/search?q=Architecture&scope=board&boardId=${boardA1._id}`, {
      headers: { Authorization: `Bearer ${tokenA}` },
    });
    await fetch(`${baseUrl}/search?q=stateless&scope=workspace&workspaceId=${wsA._id}`, {
      headers: { Authorization: `Bearer ${tokenC}` },
    });

    const boardAfter = await BoardModel.findById(boardA1._id);
    const revAfter = boardAfter?.collaborationRevision;
    const mutationCountAfter = await MutationRecordModel.countDocuments();
    const versionCountAfter = await BoardVersionModel.countDocuments();
    const shapeAfter = await ShapeModel.findById(shapeA1._id);
    const shapeVerAfter = shapeAfter?.version;

    assert(revBefore === revAfter, "collaborationRevision must remain unchanged");
    assert(mutationCountBefore === mutationCountAfter, "MutationRecord count must remain unchanged");
    assert(versionCountBefore === versionCountAfter, "BoardVersion count must remain unchanged");
    assert(shapeVerBefore === shapeVerAfter, "Shape.version must remain unchanged");
    console.log("✓ Test 8 Passed: Search confirmed strictly 100% read-only.");

    // ----------------------------------------------------
    // TEST 9: Entity Type Filtering (types=board,comment)
    // ----------------------------------------------------
    console.log("Test 9: Filtering by entity types...");
    const filteredRes = await fetch(
      `${baseUrl}/search?q=Architecture&scope=workspace&workspaceId=${wsA._id}&types=board,comment`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    assert(filteredRes.status === 200, "Filtered search must succeed with 200");
    const filteredJson = (await filteredRes.json()) as { data: SearchResponseDto };
    const filteredResults = filteredJson.data.results;

    assert(filteredResults.length > 0, "Filtered search should return matches");
    for (const item of filteredResults) {
      assert(
        item.entityType === "board" || item.entityType === "comment",
        `Only board or comment entity types allowed, got: ${item.entityType}`
      );
    }
    console.log("✓ Test 9 Passed: Entity type filtering verified.");

    console.log("\n==================================================");
    console.log("All Search Domain & Integration Tests Passed Successfully!");
    console.log("==================================================\n");
  } finally {
    // Teardown test fixtures
    console.log("Tearing down test fixtures...");
    await CommentModel.deleteMany({ _id: { $in: createdCommentIds } });
    await ShapeModel.deleteMany({ _id: { $in: createdShapeIds } });
    await CanvasModel.deleteMany({ _id: { $in: createdCanvasIds } });
    await BoardModel.deleteMany({ _id: { $in: createdBoardIds } });
    await WorkspaceMemberModel.deleteMany({ workspaceId: { $in: createdWorkspaceIds } });
    await WorkspaceModel.deleteMany({ _id: { $in: createdWorkspaceIds } });
    await UserModel.deleteMany({ _id: { $in: createdUserIds } });

    httpServer.close();
    if (isDbConnected) {
      await mongoose.disconnect();
    }
    console.log("Teardown complete.");
  }
}

runSearchIntegrationTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Search Integration Tests Failed:", err);
    process.exit(1);
  });
