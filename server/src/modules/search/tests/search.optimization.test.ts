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
import { boardRepository } from "@/modules/board/board.repository";
import { searchRepository } from "../search.repository";
import {
  encodeCursor,
  encodeV2Cursor,
  decodeCursor,
  escapeRegex,
} from "../search.validation";
import {
  CompositeCursorPayload,
  SearchResponseDto,
  SearchResultItem,
  ENTITY_TYPE_PRIORITY,
} from "../search.types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runOptimizationTests(): Promise<void> {
  console.log("==========================================================");
  console.log("Starting Slice 44: Search API & Query Optimization Suite");
  console.log("==========================================================\n");

  let isDbConnected = false;
  try {
    await mongoose.connect(env.MONGODB_URI);
    isDbConnected = true;
    console.log("Connected to MongoDB for Search Optimization testing.");
  } catch (err) {
    console.warn("MongoDB connection unavailable, skipping suite:", err);
    return;
  }

  const httpServer = createServer(app);
  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve());
  });

  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://localhost:${port}/api/v1`;

  // Fixture tracking for clean teardown
  const createdUserIds: Types.ObjectId[] = [];
  const createdWorkspaceIds: Types.ObjectId[] = [];
  const createdBoardIds: Types.ObjectId[] = [];
  const createdCanvasIds: Types.ObjectId[] = [];
  const createdShapeIds: Types.ObjectId[] = [];
  const createdCommentIds: Types.ObjectId[] = [];

  try {
    // ----------------------------------------------------
    // 1. CURSOR UNIT & COMPATIBILITY SUITE
    // ----------------------------------------------------
    console.log("Suite 1: V2 Composite Cursor & V1 Compatibility Testing...");

    // 1a. Encode/Decode V2
    const v2Payload: CompositeCursorPayload = {
      v: 2,
      b: { t: 1789095000000, id: "607f1f77bcf86cd799439001" },
      c: { t: 1789095000000, id: "607f1f77bcf86cd799439002" },
      s: { t: 1789094000000, id: "607f1f77bcf86cd799439003" },
      m: { t: 1789093000000, id: "607f1f77bcf86cd799439004" },
    };
    const encodedV2 = encodeV2Cursor(v2Payload);
    const decodedV2 = decodeCursor(encodedV2);
    assert(decodedV2 !== null, "Decoded V2 cursor must not be null");
    assert(decodedV2?.version === 2, "Decoded cursor version must be 2");
    assert(decodedV2?.v2?.b?.id === "607f1f77bcf86cd799439001", "V2 Board ID matches");
    assert(decodedV2?.v2?.c?.id === "607f1f77bcf86cd799439002", "V2 Canvas ID matches");
    assert(decodedV2?.v2?.s?.id === "607f1f77bcf86cd799439003", "V2 Shape ID matches");
    assert(decodedV2?.v2?.m?.id === "607f1f77bcf86cd799439004", "V2 Comment ID matches");

    // 1b. Legacy V1 Detection
    const v1Encoded = encodeCursor(new Date(1789095000000), "607f1f77bcf86cd799439001");
    const decodedV1 = decodeCursor(v1Encoded);
    assert(decodedV1 !== null, "Decoded V1 cursor must not be null");
    assert(decodedV1?.version === 1, "Decoded cursor version must be 1");
    assert(decodedV1?.v1?.timestamp === 1789095000000, "V1 timestamp matches");
    assert(decodedV1?.v1?.id === "607f1f77bcf86cd799439001", "V1 ID matches");

    // 1c. Invalid ObjectIds and timestamps rejected
    assert(decodeCursor(Buffer.from(JSON.stringify({ v: 2, b: { t: -50, id: "607f1f77bcf86cd799439001" } })).toString("base64url")) === null, "Negative timestamp rejected");
    assert(decodeCursor(Buffer.from(JSON.stringify({ v: 2, b: { t: 1000, id: "invalid-hex" } })).toString("base64url")) === null, "Non-hex ObjectId rejected");
    assert(decodeCursor(Buffer.from(JSON.stringify({ v: 2, b: { t: 1000, id: "607f1f77bcf86cd79943900" } })).toString("base64url")) === null, "Short ObjectId rejected");
    assert(decodeCursor(Buffer.from(JSON.stringify({ v: 2, unknown: { t: 1000, id: "607f1f77bcf86cd799439001" } })).toString("base64url")) === null, "Unknown entity key rejected");
    assert(decodeCursor(Buffer.from(JSON.stringify({ v: 2 })).toString("base64url")) === null, "Empty V2 entity payload rejected");
    console.log("✓ Suite 1 Passed: Cursor encode, decode, validation, and V1 detection verified.\n");

    // ----------------------------------------------------
    // SETUP MULTI-TENANT TEST DATA
    // ----------------------------------------------------
    console.log("Setting up multi-entity test dataset...");

    // User A (Owner)
    const userA = await UserModel.create({
      email: `opt-user-a-${Date.now()}@example.com`,
      password: "HashedPassword123!",
      fullName: "Optimization User A",
      role: UserRole.USER,
    });
    createdUserIds.push(userA._id);
    const tokenA = generateAccessToken({
      userId: userA._id.toString(),
      role: userA.role,
    });

    // Workspace
    const ws = await WorkspaceModel.create({
      name: "Optimization Workspace",
      description: "Workspace for query optimization",
      ownerId: userA._id,
      visibility: WorkspaceVisibility.PRIVATE,
    });
    createdWorkspaceIds.push(ws._id);

    // Identical timestamp anchor for cross-collection pagination tests
    const identicalTimestamp = new Date("2026-09-11T12:00:00.000Z");

    // Create 3 Boards with IDENTICAL timestamp
    const board1 = await BoardModel.create({
      workspaceId: ws._id,
      name: "Opt Benchmark Board 1",
      description: "Benchmark test board 1",
      createdBy: userA._id,
      visibility: BoardVisibility.PUBLIC,
      createdAt: identicalTimestamp,
      updatedAt: identicalTimestamp,
    });
    createdBoardIds.push(board1._id);

    const board2 = await BoardModel.create({
      workspaceId: ws._id,
      name: "Opt Benchmark Board 2",
      description: "Benchmark test board 2",
      createdBy: userA._id,
      visibility: BoardVisibility.PUBLIC,
      createdAt: identicalTimestamp,
      updatedAt: identicalTimestamp,
    });
    createdBoardIds.push(board2._id);

    const board3 = await BoardModel.create({
      workspaceId: ws._id,
      name: "Opt Benchmark Board 3",
      description: "Benchmark test board 3",
      createdBy: userA._id,
      visibility: BoardVisibility.PUBLIC,
      createdAt: identicalTimestamp,
      updatedAt: identicalTimestamp,
    });
    createdBoardIds.push(board3._id);

    // Create 3 Canvases with IDENTICAL timestamp
    const canvas1 = await CanvasModel.create({
      boardId: board1._id,
      name: "Opt Benchmark Canvas 1",
      order: 1,
      createdAt: identicalTimestamp,
      updatedAt: identicalTimestamp,
    });
    createdCanvasIds.push(canvas1._id);

    const canvas2 = await CanvasModel.create({
      boardId: board1._id,
      name: "Opt Benchmark Canvas 2",
      order: 2,
      createdAt: identicalTimestamp,
      updatedAt: identicalTimestamp,
    });
    createdCanvasIds.push(canvas2._id);

    const canvas3 = await CanvasModel.create({
      boardId: board1._id,
      name: "Opt Benchmark Canvas 3",
      order: 3,
      createdAt: identicalTimestamp,
      updatedAt: identicalTimestamp,
    });
    createdCanvasIds.push(canvas3._id);

    // Create 3 Shapes with IDENTICAL timestamp
    const shape1 = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.TEXT,
      x: 10, y: 10, width: 100, height: 50, zIndex: 1,
      text: "Opt Benchmark Shape 1 Note",
      createdBy: userA._id,
      style: { fill: "#ffffff", stroke: "#000000" },
      points: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      createdAt: identicalTimestamp,
      updatedAt: identicalTimestamp,
    });
    createdShapeIds.push(shape1._id);

    const shape2 = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.STICKY_NOTE,
      x: 20, y: 20, width: 100, height: 100, zIndex: 2,
      text: "Opt Benchmark Shape 2 Note",
      createdBy: userA._id,
      style: { fill: "#ffff00" },
      points: [11, 12, 13, 14],
      createdAt: identicalTimestamp,
      updatedAt: identicalTimestamp,
    });
    createdShapeIds.push(shape2._id);

    const shape3 = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.TEXT,
      x: 30, y: 30, width: 100, height: 50, zIndex: 3,
      text: "Opt Benchmark Shape 3 Note",
      createdBy: userA._id,
      style: { fill: "#000000" },
      points: [15, 16],
      createdAt: identicalTimestamp,
      updatedAt: identicalTimestamp,
    });
    createdShapeIds.push(shape3._id);

    // Create 3 Comments with IDENTICAL timestamp
    const comment1 = await CommentModel.create({
      boardId: board1._id,
      canvasId: canvas1._id,
      authorId: userA._id,
      content: "Opt Benchmark Comment 1 Discussion",
      createdAt: identicalTimestamp,
      updatedAt: identicalTimestamp,
    });
    createdCommentIds.push(comment1._id);

    const comment2 = await CommentModel.create({
      boardId: board1._id,
      canvasId: canvas1._id,
      authorId: userA._id,
      content: "Opt Benchmark Comment 2 Discussion",
      createdAt: identicalTimestamp,
      updatedAt: identicalTimestamp,
    });
    createdCommentIds.push(comment2._id);

    const comment3 = await CommentModel.create({
      boardId: board1._id,
      canvasId: canvas1._id,
      authorId: userA._id,
      content: "Opt Benchmark Comment 3 Discussion",
      createdAt: identicalTimestamp,
      updatedAt: identicalTimestamp,
    });
    createdCommentIds.push(comment3._id);

    console.log("✓ Fixture setup complete. 12 matching items across 4 collections sharing IDENTICAL timestamp.\n");

    // ----------------------------------------------------
    // 2. IDENTICAL TIMESTAMP CROSS-COLLECTION PAGINATION
    // ----------------------------------------------------
    console.log("Suite 2: Identical Timestamp Cross-Collection Pagination...");

    // Total expected matching items = 3 boards + 3 canvases + 3 shapes + 3 comments = 12 items.
    const allExpectedIds = [
      board1._id.toString(), board2._id.toString(), board3._id.toString(),
      canvas1._id.toString(), canvas2._id.toString(), canvas3._id.toString(),
      shape1._id.toString(), shape2._id.toString(), shape3._id.toString(),
      comment1._id.toString(), comment2._id.toString(), comment3._id.toString(),
    ];

    // Paginate with limit = 2 across all 12 items
    console.log("Testing pagination with limit = 2...");
    const collectedResultsLimit2: SearchResultItem[] = [];
    let currentCursor: string | null = null;
    let pageCount = 0;
    const maxPages = 20;

    while (pageCount < maxPages) {
      pageCount++;
      const cursorParam = currentCursor ? `&cursor=${encodeURIComponent(currentCursor)}` : "";
      const res = await fetch(
        `${baseUrl}/search?q=Benchmark&scope=workspace&workspaceId=${ws._id}&limit=2${cursorParam}`,
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );
      assert(res.status === 200, `Search request failed with status ${res.status}`);
      const data = (await res.json()) as { success: boolean; data: SearchResponseDto };
      const pageResults = data.data.results;
      const pagination = data.data.pagination;

      collectedResultsLimit2.push(...pageResults);

      if (!pagination.hasMore) {
        assert(pagination.nextCursor === null, "nextCursor must be null when hasMore is false");
        break;
      }
      assert(typeof pagination.nextCursor === "string" && pagination.nextCursor.length > 0, "nextCursor must be non-empty string when hasMore is true");
      currentCursor = pagination.nextCursor;
    }

    assert(collectedResultsLimit2.length === 12, `Must retrieve all 12 items, got ${collectedResultsLimit2.length}`);

    // Verify zero duplicates
    const seenIds = new Set<string>();
    for (const item of collectedResultsLimit2) {
      assert(!seenIds.has(item.id), `Duplicate item detected: ${item.id} (${item.entityType})`);
      seenIds.add(item.id);
    }

    // Verify zero dropped items
    for (const id of allExpectedIds) {
      assert(seenIds.has(id), `Missing expected item: ${id}`);
    }

    // Verify deterministic global order:
    // With identical timestamps: Board (1) -> Canvas (2) -> Shape (3) -> Comment (4)
    // Within same entity: _id DESC
    for (let i = 0; i < collectedResultsLimit2.length - 1; i++) {
      const a = collectedResultsLimit2[i];
      const b = collectedResultsLimit2[i + 1];
      const prioA = ENTITY_TYPE_PRIORITY[a.entityType];
      const prioB = ENTITY_TYPE_PRIORITY[b.entityType];

      if (prioA !== prioB) {
        assert(prioA < prioB, `Entity priority violated at index ${i}: ${a.entityType} (${prioA}) appeared after ${b.entityType} (${prioB})`);
      } else {
        assert(b.id.localeCompare(a.id) < 0, `Intra-entity ID ordering violated at index ${i}: ${a.id} vs ${b.id}`);
      }
    }
    console.log("✓ Limit = 2 pagination verified: 12/12 items retrieved, 0 duplicates, 0 dropped items, strict deterministic ordering.");

    // Paginate with limit = 1 across all 12 items
    console.log("Testing pagination with limit = 1 (single-item page steps)...");
    const collectedResultsLimit1: SearchResultItem[] = [];
    currentCursor = null;
    pageCount = 0;

    while (pageCount < maxPages) {
      pageCount++;
      const cursorParam = currentCursor ? `&cursor=${encodeURIComponent(currentCursor)}` : "";
      const res = await fetch(
        `${baseUrl}/search?q=Benchmark&scope=workspace&workspaceId=${ws._id}&limit=1${cursorParam}`,
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );
      assert(res.status === 200, `Search request failed with status ${res.status}`);
      const data = (await res.json()) as { success: boolean; data: SearchResponseDto };
      collectedResultsLimit1.push(...data.data.results);

      if (!data.data.pagination.hasMore) {
        break;
      }
      currentCursor = data.data.pagination.nextCursor;
    }

    assert(collectedResultsLimit1.length === 12, `Limit=1 must retrieve all 12 items, got ${collectedResultsLimit1.length}`);
    const seenLimit1 = new Set(collectedResultsLimit1.map((r) => r.id));
    assert(seenLimit1.size === 12, "Limit=1 must have 0 duplicates across 12 pages");
    console.log("✓ Limit = 1 pagination verified: 12 single-item pages, 0 duplicates, 0 dropped items.\n");

    // ----------------------------------------------------
    // 3. UNEQUAL COLLECTION PROGRESS & EXHAUSTION
    // ----------------------------------------------------
    console.log("Suite 3: Unequal Collection Progress & Single-Entity Searches...");

    // Search single entity type: boards only
    const boardsOnlyRes = await fetch(
      `${baseUrl}/search?q=Benchmark&scope=workspace&workspaceId=${ws._id}&types=board&limit=2`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    const boardsOnlyData = (await boardsOnlyRes.json()) as { data: SearchResponseDto };
    assert(boardsOnlyData.data.results.length === 2, "Page 1 of boards-only must return 2 items");
    assert(boardsOnlyData.data.results.every((r) => r.entityType === "board"), "All returned items must be boards");
    assert(boardsOnlyData.data.pagination.hasMore === true, "Must have hasMore = true");

    const boardCursor = boardsOnlyData.data.pagination.nextCursor!;
    const boardsPage2Res = await fetch(
      `${baseUrl}/search?q=Benchmark&scope=workspace&workspaceId=${ws._id}&types=board&limit=2&cursor=${encodeURIComponent(boardCursor)}`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    const boardsPage2Data = (await boardsPage2Res.json()) as { data: SearchResponseDto };
    assert(boardsPage2Data.data.results.length === 1, "Page 2 of boards-only must return the 3rd board");
    assert(boardsPage2Data.data.pagination.hasMore === false, "Boards exhausted, hasMore must be false");
    assert(boardsPage2Data.data.pagination.nextCursor === null, "nextCursor must be null when exhausted");
    console.log("✓ Suite 3 Passed: Single-entity pagination and exhaustion verified.\n");

    // ----------------------------------------------------
    // 4. AUTHORIZATION OPTIMIZATION VERIFICATION
    // ----------------------------------------------------
    console.log("Suite 4: Authorization Query Optimization Verification...");

    // Measure findBoardAuthSummaries lightweight projection
    const authSummaries = await boardRepository.findBoardAuthSummaries(ws._id);
    assert(authSummaries.length >= 3, "Auth summaries must return all workspace boards");
    for (const summary of authSummaries) {
      assert(summary._id !== undefined, "Summary has _id");
      assert(summary.visibility !== undefined, "Summary has visibility");
      assert(summary.createdBy !== undefined, "Summary has createdBy");
      // Verify lean object without unprojected fields
      assert(!("name" in summary), "Lean auth summary must NOT load name");
      assert(!("description" in summary), "Lean auth summary must NOT load description");
      assert(!("collaborationRevision" in summary), "Lean auth summary must NOT load collaborationRevision");
    }
    console.log("✓ Suite 4 Passed: findBoardAuthSummaries loads only required authorization fields (_id, visibility, createdBy).\n");

    // ----------------------------------------------------
    // 5. PROJECTION EFFICIENCY (Shapes, Comments, Canvases, Boards)
    // ----------------------------------------------------
    console.log("Suite 5: Projection Efficiency & Information Hiding...");

    const projectionSearchRes = await fetch(
      `${baseUrl}/search?q=Benchmark&scope=workspace&workspaceId=${ws._id}&limit=12`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    const projectionSearchData = (await projectionSearchRes.json()) as { data: SearchResponseDto };
    const shapeResults = projectionSearchData.data.results.filter((r) => r.entityType === "shape");
    assert(shapeResults.length === 3, "Found 3 shapes");

    for (const s of shapeResults) {
      assert(!("points" in s), "Result DTO must NOT expose shape points array");
      assert(!("style" in s), "Result DTO must NOT expose shape style object");
      assert(!("zIndex" in s), "Result DTO must NOT expose zIndex");
      assert(!("version" in s), "Result DTO must NOT expose OCC version");
    }
    console.log("✓ Suite 5 Passed: Projections omit points, style, and internal OCC fields.\n");

    // ----------------------------------------------------
    // 6. QUERY PLAN VERIFICATION VIA EXPLAIN
    // ----------------------------------------------------
    console.log("Suite 6: Query Plan Verification (explain executionStats)...");

    // 6a. Explain Board Search
    const boardExplain = await searchRepository.explainQuery(
      "board",
      {
        _id: { $in: [board1._id, board2._id, board3._id] },
        isArchived: false,
        $or: [{ name: /Benchmark/i }, { description: /Benchmark/i }],
      }
    );
    console.log(`  Board Explain: keysExamined=${boardExplain.keysExamined}, docsExamined=${boardExplain.docsExamined}, nReturned=${boardExplain.nReturned}, stages=[${boardExplain.stages.join(", ")}]`);
    assert(boardExplain.stages.includes("IXSCAN") || boardExplain.stages.includes("FETCH"), "Board query must utilize index scan");
    assert(boardExplain.docsExamined <= 10, "Board query docsExamined must be bounded to accessible boards");

    // 6b. Explain Canvas Search
    const canvasExplain = await searchRepository.explainQuery(
      "canvas",
      {
        boardId: { $in: [board1._id] },
        name: /Benchmark/i,
      }
    );
    console.log(`  Canvas Explain: keysExamined=${canvasExplain.keysExamined}, docsExamined=${canvasExplain.docsExamined}, nReturned=${canvasExplain.nReturned}, stages=[${canvasExplain.stages.join(", ")}]`);
    assert(canvasExplain.stages.includes("IXSCAN") || canvasExplain.stages.includes("FETCH"), "Canvas query must utilize index scan on boardId");

    // 6c. Explain Shape Search
    const shapeExplain = await searchRepository.explainQuery(
      "shape",
      {
        canvasId: { $in: [canvas1._id] },
        text: /Benchmark/i,
      }
    );
    console.log(`  Shape Explain: keysExamined=${shapeExplain.keysExamined}, docsExamined=${shapeExplain.docsExamined}, nReturned=${shapeExplain.nReturned}, stages=[${shapeExplain.stages.join(", ")}]`);
    assert(shapeExplain.stages.includes("IXSCAN") || shapeExplain.stages.includes("FETCH"), "Shape query must utilize index scan on canvasId");

    // 6d. Explain Comment Search
    const commentExplain = await searchRepository.explainQuery(
      "comment",
      {
        boardId: { $in: [board1._id] },
        deletedAt: null,
        content: /Benchmark/i,
      }
    );
    console.log(`  Comment Explain: keysExamined=${commentExplain.keysExamined}, docsExamined=${commentExplain.docsExamined}, nReturned=${commentExplain.nReturned}, stages=[${commentExplain.stages.join(", ")}]`);
    assert(commentExplain.stages.includes("IXSCAN") || commentExplain.stages.includes("FETCH"), "Comment query must utilize index scan on boardId");
    console.log("✓ Suite 6 Passed: Execution plans verified with IXSCAN across all four collections.\n");

    // ----------------------------------------------------
    // 7. READ-ONLY INVARIANTS
    // ----------------------------------------------------
    console.log("Suite 7: Search Read-Only Boundary & Zero Side Effects...");

    const mutCountBefore = await MutationRecordModel.countDocuments();
    const verCountBefore = await BoardVersionModel.countDocuments();
    const boardDocBefore = await BoardModel.findById(board1._id);
    const revBefore = boardDocBefore?.collaborationRevision;
    const shapeDocBefore = await ShapeModel.findById(shape1._id);
    const shapeVerBefore = shapeDocBefore?.version;

    // Run 10 rapid search queries
    for (let i = 0; i < 10; i++) {
      await fetch(
        `${baseUrl}/search?q=Benchmark&scope=workspace&workspaceId=${ws._id}&limit=5`,
        { headers: { Authorization: `Bearer ${tokenA}` } }
      );
    }

    const mutCountAfter = await MutationRecordModel.countDocuments();
    const verCountAfter = await BoardVersionModel.countDocuments();
    const boardDocAfter = await BoardModel.findById(board1._id);
    const revAfter = boardDocAfter?.collaborationRevision;
    const shapeDocAfter = await ShapeModel.findById(shape1._id);
    const shapeVerAfter = shapeDocAfter?.version;

    assert(mutCountBefore === mutCountAfter, "Zero MutationRecords created by search");
    assert(verCountBefore === verCountAfter, "Zero BoardVersions created by search");
    assert(revBefore === revAfter, "Zero changes to collaborationRevision");
    assert(shapeVerBefore === shapeVerAfter, "Zero changes to Shape.version OCC counter");
    console.log("✓ Suite 7 Passed: Search is strictly read-only.\n");

    // ----------------------------------------------------
    // 8. REGEX SPECIAL CHARACTER SAFETY
    // ----------------------------------------------------
    console.log("Suite 8: Regex Metacharacters Safety via HTTP...");

    // Create item with regex special characters in name
    const specialBoard = await BoardModel.create({
      workspaceId: ws._id,
      name: "Complex [Special] (Test.*+?^${}|) Name",
      description: "Testing regex safety",
      createdBy: userA._id,
      visibility: BoardVisibility.PUBLIC,
    });
    createdBoardIds.push(specialBoard._id);

    // Search with exact literal characters
    const literalQuery = "[Special] (Test.*+?^${}|)";
    const regexSafeRes = await fetch(
      `${baseUrl}/search?q=${encodeURIComponent(literalQuery)}&scope=workspace&workspaceId=${ws._id}`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    assert(regexSafeRes.status === 200, "Search with special characters must succeed with 200");
    const regexSafeData = (await regexSafeRes.json()) as { data: SearchResponseDto };
    assert(regexSafeData.data.results.length === 1, "Must match exact literal board");
    assert(regexSafeData.data.results[0].id === specialBoard._id.toString(), "Matched correct board");

    // Wildcard query must NOT match
    const wildcardQuery = "Special.*Test";
    const wildcardRes = await fetch(
      `${baseUrl}/search?q=${encodeURIComponent(wildcardQuery)}&scope=workspace&workspaceId=${ws._id}`,
      { headers: { Authorization: `Bearer ${tokenA}` } }
    );
    const wildcardData = (await wildcardRes.json()) as { data: SearchResponseDto };
    assert(wildcardData.data.results.length === 0, "Unmatched literal wildcard must return 0 results");
    console.log("✓ Suite 8 Passed: Regex metacharacters treated as literal text, zero injection vulnerability.\n");

    console.log("==========================================================");
    console.log("All Slice 44 Search Optimization Tests Passed Successfully!");
    console.log("==========================================================\n");
  } finally {
    // Teardown
    console.log("Tearing down optimization test fixtures...");
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

runOptimizationTests()
  .then(() => {
    process.exit(0);
  })
  .catch((err) => {
    console.error("Optimization Tests Failed:", err);
    process.exit(1);
  });
