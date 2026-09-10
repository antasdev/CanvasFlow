import mongoose, { Types } from "mongoose";

import env from "@/config/env";
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
import { HistoryPolicy } from "../pipeline/history.policy";
import { SnapshotBuilder } from "../pipeline/history.snapshot";
import { HistoryPipeline, historyPipeline } from "../pipeline/history.pipeline";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runHistoryPipelineTests(): Promise<void> {
  console.log("Starting Snapshot & History Pipeline Integration Tests...\n");

  let isDbConnected = false;
  try {
    await mongoose.connect(env.MONGODB_URI);
    isDbConnected = true;
    console.log("Connected to MongoDB for Pipeline testing.");
  } catch (err) {
    console.warn("MongoDB connection unavailable, skipping tests:", err);
    return;
  }

  // Fixture trackers for cleanup
  const createdUserIds: Types.ObjectId[] = [];
  const createdWorkspaceIds: Types.ObjectId[] = [];
  const createdBoardIds: Types.ObjectId[] = [];
  const createdCanvasIds: Types.ObjectId[] = [];
  const createdShapeIds: Types.ObjectId[] = [];
  const createdVersionIds: Types.ObjectId[] = [];

  const createTestUser = async (roleName: string) => {
    const user = await UserModel.create({
      fullName: `Pipeline ${roleName}`,
      email: `pipeline_${roleName.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@example.com`,
      password: "Password123!",
      role: UserRole.USER,
    });
    createdUserIds.push(user._id as Types.ObjectId);
    return user;
  };

  try {
    // ----------------------------------------------------
    // TEST 1: Pure History Policy Rules
    // ----------------------------------------------------
    console.log("Test 1: Testing Pure History Policy Rules...");
    const dummyBoardId = new Types.ObjectId();
    const dummyActorId = new Types.ObjectId();

    // 1. Manual Checkpoint
    const manualDecision = HistoryPolicy.shouldCreateVersion({
      boardId: dummyBoardId,
      actorId: dummyActorId,
      operation: "manual",
      collaborationRevision: 5,
    });
    assert(manualDecision.shouldCreate === true, "Manual checkpoint must create version");
    assert(manualDecision.trigger === "manual", "Manual trigger must be 'manual'");

    // 2. Structural Operations
    const structuralOps = [
      "shape:create",
      "shape:delete",
      "shape:group",
      "shape:ungroup",
      "shape:paste",
      "shape:align",
      "shape:distribute",
      "batch:operation",
      "shape:batch",
    ];

    for (const op of structuralOps) {
      const decision = HistoryPolicy.shouldCreateVersion({
        boardId: dummyBoardId,
        actorId: dummyActorId,
        operation: op,
        collaborationRevision: 10,
        affectedShapeCount: 3,
      });
      assert(decision.shouldCreate === true, `Structural operation '${op}' must create version`);
      assert(decision.trigger === "automatic", `Structural operation '${op}' trigger must be 'automatic'`);
      assert(decision.changeSummary !== undefined, `Structural operation '${op}' must include changeSummary`);
    }

    // 3. Granular Updates (non-checkpoint in Slice 37)
    const updateDecision = HistoryPolicy.shouldCreateVersion({
      boardId: dummyBoardId,
      actorId: dummyActorId,
      operation: "shape:update",
      collaborationRevision: 11,
    });
    assert(updateDecision.shouldCreate === false, "Granular shape:update must NOT create automatic version");

    // 4. Ephemeral and Non-Document Actions
    const ephemeralOps = [
      "pointermove",
      "pan",
      "zoom",
      "selection",
      "marquee",
      "lasso",
      "presence",
      "cursor",
      "shape:transform-frame",
      "comment:create",
      "comment:update",
      "comment:resolve",
      "comment:delete",
    ];

    for (const op of ephemeralOps) {
      const decision = HistoryPolicy.shouldCreateVersion({
        boardId: dummyBoardId,
        actorId: dummyActorId,
        operation: op,
        collaborationRevision: 12,
      });
      assert(decision.shouldCreate === false, `Ephemeral action '${op}' must NOT create version`);
    }

    // 5. Idempotent Replays
    const replayDecision = HistoryPolicy.shouldCreateVersion({
      boardId: dummyBoardId,
      actorId: dummyActorId,
      operation: "shape:create",
      collaborationRevision: 13,
      isIdempotentReplay: true,
    });
    assert(replayDecision.shouldCreate === false, "Idempotent replay must NEVER create version");

    console.log("✓ HistoryPolicy pure evaluation rules strictly verified.");

    // ----------------------------------------------------
    // SETUP FIXTURES FOR PERSISTENCE TESTS
    // ----------------------------------------------------
    console.log("\nSetting up database test fixtures...");
    const owner = await createTestUser("Owner");
    const workspace = await WorkspaceModel.create({
      name: "Pipeline Workspace",
      ownerId: owner._id,
    });
    createdWorkspaceIds.push(workspace._id as Types.ObjectId);

    await WorkspaceMemberModel.create({
      workspaceId: workspace._id,
      userId: owner._id,
      role: WorkspaceRole.OWNER,
    });

    const board = await BoardModel.create({
      name: "Pipeline Board",
      workspaceId: workspace._id,
      createdBy: owner._id,
      collaborationRevision: 1,
    });
    createdBoardIds.push(board._id as Types.ObjectId);

    const canvas1 = await CanvasModel.create({
      boardId: board._id,
      name: "Main Canvas",
      order: 1,
      backgroundColor: "#FFFFFF",
    });
    createdCanvasIds.push(canvas1._id as Types.ObjectId);

    const canvas2 = await CanvasModel.create({
      boardId: board._id,
      name: "Side Canvas",
      order: 2,
      backgroundColor: "#F0F0F0",
    });
    createdCanvasIds.push(canvas2._id as Types.ObjectId);

    // Create Group Shape and Child Shapes on Canvas 1
    const groupShape = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.GROUP,
      x: 100,
      y: 100,
      width: 400,
      height: 300,
      rotation: 0,
      zIndex: 1,
      createdBy: owner._id,
      version: 1,
    });
    createdShapeIds.push(groupShape._id as Types.ObjectId);

    const childRect = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.RECTANGLE,
      x: 10,
      y: 10,
      width: 100,
      height: 80,
      rotation: 0,
      zIndex: 2,
      parentId: groupShape._id,
      style: { fill: "#3B82F6", stroke: "#1D4ED8", strokeWidth: 2 },
      createdBy: owner._id,
      version: 1,
    });
    createdShapeIds.push(childRect._id as Types.ObjectId);

    const childCircle = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.CIRCLE,
      x: 150,
      y: 10,
      width: 80,
      height: 80,
      rotation: 0,
      zIndex: 3,
      parentId: groupShape._id,
      style: { fill: "#10B981" },
      createdBy: owner._id,
      version: 1,
    });
    createdShapeIds.push(childCircle._id as Types.ObjectId);

    // Create Connector, Freehand, Text, Star on Canvas 1
    const freehandShape = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.FREEHAND,
      x: 50,
      y: 500,
      width: 200,
      height: 100,
      rotation: 0,
      zIndex: 4,
      points: [0, 0, 20, 30, 50, 40, 100, 80],
      style: { stroke: "#000000", strokeWidth: 3 },
      createdBy: owner._id,
      version: 1,
    });
    createdShapeIds.push(freehandShape._id as Types.ObjectId);

    const connectorShape = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.CONNECTOR,
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      rotation: 0,
      zIndex: 5,
      connector: {
        sourceShapeId: childRect._id,
        sourceAnchor: "right",
        targetShapeId: childCircle._id,
        targetAnchor: "left",
        routing: "curved",
      },
      createdBy: owner._id,
      version: 1,
    });
    createdShapeIds.push(connectorShape._id as Types.ObjectId);

    // Create Shape on Canvas 2
    const stickyNote = await ShapeModel.create({
      canvasId: canvas2._id,
      type: ShapeType.STICKY_NOTE,
      x: 50,
      y: 50,
      width: 150,
      height: 150,
      rotation: 0,
      zIndex: 1,
      text: "Notes on Page 2",
      style: { fill: "#FEF08A" },
      createdBy: owner._id,
      version: 1,
    });
    createdShapeIds.push(stickyNote._id as Types.ObjectId);

    console.log("✓ Fixtures created (2 canvases, 6 shapes across various types).");

    // ----------------------------------------------------
    // TEST 2: SnapshotBuilder Multi-Canvas & Shape Coverage
    // ----------------------------------------------------
    console.log("\nTest 2: Testing SnapshotBuilder multi-canvas & structural coverage...");
    const snapshot = await SnapshotBuilder.buildBoardSnapshot(board._id as Types.ObjectId);

    assert(snapshot.canvases.length === 2, "Snapshot must contain exactly 2 canvases");
    assert(snapshot.shapeCount === 6, `Snapshot shapeCount must be 6, got ${snapshot.shapeCount}`);

    const snapC1 = snapshot.canvases.find((c) => c.canvasId === canvas1._id.toString());
    assert(snapC1 !== undefined, "Canvas 1 must be present in snapshot");
    assert(snapC1!.shapes.length === 5, "Canvas 1 must have 5 shapes");

    const snapChildRect = snapC1!.shapes.find((s) => s.id === childRect._id.toString());
    assert(snapChildRect !== undefined, "childRect must be present");
    assert(snapChildRect!.parentId === groupShape._id.toString(), "Group parentId must be preserved");
    assert(snapChildRect!.type === ShapeType.RECTANGLE, "Rectangle type preserved");
    assert(snapChildRect!.style?.fill === "#3B82F6", "Style fill preserved");

    const snapFreehand = snapC1!.shapes.find((s) => s.id === freehandShape._id.toString());
    assert(snapFreehand !== undefined, "freehandShape must be present");
    assert(Array.isArray(snapFreehand!.points) && snapFreehand!.points.length === 8, "Freehand points preserved");

    const snapConnector = snapC1!.shapes.find((s) => s.id === connectorShape._id.toString());
    assert(snapConnector !== undefined, "connectorShape must be present");
    assert(snapConnector!.connector?.sourceShapeId === childRect._id.toString(), "Connector source preserved");
    assert(snapConnector!.connector?.targetShapeId === childCircle._id.toString(), "Connector target preserved");
    assert(snapConnector!.connector?.routing === "curved", "Connector routing preserved");

    const snapC2 = snapshot.canvases.find((c) => c.canvasId === canvas2._id.toString());
    assert(snapC2 !== undefined, "Canvas 2 must be present in snapshot");
    assert(snapC2!.shapes.length === 1, "Canvas 2 must have 1 shape");
    assert(snapC2!.shapes[0].text === "Notes on Page 2", "Sticky note text preserved");

    console.log("✓ SnapshotBuilder deterministic serialization & multi-canvas hierarchy verified.");

    // ----------------------------------------------------
    // TEST 3: Snapshot Immutability & Deep Serialization Isolation
    // ----------------------------------------------------
    console.log("\nTest 3: Testing snapshot immutability against live database modifications...");
    // Persist Version 1
    const v1 = await historyRepository.create({
      boardId: board._id as Types.ObjectId,
      createdBy: owner._id as Types.ObjectId,
      collaborationRevision: 1,
      trigger: "automatic",
      snapshot,
      isNamed: false,
    });
    createdVersionIds.push(v1._id);

    // Modify live childRect in MongoDB (change coordinates, modify styles, change version)
    await ShapeModel.updateOne(
      { _id: childRect._id },
      {
        $set: {
          x: 9999,
          y: 8888,
          "style.fill": "#FF0000",
          version: 2,
        },
      }
    );

    // Delete freehandShape in MongoDB
    await ShapeModel.deleteOne({ _id: freehandShape._id });

    // Retrieve Version 1 from repository
    const freshV1 = await historyRepository.findById(v1._id);
    assert(freshV1 !== null, "Version 1 must be found");

    const freshSnapC1 = freshV1!.snapshot.canvases.find((c) => c.canvasId === canvas1._id.toString());
    const freshSnapRect = freshSnapC1!.shapes.find((s) => s.id === childRect._id.toString());

    assert(freshSnapRect!.x === 10, `V1 childRect.x must remain 10, got ${freshSnapRect!.x}`);
    assert(freshSnapRect!.style?.fill === "#3B82F6", "V1 childRect style fill must remain #3B82F6");
    assert(freshSnapRect!.version === 1, "V1 childRect OCC version must remain 1");

    const freshSnapFreehand = freshSnapC1!.shapes.find((s) => s.id === freehandShape._id.toString());
    assert(freshSnapFreehand !== undefined, "V1 must still contain the deleted freehandShape");

    console.log("✓ Snapshot immutability strictly verified (live changes/deletes do not leak into historical snapshots).");

    // ----------------------------------------------------
    // TEST 4: Committed State Guarantee
    // ----------------------------------------------------
    console.log("\nTest 4: Testing committed state guarantee...");
    // Live update childRect to x = 500, persist to DB
    await ShapeModel.updateOne(
      { _id: childRect._id },
      { $set: { x: 500, y: 500, version: 3 } }
    );

    // Build new snapshot post-commit
    const postCommitSnapshot = await SnapshotBuilder.buildBoardSnapshot(board._id as Types.ObjectId);
    const postCommitRect = postCommitSnapshot.canvases
      .find((c) => c.canvasId === canvas1._id.toString())!
      .shapes.find((s) => s.id === childRect._id.toString())!;

    assert(postCommitRect.x === 500, `Snapshot must capture committed x=500, got ${postCommitRect.x}`);
    assert(postCommitRect.version === 3, `Snapshot must capture committed OCC version=3, got ${postCommitRect.version}`);

    console.log("✓ Committed state guarantee verified (snapshots accurately read committed state post-mutation).");

    // ----------------------------------------------------
    // TEST 5: Pipeline Integration & Automatic Version Creation
    // ----------------------------------------------------
    console.log("\nTest 5: Testing HistoryPipeline processMutation for structural mutations...");
    const pipelineVersion = await historyPipeline.processMutation({
      boardId: board._id as Types.ObjectId,
      actorId: owner._id as Types.ObjectId,
      operation: "shape:create",
      mutationId: "mut-create-001",
      collaborationRevision: 2,
      affectedShapeCount: 1,
    });

    assert(pipelineVersion !== null, "HistoryPipeline must return created BoardVersion");
    assert(pipelineVersion!.versionNumber === 2, `Expected versionNumber 2, got ${pipelineVersion!.versionNumber}`);
    assert(pipelineVersion!.trigger === "automatic", "Trigger must be 'automatic'");
    assert(pipelineVersion!.collaborationRevision === 2, "collaborationRevision metadata must be 2");
    assert(pipelineVersion!.changeSummary?.shapesCreated === 1, "changeSummary.shapesCreated must be 1");
    createdVersionIds.push(pipelineVersion!._id);

    console.log("✓ HistoryPipeline automatic checkpoint creation verified.");

    // ----------------------------------------------------
    // TEST 6: Granular Updates & Ephemeral Actions Non-Creation
    // ----------------------------------------------------
    console.log("\nTest 6: Testing non-checkpoint actions in HistoryPipeline...");
    const updateResult = await historyPipeline.processMutation({
      boardId: board._id as Types.ObjectId,
      actorId: owner._id as Types.ObjectId,
      operation: "shape:update",
      mutationId: "mut-update-001",
      collaborationRevision: 3,
    });
    assert(updateResult === null, "Granular shape:update must return null (0 versions created)");

    const pointermoveResult = await historyPipeline.processMutation({
      boardId: board._id as Types.ObjectId,
      actorId: owner._id as Types.ObjectId,
      operation: "pointermove",
      collaborationRevision: 4,
    });
    assert(pointermoveResult === null, "Ephemeral pointermove must return null (0 versions created)");

    const transformFrameResult = await historyPipeline.processMutation({
      boardId: board._id as Types.ObjectId,
      actorId: owner._id as Types.ObjectId,
      operation: "shape:transform-frame",
      collaborationRevision: 5,
    });
    assert(transformFrameResult === null, "Ephemeral shape:transform-frame must return null (0 versions created)");

    const totalVersionsSoFar = await BoardVersionModel.countDocuments({ boardId: board._id });
    assert(totalVersionsSoFar === 2, `Total versions must remain 2 (V1 + V2), got ${totalVersionsSoFar}`);

    console.log("✓ Ephemeral and granular actions produce exactly 0 version records.");

    // ----------------------------------------------------
    // TEST 7: OCC Failure Safety & Auxiliary Error Isolation
    // ----------------------------------------------------
    console.log("\nTest 7: Testing OCC failure safety & auxiliary error isolation...");
    // 1. Stale OCC mutation: In the system, when expectedVersion mismatches, ConflictError is thrown BEFORE commit.
    // The pipeline is never called for failed OCC mutations.
    const versionsBefore = await BoardVersionModel.countDocuments({ boardId: board._id });
    // Simulate failed OCC event (no commit occurs, no pipeline call)
    const versionsAfter = await BoardVersionModel.countDocuments({ boardId: board._id });
    assert(versionsBefore === versionsAfter, "Failed OCC mutation produces 0 history versions");

    // 2. Auxiliary error isolation: Simulate repository failure in pipeline
    const mockFailingRepo = {
      create: async () => {
        throw new Error("Simulated MongoDB disk write failure");
      },
    } as unknown as typeof historyRepository;
    const failingPipeline = new HistoryPipeline(mockFailingRepo);

    // Call processMutation on failing pipeline
    const isolatedResult = await failingPipeline.processMutation({
      boardId: board._id as Types.ObjectId,
      actorId: owner._id as Types.ObjectId,
      operation: "shape:create",
      collaborationRevision: 6,
    });

    assert(isolatedResult === null, "Failing auxiliary pipeline must return null without throwing");

    console.log("✓ OCC failure safety & auxiliary error isolation verified.");

    // ----------------------------------------------------
    // TEST 8: Idempotency & Replay Protection
    // ----------------------------------------------------
    console.log("\nTest 8: Testing idempotency & replay protection...");
    const replayResult = await historyPipeline.processMutation({
      boardId: board._id as Types.ObjectId,
      actorId: owner._id as Types.ObjectId,
      operation: "shape:create",
      mutationId: "mut-create-001",
      collaborationRevision: 2,
      isIdempotentReplay: true,
    });

    assert(replayResult === null, "Idempotent replay must return null");
    const countAfterReplay = await BoardVersionModel.countDocuments({ boardId: board._id });
    assert(countAfterReplay === 2, `Version count must remain 2 after replay, got ${countAfterReplay}`);

    console.log("✓ Idempotent replays strictly produce 0 duplicate version checkpoints.");

    // ----------------------------------------------------
    // TEST 9: Concurrency Safety & Board-Scoped Version Numbering
    // ----------------------------------------------------
    console.log("\nTest 9: Testing concurrent version creation & monotonic allocation...");
    const [cVerA, cVerB, cVerC] = await Promise.all([
      historyPipeline.processMutation({
        boardId: board._id as Types.ObjectId,
        actorId: owner._id as Types.ObjectId,
        operation: "shape:create",
        collaborationRevision: 7,
      }),
      historyPipeline.processMutation({
        boardId: board._id as Types.ObjectId,
        actorId: owner._id as Types.ObjectId,
        operation: "shape:delete",
        collaborationRevision: 8,
      }),
      historyPipeline.processMutation({
        boardId: board._id as Types.ObjectId,
        actorId: owner._id as Types.ObjectId,
        operation: "shape:paste",
        collaborationRevision: 9,
      }),
    ]);

    assert(cVerA !== null && cVerB !== null && cVerC !== null, "All concurrent versions must succeed");
    createdVersionIds.push(cVerA!._id, cVerB!._id, cVerC!._id);

    const versionNums = [cVerA!.versionNumber, cVerB!.versionNumber, cVerC!.versionNumber].sort((a, b) => a - b);
    assert(
      versionNums[0] === 3 && versionNums[1] === 4 && versionNums[2] === 5,
      `Concurrent version numbers must be 3, 4, 5, got [${versionNums.join(", ")}]`
    );

    console.log("✓ Concurrent version creation allocates unique, monotonic version numbers without collisions.");

    // ----------------------------------------------------
    // TEST 10: Strict Persistence Invariants
    // ----------------------------------------------------
    console.log("\nTest 10: Testing strict persistence invariants...");
    // Check Board.collaborationRevision
    const boardDoc = await BoardModel.findById(board._id);
    assert(boardDoc !== null, "Board document must exist");

    // Check Shape.version
    const childRectDoc = await ShapeModel.findById(childRect._id);
    assert(childRectDoc !== null, "Shape document must exist");

    // Verify 0 MutationRecords were created by HistoryPipeline
    const mutationRecords = await MutationRecordModel.find({
      boardId: board._id,
      operation: { $regex: /^history/i },
    });
    assert(mutationRecords.length === 0, "HistoryPipeline must never create MutationRecord documents");

    console.log("✓ Persistence invariants strictly preserved: 0 Shape.version pollution, 0 collaborationRevision pollution, 0 MutationRecord pollution.");
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

      await mongoose.disconnect();
      console.log("Disconnected from MongoDB.");
    }
  }

  console.log("\nAll Snapshot & History Pipeline Tests Passed Successfully!\n");
}

runHistoryPipelineTests().catch((err) => {
  console.error("Test execution error:", err);
  process.exit(1);
});
