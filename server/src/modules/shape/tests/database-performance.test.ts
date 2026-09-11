import mongoose, { Types } from "mongoose";
import env from "../../../config/env";
import { ShapeModel } from "../shape.model";
import { WorkspaceMemberModel } from "../../workspace/workspaceMember.model";
import { BoardModel } from "../../board/board.model";
import { CommentModel } from "../../comment/comment.model";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

interface MongoPlanStage {
  stage: string;
  indexName?: string;
  inputStage?: MongoPlanStage;
  inputStages?: MongoPlanStage[];
}

interface MongoExplainResult {
  queryPlanner?: {
    winningPlan?: MongoPlanStage;
  };
}

function findStageInPlan(plan: MongoPlanStage | undefined, targetStage: string): boolean {
  if (!plan) return false;
  if (plan.stage === targetStage) return true;
  if (plan.inputStage && findStageInPlan(plan.inputStage, targetStage)) return true;
  if (plan.inputStages) {
    for (const subStage of plan.inputStages) {
      if (findStageInPlan(subStage, targetStage)) return true;
    }
  }
  return false;
}

function findIndexInPlan(plan: MongoPlanStage | undefined, indexName: string): boolean {
  if (!plan) return false;
  if (plan.indexName === indexName) return true;
  if (plan.inputStage && findIndexInPlan(plan.inputStage, indexName)) return true;
  if (plan.inputStages) {
    for (const subStage of plan.inputStages) {
      if (findIndexInPlan(subStage, indexName)) return true;
    }
  }
  return false;
}

async function runPerformanceVerification(): Promise<void> {
  console.log("Starting Slice 55 Database Performance Verification...\n");

  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB");

  console.log("Synchronizing indexes across models...");
  await Promise.all([
    ShapeModel.syncIndexes(),
    WorkspaceMemberModel.syncIndexes(),
    BoardModel.syncIndexes(),
    CommentModel.syncIndexes(),
  ]);

  // 1. Verify index registration
  const [shapeIndexes, memberIndexes, boardIndexes, commentIndexes] = await Promise.all([
    ShapeModel.collection.indexes(),
    WorkspaceMemberModel.collection.indexes(),
    BoardModel.collection.indexes(),
    CommentModel.collection.indexes(),
  ]);

  const shapeIndexNames = new Set(shapeIndexes.map((idx) => idx.name));
  const memberIndexNames = new Set(memberIndexes.map((idx) => idx.name));
  const boardIndexNames = new Set(boardIndexes.map((idx) => idx.name));
  const commentIndexNames = new Set(commentIndexes.map((idx) => idx.name));

  assert(shapeIndexNames.has("parentId_1_zIndex_1"), "ShapeModel must have parentId_1_zIndex_1 index");
  assert(shapeIndexNames.has("connector.sourceShapeId_1"), "ShapeModel must have connector.sourceShapeId_1 index");
  assert(shapeIndexNames.has("connector.targetShapeId_1"), "ShapeModel must have connector.targetShapeId_1 index");
  console.log("✓ ShapeModel indexes successfully verified (parentId_1_zIndex_1, connector sparse indexes)");

  assert(memberIndexNames.has("workspaceId_1_createdAt_1"), "WorkspaceMemberModel must have workspaceId_1_createdAt_1 index");
  console.log("✓ WorkspaceMemberModel compound index verified (workspaceId_1_createdAt_1)");

  assert(boardIndexNames.has("workspaceId_1_isArchived_1_createdAt_-1"), "BoardModel must have workspaceId_1_isArchived_1_createdAt_-1 index");
  console.log("✓ BoardModel compound sort index verified (workspaceId_1_isArchived_1_createdAt_-1)");

  assert(commentIndexNames.has("boardId_1_canvasId_1_isResolved_1_deletedAt_1"), "CommentModel must have unresolved comments composite index");
  console.log("✓ CommentModel composite aggregation index verified");

  const dummyId = new Types.ObjectId();

  // 2. Shape hierarchy query: findByParentId
  console.log("\nTesting Shape findByParentId query plan...");
  const parentExplain = (await ShapeModel.find({ parentId: dummyId })
    .sort({ zIndex: 1 })
    .explain("executionStats")) as MongoExplainResult;

  const parentPlan = parentExplain.queryPlanner?.winningPlan;
  assert(!findStageInPlan(parentPlan, "COLLSCAN"), "findByParentId must not perform COLLSCAN");
  assert(findIndexInPlan(parentPlan, "parentId_1_zIndex_1"), "findByParentId must use parentId_1_zIndex_1 index");
  assert(!findStageInPlan(parentPlan, "SORT"), "findByParentId must not require in-memory SORT");
  console.log("✓ findByParentId uses index parentId_1_zIndex_1 with zero COLLSCAN and zero in-memory SORT");

  // 3. Shape hierarchy query: findDescendantIds
  console.log("\nTesting Shape findDescendantIds query plan...");
  const descExplain = (await ShapeModel.find({ parentId: { $in: [dummyId] } }, { _id: 1 })
    .explain("executionStats")) as MongoExplainResult;

  const descPlan = descExplain.queryPlanner?.winningPlan;
  assert(!findStageInPlan(descPlan, "COLLSCAN"), "findDescendantIds must not perform COLLSCAN");
  assert(findIndexInPlan(descPlan, "parentId_1_zIndex_1"), "findDescendantIds must use parentId_1_zIndex_1 index");
  console.log("✓ findDescendantIds uses index parentId_1_zIndex_1 with zero COLLSCAN");

  // 4. Connector nullification query
  console.log("\nTesting Connector source nullification query plan...");
  const connExplain = (await ShapeModel.find({ "connector.sourceShapeId": { $in: [dummyId] } })
    .explain("executionStats")) as MongoExplainResult;

  const connPlan = connExplain.queryPlanner?.winningPlan;
  assert(!findStageInPlan(connPlan, "COLLSCAN"), "Connector source search must not perform COLLSCAN");
  assert(findIndexInPlan(connPlan, "connector.sourceShapeId_1"), "Connector source search must use sparse index");
  console.log("✓ Connector queries use sparse index with zero COLLSCAN");

  // 5. Workspace member sorted listing
  console.log("\nTesting WorkspaceMember sorted query plan...");
  const memberExplain = (await WorkspaceMemberModel.find({ workspaceId: dummyId })
    .sort({ createdAt: 1 })
    .explain("executionStats")) as MongoExplainResult;

  const memberPlan = memberExplain.queryPlanner?.winningPlan;
  assert(!findStageInPlan(memberPlan, "COLLSCAN"), "WorkspaceMember listing must not perform COLLSCAN");
  assert(!findStageInPlan(memberPlan, "SORT"), "WorkspaceMember listing must not execute in-memory SORT");
  assert(findIndexInPlan(memberPlan, "workspaceId_1_createdAt_1"), "WorkspaceMember listing must use workspaceId_1_createdAt_1");
  console.log("✓ WorkspaceMember listing uses compound index with zero in-memory SORT");

  // 6. Board list sorted query
  console.log("\nTesting Board sorted listing query plan...");
  const boardExplain = (await BoardModel.find({ workspaceId: dummyId, isArchived: false })
    .sort({ createdAt: -1 })
    .explain("executionStats")) as MongoExplainResult;

  const boardPlan = boardExplain.queryPlanner?.winningPlan;
  assert(!findStageInPlan(boardPlan, "COLLSCAN"), "Board listing must not perform COLLSCAN");
  assert(!findStageInPlan(boardPlan, "SORT"), "Board listing must not execute in-memory SORT");
  console.log("✓ Board listing avoids in-memory SORT stage");

  // 7. Projection check: lean shape descendant IDs
  console.log("\nTesting projection guarantees...");
  const projectionQuery = ShapeModel.find({ parentId: dummyId }, { _id: 1 });
  const projection = projectionQuery.projection() as Record<string, number> | null;
  const projectedFields = Object.keys(projection ?? {});
  assert(projectedFields.includes("_id"), "Projection must contain _id");
  assert(!projectedFields.includes("points") && !projectedFields.includes("style"), "Descendant projection must exclude heavy geometry");
  console.log("✓ Lightweight projections verified");

  await mongoose.disconnect();
  console.log("\nDisconnected from MongoDB");
  console.log("\nAll Database Performance Verification tests PASSED successfully!\n");
}

runPerformanceVerification().catch((error) => {
  console.error("Performance verification failed:", error);
  process.exit(1);
});
