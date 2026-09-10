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
import { historyService } from "../history.service";
import { SnapshotBuilder } from "../pipeline/history.snapshot";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

interface ApiResponseBody<T> {
  success: boolean;
  data: T;
  message?: string;
  code?: string;
  pagination?: {
    nextCursor?: number;
    hasMore: boolean;
    totalCount: number;
  };
}

interface TestRestoreResult {
  restoredVersionId: string;
  restoredVersionNumber: number;
  newVersion: {
    id: string;
    versionNumber: number;
    trigger: string;
  };
  collaborationRevision: number;
}

interface TestVersionSummary {
  id: string;
  versionNumber: number;
  name: string;
  trigger: string;
  isNamed: boolean;
  shapeCount: number;
}

async function runHistoryReliabilityTests(): Promise<void> {
  console.log("Starting Version History Reliability & Performance Hardening Tests (Slice 42)...\n");

  let isDbConnected = false;
  try {
    await mongoose.connect(env.MONGODB_URI);
    isDbConnected = true;
    console.log("Connected to MongoDB for Reliability testing.");
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

  // Trackers for clean database teardown
  const createdUserIds: Types.ObjectId[] = [];
  const createdWorkspaceIds: Types.ObjectId[] = [];
  const createdBoardIds: Types.ObjectId[] = [];
  const createdCanvasIds: Types.ObjectId[] = [];
  const createdShapeIds: Types.ObjectId[] = [];
  const createdVersionIds: Types.ObjectId[] = [];
  const createdMutationKeys: { actorId: Types.ObjectId; boardId: Types.ObjectId; mutationId: string }[] = [];

  const createTestUser = async (name: string) => {
    const user = await UserModel.create({
      fullName: `Reliability User ${name}`,
      email: `reliability_${name.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@example.com`,
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
    console.log("Setting up baseline test fixtures...");
    const owner = await createTestUser("Owner");
    const collaboratorA = await createTestUser("CollabA");
    const collaboratorB = await createTestUser("CollabB");

    const workspace = await WorkspaceModel.create({
      name: "Reliability Test Workspace",
      ownerId: owner.user._id,
      members: [
        { userId: owner.user._id, role: WorkspaceRole.OWNER },
        { userId: collaboratorA.user._id, role: WorkspaceRole.EDITOR },
        { userId: collaboratorB.user._id, role: WorkspaceRole.EDITOR },
      ],
    });
    createdWorkspaceIds.push(workspace._id as Types.ObjectId);

    await WorkspaceMemberModel.create([
      { workspaceId: workspace._id, userId: owner.user._id, role: WorkspaceRole.OWNER },
      { workspaceId: workspace._id, userId: collaboratorA.user._id, role: WorkspaceRole.EDITOR },
      { workspaceId: workspace._id, userId: collaboratorB.user._id, role: WorkspaceRole.EDITOR },
    ]);

    const board = await BoardModel.create({
      name: "Reliability Hardening Board",
      workspaceId: workspace._id,
      createdBy: owner.user._id,
      collaborationRevision: 1,
    });
    createdBoardIds.push(board._id as Types.ObjectId);

    const canvas1 = await CanvasModel.create({
      boardId: board._id,
      name: "Page 1",
      order: 1,
      backgroundColor: "#ffffff",
    });
    createdCanvasIds.push(canvas1._id as Types.ObjectId);

    // Initial shape
    const shape1 = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.RECTANGLE,
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      zIndex: 1,
      text: "Baseline Shape 1",
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(shape1._id as Types.ObjectId);

    // Initial Version 1
    const snapshotV1 = await SnapshotBuilder.buildBoardSnapshot(board._id as Types.ObjectId);
    const version1 = await historyRepository.create({
      boardId: board._id as Types.ObjectId,
      name: "Version 1 Baseline",
      trigger: "manual",
      createdBy: owner.user._id as Types.ObjectId,
      collaborationRevision: 1,
      snapshot: snapshotV1,
      isNamed: true,
    });
    createdVersionIds.push(new Types.ObjectId(version1._id));

    // ----------------------------------------------------
    // TEST 1: OCC Stale Revision Rejection & Zero Side-Effects
    // ----------------------------------------------------
    console.log("\n[TEST 1] Testing OCC stale revision rejection and zero side-effects...");
    await BoardModel.updateOne({ _id: board._id }, { $set: { collaborationRevision: 10 } });

    const staleRes = await fetch(`${baseUrl}/boards/${board._id}/versions/${version1._id}/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${collaboratorA.token}`,
      },
      body: JSON.stringify({
        expectedCollaborationRevision: 5, // Stale! Actual is 10
        mutationId: `stale_occ_${Date.now()}`,
      }),
    });
    assert(staleRes.status === 409, `Expected 409, got ${staleRes.status}`);
    const staleData = (await staleRes.json()) as ApiResponseBody<TestRestoreResult>;
    assert(staleData.code === "OCC_CONFLICT", `Expected OCC_CONFLICT code, got ${staleData.code}`);

    // Invariant check: zero document mutations, zero revision bumps, zero versions created
    const boardCheck1 = await BoardModel.findById(board._id);
    assert(boardCheck1?.collaborationRevision === 10, "collaborationRevision must remain 10");
    const countCheck1 = await BoardVersionModel.countDocuments({ boardId: board._id });
    assert(countCheck1 === 1, "Zero additional versions must be created on OCC conflict");
    console.log("  PASS: Stale restore correctly rejected with 409 and left live board untouched.");

    // ----------------------------------------------------
    // TEST 2: Concurrent Restore Race Condition Determinism
    // ----------------------------------------------------
    console.log("\n[TEST 2] Testing concurrent restore race condition determinism...");
    // Create Version 2 to restore
    const shape2 = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.CIRCLE,
      x: 300,
      y: 300,
      width: 150,
      height: 150,
      zIndex: 2,
      text: "Shape 2 for V2",
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(shape2._id as Types.ObjectId);

    const snapshotV2 = await SnapshotBuilder.buildBoardSnapshot(board._id as Types.ObjectId);
    const version2 = await historyRepository.create({
      boardId: board._id as Types.ObjectId,
      name: "Version 2 Checkpoint",
      trigger: "manual",
      createdBy: owner.user._id as Types.ObjectId,
      collaborationRevision: 10,
      snapshot: snapshotV2,
      isNamed: true,
    });
    createdVersionIds.push(new Types.ObjectId(version2._id));

    // Both collaborator A and B attempt to restore with expectedCollaborationRevision = 10
    const [raceResA, raceResB] = await Promise.all([
      fetch(`${baseUrl}/boards/${board._id}/versions/${version1._id}/restore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${collaboratorA.token}`,
        },
        body: JSON.stringify({
          expectedCollaborationRevision: 10,
          mutationId: `race_mut_A_${Date.now()}`,
        }),
      }),
      fetch(`${baseUrl}/boards/${board._id}/versions/${version2._id}/restore`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${collaboratorB.token}`,
        },
        body: JSON.stringify({
          expectedCollaborationRevision: 10,
          mutationId: `race_mut_B_${Date.now()}`,
        }),
      }),
    ]);

    const statuses = [raceResA.status, raceResB.status].sort();
    assert(
      statuses[0] === 200 && statuses[1] === 409,
      `Expected exactly one 200 OK and one 409 Conflict, got ${statuses[0]} and ${statuses[1]}`
    );

    // Exactly one restore succeeded; revision advanced from 10 to 11
    const boardAfterRace = await BoardModel.findById(board._id);
    assert(boardAfterRace?.collaborationRevision === 11, `Expected revision 11, got ${boardAfterRace?.collaborationRevision}`);
    console.log("  PASS: Concurrent restores evaluated deterministically (1 succeeded, 1 safely rejected with 409).");

    // ----------------------------------------------------
    // TEST 3: Idempotent Replay Exact Match
    // ----------------------------------------------------
    console.log("\n[TEST 3] Testing idempotent replay with identical mutationId...");
    const currentRev = boardAfterRace!.collaborationRevision;
    const idempotentMutationId = `mut_idempotent_${Date.now()}`;
    createdMutationKeys.push({
      actorId: collaboratorA.user._id as Types.ObjectId,
      boardId: board._id as Types.ObjectId,
      mutationId: idempotentMutationId,
    });

    const firstRestore = await fetch(`${baseUrl}/boards/${board._id}/versions/${version1._id}/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${collaboratorA.token}`,
      },
      body: JSON.stringify({
        expectedCollaborationRevision: currentRev,
        mutationId: idempotentMutationId,
        description: "Idempotency test restore",
      }),
    });
    assert(firstRestore.status === 200, `First restore failed: ${firstRestore.status}`);
    const firstJson = (await firstRestore.json()) as ApiResponseBody<TestRestoreResult>;
    const expectedResultRev = firstJson.data.collaborationRevision;
    createdVersionIds.push(new Types.ObjectId(firstJson.data.newVersion.id));

    const versionCountBeforeReplay = await BoardVersionModel.countDocuments({ boardId: board._id });

    // Replay identical request
    const replayRestore = await fetch(`${baseUrl}/boards/${board._id}/versions/${version1._id}/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${collaboratorA.token}`,
      },
      body: JSON.stringify({
        expectedCollaborationRevision: currentRev,
        mutationId: idempotentMutationId,
        description: "Idempotency test restore",
      }),
    });
    assert(replayRestore.status === 200, `Replay restore failed: ${replayRestore.status}`);
    const replayJson = (await replayRestore.json()) as ApiResponseBody<TestRestoreResult>;
    assert(replayJson.data.collaborationRevision === expectedResultRev, "Replay must return original revision");
    assert(replayJson.data.restoredVersionNumber === 1, "Replay must return canonical restoredVersionNumber");

    const versionCountAfterReplay = await BoardVersionModel.countDocuments({ boardId: board._id });
    assert(versionCountAfterReplay === versionCountBeforeReplay, "Replay must produce zero duplicate version records");
    console.log("  PASS: Idempotent replay returned canonical result without duplicate versions or revision changes.");

    // ----------------------------------------------------
    // TEST 4: Idempotency Key Reuse Detection (Different Payload)
    // ----------------------------------------------------
    console.log("\n[TEST 4] Testing idempotency key reuse with different payload...");
    const mismatchRes = await fetch(`${baseUrl}/boards/${board._id}/versions/${version2._id}/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${collaboratorA.token}`,
      },
      body: JSON.stringify({
        expectedCollaborationRevision: currentRev,
        mutationId: idempotentMutationId, // Reusing mutationId for different version!
      }),
    });
    assert(mismatchRes.status === 409, `Expected 409 for mismatched payload, got ${mismatchRes.status}`);
    const mismatchJson = (await mismatchRes.json()) as ApiResponseBody<TestRestoreResult>;
    assert(
      mismatchJson.code === "IDEMPOTENCY_KEY_REUSED",
      `Expected code IDEMPOTENCY_KEY_REUSED, got ${mismatchJson.code}`
    );
    console.log("  PASS: Reusing mutationId with different payload safely rejected with 409 IDEMPOTENCY_KEY_REUSED.");

    // ----------------------------------------------------
    // TEST 5: Concurrent Monotonic Version Creation Stress
    // ----------------------------------------------------
    console.log("\n[TEST 5] Testing concurrent monotonic version creation stress (5 parallel requests)...");
    const initialHighest = await historyRepository.findHighestVersionNumber(board._id as Types.ObjectId);

    const parallelCreations = await Promise.all([
      historyService.createManualVersion(board._id as Types.ObjectId, owner.user._id as Types.ObjectId, { name: "Parallel 1" }),
      historyService.createManualVersion(board._id as Types.ObjectId, owner.user._id as Types.ObjectId, { name: "Parallel 2" }),
      historyService.createManualVersion(board._id as Types.ObjectId, owner.user._id as Types.ObjectId, { name: "Parallel 3" }),
      historyService.createManualVersion(board._id as Types.ObjectId, owner.user._id as Types.ObjectId, { name: "Parallel 4" }),
      historyService.createManualVersion(board._id as Types.ObjectId, owner.user._id as Types.ObjectId, { name: "Parallel 5" }),
    ]);

    for (const v of parallelCreations) {
      createdVersionIds.push(new Types.ObjectId(v.id));
    }

    const versionNumbers = parallelCreations.map((v) => v.versionNumber).sort((a, b) => a - b);
    const uniqueNumbers = new Set(versionNumbers);
    assert(uniqueNumbers.size === 5, `Expected 5 unique version numbers, got ${uniqueNumbers.size}`);
    assert(versionNumbers[0] === initialHighest + 1, `Expected start at ${initialHighest + 1}, got ${versionNumbers[0]}`);
    assert(versionNumbers[4] === initialHighest + 5, `Expected end at ${initialHighest + 5}, got ${versionNumbers[4]}`);
    console.log(`  PASS: Parallel creation allocated unique, strictly monotonic sequence: [${versionNumbers.join(", ")}].`);

    // ----------------------------------------------------
    // TEST 6: Post-Commit Checkpoint Fault Isolation
    // ----------------------------------------------------
    console.log("\n[TEST 6] Testing post-commit history checkpoint fault isolation...");
    // Verify that if SnapshotBuilder fails during restore post-commit,
    // the committed live restore still succeeds and returns a valid response
    const boardBeforeStub = await BoardModel.findById(board._id);
    const revBeforeStub = boardBeforeStub!.collaborationRevision;

    const originalBuildBoardSnapshot = SnapshotBuilder.buildBoardSnapshot;
    // Simulate temporary snapshot failure on next call
    let failSnapshotOnce = true;
    SnapshotBuilder.buildBoardSnapshot = async (bId: Types.ObjectId, session?: mongoose.ClientSession) => {
      if (failSnapshotOnce) {
        failSnapshotOnce = false;
        throw new Error("Simulated storage failure during snapshot building");
      }
      return originalBuildBoardSnapshot(bId, session);
    };

    try {
      const faultIsolatedResult = await historyService.restoreVersion(
        board._id as Types.ObjectId,
        version1._id as Types.ObjectId,
        owner.user._id as Types.ObjectId,
        {
          expectedCollaborationRevision: revBeforeStub,
          mutationId: `mut_fault_iso_${Date.now()}`,
        }
      );

      assert(faultIsolatedResult !== null, "Restore must return valid result despite auxiliary snapshot failure");
      assert(
        faultIsolatedResult.collaborationRevision === revBeforeStub + 1,
        `Expected revision ${revBeforeStub + 1}, got ${faultIsolatedResult.collaborationRevision}`
      );

      // Verify the board state was committed and NOT rolled back
      const boardAfterFault = await BoardModel.findById(board._id);
      assert(
        boardAfterFault?.collaborationRevision === revBeforeStub + 1,
        "Live document restore must remain committed"
      );
      console.log("  PASS: Live restore remained committed and successful despite auxiliary snapshot failure.");
    } finally {
      SnapshotBuilder.buildBoardSnapshot = originalBuildBoardSnapshot;
    }

    // ----------------------------------------------------
    // TEST 7: Large Board Restore & Structural Integrity
    // ----------------------------------------------------
    console.log("\n[TEST 7] Testing large board restore (2 canvases, 20 shapes, nested groups, connectors)...");
    const largeCanvas2 = await CanvasModel.create({
      boardId: board._id,
      name: "Large Page 2",
      order: 2,
      backgroundColor: "#e0f2fe",
    });
    createdCanvasIds.push(largeCanvas2._id as Types.ObjectId);

    // Create 10 shapes on Canvas 1 (including group + 2 children)
    const largeGroupId = new Types.ObjectId().toString();
    const largeGroup = await ShapeModel.create({
      _id: largeGroupId,
      canvasId: canvas1._id,
      type: ShapeType.GROUP,
      x: 20,
      y: 20,
      width: 400,
      height: 300,
      zIndex: 1,
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(largeGroup._id as Types.ObjectId);

    const childRect = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.RECTANGLE,
      x: 30,
      y: 30,
      width: 100,
      height: 80,
      zIndex: 2,
      parentId: largeGroupId,
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(childRect._id as Types.ObjectId);

    const childCircle = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.CIRCLE,
      x: 180,
      y: 30,
      width: 80,
      height: 80,
      zIndex: 3,
      parentId: largeGroupId,
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(childCircle._id as Types.ObjectId);

    const boundConnector = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.CONNECTOR,
      x: 130,
      y: 70,
      width: 50,
      height: 0,
      zIndex: 4,
      connector: {
        sourceShapeId: childRect._id.toString(),
        sourceAnchor: "right",
        targetShapeId: childCircle._id.toString(),
        targetAnchor: "left",
        routing: "curved",
      },
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(boundConnector._id as Types.ObjectId);

    // Create 10 shapes on Canvas 2
    for (let i = 0; i < 10; i++) {
      const s = await ShapeModel.create({
        canvasId: largeCanvas2._id,
        type: ShapeType.RECTANGLE,
        x: 50 * i,
        y: 50 * i,
        width: 40,
        height: 40,
        zIndex: i + 1,
        text: `Canvas2 Shape ${i}`,
        createdBy: owner.user._id,
        version: 1,
      });
      createdShapeIds.push(s._id as Types.ObjectId);
    }

    const largeBoardRev = (await BoardModel.findById(board._id))!.collaborationRevision;
    const snapshotLarge = await SnapshotBuilder.buildBoardSnapshot(board._id as Types.ObjectId);
    const largeVersion = await historyRepository.create({
      boardId: board._id as Types.ObjectId,
      name: "Large Checkpoint",
      trigger: "manual",
      createdBy: owner.user._id as Types.ObjectId,
      collaborationRevision: largeBoardRev,
      snapshot: snapshotLarge,
      isNamed: true,
    });
    createdVersionIds.push(new Types.ObjectId(largeVersion._id));

    // Desynchronize live board: delete Canvas 2, wipe shapes on Canvas 1
    await ShapeModel.deleteMany({ canvasId: largeCanvas2._id });
    await CanvasModel.deleteOne({ _id: largeCanvas2._id });
    await ShapeModel.deleteMany({ canvasId: canvas1._id });
    await BoardModel.updateOne({ _id: board._id }, { $set: { collaborationRevision: largeBoardRev + 5 } });

    // Restore large version
    const restoreLargeRes = await fetch(`${baseUrl}/boards/${board._id}/versions/${largeVersion._id}/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        expectedCollaborationRevision: largeBoardRev + 5,
        mutationId: `large_restore_${Date.now()}`,
      }),
    });
    assert(restoreLargeRes.status === 200, `Large restore failed: ${restoreLargeRes.status}`);
    const largeRestoreData = (await restoreLargeRes.json()) as ApiResponseBody<TestRestoreResult>;
    createdVersionIds.push(new Types.ObjectId(largeRestoreData.data.newVersion.id));

    // Verify all shapes and canvases are restored completely
    const restoredCanvases = await CanvasModel.find({ boardId: board._id });
    assert(restoredCanvases.length === 2, `Expected 2 canvases restored, got ${restoredCanvases.length}`);

    const restoredCanvas2Shapes = await ShapeModel.find({ canvasId: largeCanvas2._id });
    assert(restoredCanvas2Shapes.length === 10, `Expected 10 shapes on Canvas 2, got ${restoredCanvas2Shapes.length}`);

    const restoredGroupChildren = await ShapeModel.find({ parentId: largeGroupId });
    assert(restoredGroupChildren.length === 2, `Expected 2 children for group ${largeGroupId}, got ${restoredGroupChildren.length}`);

    const restoredConn = await ShapeModel.findOne({ type: ShapeType.CONNECTOR, canvasId: canvas1._id });
    assert(restoredConn !== null, "Connector must be restored");
    assert(restoredConn?.connector?.sourceShapeId?.toString() === childRect._id.toString(), "Connector source bound correctly");
    assert(restoredConn?.connector?.targetShapeId?.toString() === childCircle._id.toString(), "Connector target bound correctly");
    console.log("  PASS: Large board restored atomically with intact group hierarchy and connector bindings.");

    // ----------------------------------------------------
    // TEST 8: Cursor Pagination Stability & Filter Accuracy
    // ----------------------------------------------------
    console.log("\n[TEST 8] Testing deterministic cursor pagination & filter accuracy...");
    // List first 3 versions
    const page1Res = await fetch(`${baseUrl}/boards/${board._id}/versions?limit=3`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert(page1Res.status === 200, "Page 1 failed");
    const page1Data = (await page1Res.json()) as ApiResponseBody<TestVersionSummary[]>;
    assert(page1Data.data.length === 3, `Expected 3 versions on page 1, got ${page1Data.data.length}`);
    assert(page1Data.pagination?.hasMore === true, "Expected hasMore: true on page 1");
    const nextCursor = page1Data.pagination?.nextCursor;
    assert(typeof nextCursor === "number", "Expected valid numeric nextCursor");

    // Fetch page 2 using cursor
    const page2Res = await fetch(`${baseUrl}/boards/${board._id}/versions?limit=3&cursor=${nextCursor}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert(page2Res.status === 200, "Page 2 failed");
    const page2Data = (await page2Res.json()) as ApiResponseBody<TestVersionSummary[]>;
    assert(page2Data.data.length === 3, `Expected 3 versions on page 2, got ${page2Data.data.length}`);

    // Verify zero overlap between pages
    const page1Ids = new Set(page1Data.data.map((v) => v.id));
    for (const v of page2Data.data) {
      assert(!page1Ids.has(v.id), `Duplicate version ${v.id} found across cursor pages!`);
    }

    // Verify filter-aware totalCount
    const manualFilterRes = await fetch(`${baseUrl}/boards/${board._id}/versions?trigger=manual`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    const manualFilterData = (await manualFilterRes.json()) as ApiResponseBody<TestVersionSummary[]>;
    const actualManualCount = await BoardVersionModel.countDocuments({ boardId: board._id, trigger: "manual" });
    assert(
      manualFilterData.pagination?.totalCount === actualManualCount,
      `totalCount must match manual filter count (${actualManualCount}), got ${manualFilterData.pagination?.totalCount}`
    );

    // Invalid cursor
    const invalidCursorRes = await fetch(`${baseUrl}/boards/${board._id}/versions?cursor=1`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    const invalidCursorData = (await invalidCursorRes.json()) as ApiResponseBody<TestVersionSummary[]>;
    assert(invalidCursorData.data.length === 0, "Cursor at lowest version should return 0 older versions");
    assert(invalidCursorData.pagination?.hasMore === false, "Expected hasMore: false for lowest cursor");
    console.log("  PASS: Cursor pagination is deterministic, filter-aware, and boundary-safe.");

    // ----------------------------------------------------
    // TEST 9: Historical Snapshot Immutability
    // ----------------------------------------------------
    console.log("\n[TEST 9] Testing historical snapshot immutability...");
    // Original Version 1 snapshot state
    const originalV1Doc = await BoardVersionModel.findById(version1._id);
    assert(originalV1Doc !== null, "Version 1 must exist");
    const v1ShapeCount = originalV1Doc?.snapshot.shapeCount;

    // Mutate live shapes, update metadata of other versions
    await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.ELLIPSE,
      x: 700,
      y: 700,
      width: 120,
      height: 80,
      zIndex: 99,
      createdBy: owner.user._id,
      version: 1,
    });

    const freshV1Doc = await BoardVersionModel.findById(version1._id);
    assert(freshV1Doc?.snapshot.shapeCount === v1ShapeCount, "Historical snapshot shape count must remain invariant");
    assert(freshV1Doc?.versionNumber === 1, "Historical versionNumber must remain invariant");
    console.log("  PASS: Historical snapshots remain 100% immutable and isolated from live changes.");

    // ----------------------------------------------------
    // TEST 10: Projection & Index Optimization Verification
    // ----------------------------------------------------
    console.log("\n[TEST 10] Testing lightweight list projection & index optimization...");
    const rawVersions = await historyRepository.listByBoard(board._id as Types.ObjectId, { limit: 5 });
    for (const v of rawVersions.versions) {
      // Each canvas in raw document must have undefined or empty shapes array due to projection { "snapshot.canvases.shapes": 0 }
      for (const c of v.snapshot?.canvases ?? []) {
        assert(
          !c.shapes || c.shapes.length === 0,
          "listByBoard projection must exclude shapes from snapshot payload to preserve bandwidth"
        );
      }
    }

    const indexes = await BoardVersionModel.collection.indexes();
    const indexNames = indexes.map((idx) => idx.name);
    assert(
      indexNames.some((name) => name?.includes("boardId_1_versionNumber_-1")),
      "Index on { boardId: 1, versionNumber: -1 } must be active"
    );
    console.log("  PASS: List projection excludes shape payloads; compound indexes verified.");

    console.log("\n=======================================================");
    console.log("ALL 10 VERSION HISTORY RELIABILITY & HARDENING TESTS PASSED!");
    console.log("=======================================================\n");
  } finally {
    console.log("Cleaning up reliability test fixtures...");
    if (createdShapeIds.length > 0) {
      await ShapeModel.deleteMany({ _id: { $in: createdShapeIds } });
    }
    if (createdCanvasIds.length > 0) {
      await CanvasModel.deleteMany({ _id: { $in: createdCanvasIds } });
    }
    if (createdVersionIds.length > 0) {
      await BoardVersionModel.deleteMany({ _id: { $in: createdVersionIds } });
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
    for (const key of createdMutationKeys) {
      await MutationRecordModel.deleteOne({
        actorId: key.actorId,
        boardId: key.boardId,
        mutationId: key.mutationId,
      });
    }
    httpServer.close();
    if (isDbConnected) {
      await mongoose.disconnect();
    }
  }
}

runHistoryReliabilityTests().catch((err) => {
  console.error("Reliability test failed with error:", err);
  process.exit(1);
});
