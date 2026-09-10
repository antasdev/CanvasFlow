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

interface ApiResponseBody<T> {
  success: boolean;
  data: T;
  message?: string;
  code?: string;
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

async function runHistoryRestoreTests(): Promise<void> {
  console.log("Starting Version Restore Integration & Unit Tests (Slice 41)...\n");

  let isDbConnected = false;
  try {
    await mongoose.connect(env.MONGODB_URI);
    isDbConnected = true;
    console.log("Connected to MongoDB for Version Restore testing.");
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
      fullName: `Restore User ${roleName}`,
      email: `restore_${roleName.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@example.com`,
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
    console.log("Setting up database test fixtures...");
    const owner = await createTestUser("Owner");
    const editor = await createTestUser("Editor");
    const viewer = await createTestUser("Viewer");
    const outsider = await createTestUser("Outsider");

    const workspace = await WorkspaceModel.create({
      name: "Restore Test Workspace",
      ownerId: owner.user._id,
      members: [
        { userId: owner.user._id, role: WorkspaceRole.OWNER },
        { userId: editor.user._id, role: WorkspaceRole.EDITOR },
        { userId: viewer.user._id, role: WorkspaceRole.VIEWER },
      ],
    });
    createdWorkspaceIds.push(workspace._id as Types.ObjectId);

    await WorkspaceMemberModel.create([
      { workspaceId: workspace._id, userId: owner.user._id, role: WorkspaceRole.OWNER },
      { workspaceId: workspace._id, userId: editor.user._id, role: WorkspaceRole.EDITOR },
      { workspaceId: workspace._id, userId: viewer.user._id, role: WorkspaceRole.VIEWER },
    ]);

    const board = await BoardModel.create({
      name: "Restore Test Board",
      workspaceId: workspace._id,
      createdBy: owner.user._id,
      collaborationRevision: 1,
    });
    createdBoardIds.push(board._id as Types.ObjectId);

    const canvas1 = await CanvasModel.create({
      boardId: board._id,
      name: "Canvas 1",
      order: 1,
      backgroundColor: "#ffffff",
    });
    createdCanvasIds.push(canvas1._id as Types.ObjectId);

    // Initial shape
    const shapeA = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.RECTANGLE,
      x: 100,
      y: 100,
      width: 200,
      height: 150,
      zIndex: 1,
      text: "Initial Shape A",
      style: { fill: "#ff0000" },
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(shapeA._id as Types.ObjectId);

    // Build historical Version 1
    const snapshotV1 = await SnapshotBuilder.buildBoardSnapshot(board._id as Types.ObjectId);
    const version1 = await historyRepository.create({
      boardId: board._id as Types.ObjectId,
      name: "Baseline Version 1",
      description: "Initial state with shape A",
      trigger: "manual",
      createdBy: owner.user._id as Types.ObjectId,
      collaborationRevision: 1,
      snapshot: snapshotV1,
      isNamed: true,
    });
    createdVersionIds.push(new Types.ObjectId(version1._id));
    console.log(`Created baseline historical Version 1 (ID: ${version1._id}, versionNumber: ${version1.versionNumber})`);

    // ----------------------------------------------------
    // TEST 1: Unauthenticated restore (401)
    // ----------------------------------------------------
    console.log("\n[TEST 1] Testing unauthenticated restore request...");
    const unauthRes = await fetch(`${baseUrl}/boards/${board._id}/versions/${version1._id}/restore`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expectedCollaborationRevision: 1 }),
    });
    assert(unauthRes.status === 401, `Expected 401, got ${unauthRes.status}`);
    console.log("  PASS: 401 unauthenticated rejected.");

    // ----------------------------------------------------
    // TEST 2: Viewer role forbidden (403)
    // ----------------------------------------------------
    console.log("\n[TEST 2] Testing viewer role restore request...");
    const viewerRes = await fetch(`${baseUrl}/boards/${board._id}/versions/${version1._id}/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${viewer.token}`,
      },
      body: JSON.stringify({ expectedCollaborationRevision: 1 }),
    });
    assert(viewerRes.status === 403, `Expected 403 for viewer, got ${viewerRes.status}`);
    console.log("  PASS: 403 viewer forbidden.");

    // ----------------------------------------------------
    // TEST 3: Outsider forbidden/not found (403/404)
    // ----------------------------------------------------
    console.log("\n[TEST 3] Testing outsider restore request...");
    const outsiderRes = await fetch(`${baseUrl}/boards/${board._id}/versions/${version1._id}/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${outsider.token}`,
      },
      body: JSON.stringify({ expectedCollaborationRevision: 1 }),
    });
    assert(outsiderRes.status === 403 || outsiderRes.status === 404, `Expected 403/404 for outsider, got ${outsiderRes.status}`);
    console.log("  PASS: Outsider rejected.");

    // ----------------------------------------------------
    // TEST 4: IDOR / Cross-board version restore rejected
    // ----------------------------------------------------
    console.log("\n[TEST 4] Testing cross-board IDOR version restore...");
    const foreignBoard = await BoardModel.create({
      name: "Foreign Board",
      workspaceId: workspace._id,
      createdBy: owner.user._id,
      collaborationRevision: 1,
    });
    createdBoardIds.push(foreignBoard._id as Types.ObjectId);

    const idorRes = await fetch(`${baseUrl}/boards/${foreignBoard._id}/versions/${version1._id}/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ expectedCollaborationRevision: 1 }),
    });
    assert(idorRes.status === 404, `Expected 404 for cross-board version, got ${idorRes.status}`);
    console.log("  PASS: Cross-board restore safely rejected with 404.");

    // ----------------------------------------------------
    // TEST 5: Missing version ID rejected
    // ----------------------------------------------------
    console.log("\n[TEST 5] Testing non-existent version ID...");
    const fakeVersionId = new Types.ObjectId().toString();
    const missingRes = await fetch(`${baseUrl}/boards/${board._id}/versions/${fakeVersionId}/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ expectedCollaborationRevision: 1 }),
    });
    assert(missingRes.status === 404, `Expected 404 for non-existent version, got ${missingRes.status}`);
    console.log("  PASS: Missing version returned 404.");

    // ----------------------------------------------------
    // Mutate live board: Add Shape B, Modify Shape A, Advance revision to 5
    // ----------------------------------------------------
    console.log("\nMutating live board to create delta (Shape B added, Shape A updated)...");
    await ShapeModel.updateOne(
      { _id: shapeA._id },
      { $set: { text: "Modified Shape A live", "style.fill": "#00ff00", version: 4 } }
    );
    const shapeB = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.CIRCLE,
      x: 300,
      y: 300,
      width: 100,
      height: 100,
      zIndex: 2,
      text: "Live Shape B",
      createdBy: editor.user._id,
      version: 1,
    });
    createdShapeIds.push(shapeB._id as Types.ObjectId);

    await BoardModel.updateOne({ _id: board._id }, { $set: { collaborationRevision: 5 } });

    // ----------------------------------------------------
    // TEST 6: OCC Stale Revision Conflict (409)
    // ----------------------------------------------------
    console.log("\n[TEST 6] Testing OCC stale revision check (expected=1, actual=5)...");
    const staleOccRes = await fetch(`${baseUrl}/boards/${board._id}/versions/${version1._id}/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${editor.token}`,
      },
      body: JSON.stringify({ expectedCollaborationRevision: 1 }),
    });
    assert(staleOccRes.status === 409, `Expected 409 Conflict, got ${staleOccRes.status}`);
    const staleJson = (await staleOccRes.json()) as ApiResponseBody<TestRestoreResult>;
    assert(staleJson.code === "OCC_CONFLICT", `Expected code OCC_CONFLICT, got ${staleJson.code}`);

    // Verify no mutation occurred on stale OCC conflict
    const boardAfterConflict = await BoardModel.findById(board._id);
    assert(boardAfterConflict?.collaborationRevision === 5, "Revision must remain unchanged on OCC failure");
    const shapesAfterConflict = await ShapeModel.find({ canvasId: canvas1._id });
    assert(shapesAfterConflict.length === 2, "Shapes must remain unchanged on OCC failure");
    console.log("  PASS: OCC stale revision properly returned 409 and left board untouched.");

    // ----------------------------------------------------
    // TEST 7: Successful Restore with Matching Revision (5)
    // ----------------------------------------------------
    console.log("\n[TEST 7] Testing successful restore with matching revision (expected=5)...");
    const mutationId = `mut_restore_${Date.now()}`;
    const restoreRes = await fetch(`${baseUrl}/boards/${board._id}/versions/${version1._id}/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${editor.token}`,
      },
      body: JSON.stringify({
        expectedCollaborationRevision: 5,
        mutationId,
        description: "Restored to baseline",
      }),
    });
    assert(restoreRes.status === 200, `Expected 200 OK, got ${restoreRes.status}`);
    const restoreJson = (await restoreRes.json()) as ApiResponseBody<TestRestoreResult>;
    assert(restoreJson.success === true, "Expected success: true");
    assert(restoreJson.data.restoredVersionNumber === 1, "Expected restoredVersionNumber === 1");
    assert(restoreJson.data.collaborationRevision === 6, "Expected collaborationRevision to advance to 6");
    assert(restoreJson.data.newVersion.versionNumber === 2, "Expected newVersion versionNumber === 2");
    assert(restoreJson.data.newVersion.trigger === "restore", "Expected newVersion trigger === 'restore'");
    createdVersionIds.push(new Types.ObjectId(restoreJson.data.newVersion.id));

    // Verify live document state:
    // Shape B should be gone
    const liveShapes = await ShapeModel.find({ canvasId: canvas1._id });
    assert(liveShapes.length === 1, `Expected 1 restored shape, got ${liveShapes.length}`);
    const restoredShapeA = liveShapes[0];
    assert(restoredShapeA._id.toString() === shapeA._id.toString(), "Shape ID must remain stable");
    assert(restoredShapeA.text === "Initial Shape A", `Expected text 'Initial Shape A', got '${restoredShapeA.text}'`);
    assert(restoredShapeA.style?.fill === "#ff0000", `Expected fill '#ff0000', got '${restoredShapeA.style?.fill}'`);
    assert(restoredShapeA.version === 1, `Expected fresh OCC version 1, got ${restoredShapeA.version}`);

    // Verify Board.collaborationRevision advanced to 6
    const updatedBoard = await BoardModel.findById(board._id);
    assert(updatedBoard?.collaborationRevision === 6, `Expected board revision 6, got ${updatedBoard?.collaborationRevision}`);

    // Verify MutationRecord created
    const mutationRecord = await MutationRecordModel.findOne({ mutationId });
    assert(mutationRecord !== null, "MutationRecord must be created for restore");
    assert(mutationRecord?.operation === "version:restore", `Expected operation 'version:restore', got '${mutationRecord?.operation}'`);
    assert(mutationRecord?.revision === 6, `Expected revision 6, got ${mutationRecord?.revision}`);

    // Verify historical Version 1 remains intact & immutable
    const originalV1 = await BoardVersionModel.findById(version1._id);
    assert(originalV1 !== null, "Version 1 must still exist");
    assert(originalV1?.versionNumber === 1, "Version 1 versionNumber must be 1");
    assert(originalV1?.snapshot.shapeCount === 1, "Version 1 shapeCount must be 1");
    console.log("  PASS: Version restore succeeded, live state updated, new Version 2 created, Version 1 immutable.");

    // ----------------------------------------------------
    // TEST 8: Idempotent replay with same mutationId
    // ----------------------------------------------------
    console.log("\n[TEST 8] Testing idempotent replay with identical mutationId...");
    const replayRes = await fetch(`${baseUrl}/boards/${board._id}/versions/${version1._id}/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${editor.token}`,
      },
      body: JSON.stringify({
        expectedCollaborationRevision: 5, // original revision before first restore
        mutationId,
      }),
    });
    assert(replayRes.status === 200, `Expected 200 for idempotent replay, got ${replayRes.status}`);
    const replayJson = (await replayRes.json()) as ApiResponseBody<TestRestoreResult>;
    assert(replayJson.data.collaborationRevision === 6, "Replay should return resulting revision 6");

    // Verify no duplicate version was created
    const allVersions = await BoardVersionModel.find({ boardId: board._id });
    assert(allVersions.length === 2, `Expected exactly 2 versions, got ${allVersions.length}`);
    console.log("  PASS: Idempotent replay produced zero duplicate versions or side-effects.");

    // ----------------------------------------------------
    // TEST 9: Hierarchy & Connectors Restore
    // ----------------------------------------------------
    console.log("\n[TEST 9] Testing complex hierarchy (nested groups & connectors) restore...");
    // Create nested group + connector on board
    const groupParentId = new Types.ObjectId().toString();
    const groupShape = await ShapeModel.create({
      _id: groupParentId,
      canvasId: canvas1._id,
      type: ShapeType.GROUP,
      x: 50,
      y: 50,
      width: 300,
      height: 300,
      zIndex: 1,
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(groupShape._id as Types.ObjectId);

    const childShape1 = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.RECTANGLE,
      x: 10,
      y: 10,
      width: 80,
      height: 60,
      zIndex: 2,
      parentId: groupParentId,
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(childShape1._id as Types.ObjectId);

    const childShape2 = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.CIRCLE,
      x: 120,
      y: 10,
      width: 60,
      height: 60,
      zIndex: 3,
      parentId: groupParentId,
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(childShape2._id as Types.ObjectId);

    const connectorShape = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.CONNECTOR,
      x: 90,
      y: 40,
      width: 30,
      height: 0,
      zIndex: 4,
      connector: {
        sourceShapeId: childShape1._id.toString(),
        sourceAnchor: "right",
        targetShapeId: childShape2._id.toString(),
        targetAnchor: "left",
        routing: "orthogonal",
      },
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(connectorShape._id as Types.ObjectId);

    await BoardModel.updateOne({ _id: board._id }, { $set: { collaborationRevision: 10 } });

    // Snapshot Version 3 with groups and connectors
    const snapshotV3 = await SnapshotBuilder.buildBoardSnapshot(board._id as Types.ObjectId);
    const version3 = await historyRepository.create({
      boardId: board._id as Types.ObjectId,
      name: "Version 3 with Groups & Connectors",
      trigger: "manual",
      createdBy: owner.user._id as Types.ObjectId,
      collaborationRevision: 10,
      snapshot: snapshotV3,
      isNamed: true,
    });
    createdVersionIds.push(new Types.ObjectId(version3._id));

    // Now delete everything on live board and add single triangle
    await ShapeModel.deleteMany({ canvasId: canvas1._id });
    const rogueTriangle = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.TRIANGLE,
      x: 500,
      y: 500,
      width: 100,
      height: 100,
      zIndex: 1,
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(rogueTriangle._id as Types.ObjectId);
    await BoardModel.updateOne({ _id: board._id }, { $set: { collaborationRevision: 15 } });

    // Restore Version 3
    const restoreV3Res = await fetch(`${baseUrl}/boards/${board._id}/versions/${version3._id}/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        expectedCollaborationRevision: 15,
        mutationId: `mut_restore_v3_${Date.now()}`,
      }),
    });
    assert(restoreV3Res.status === 200, `Expected 200 for restore V3, got ${restoreV3Res.status}`);
    const restoreV3Json = (await restoreV3Res.json()) as ApiResponseBody<TestRestoreResult>;
    createdVersionIds.push(new Types.ObjectId(restoreV3Json.data.newVersion.id));

    // Verify live hierarchy & connectors
    const v3RestoredShapes = await ShapeModel.find({ canvasId: canvas1._id });
    assert(v3RestoredShapes.length === snapshotV3.shapeCount, `Expected ${snapshotV3.shapeCount} shapes, got ${v3RestoredShapes.length}`);

    const restoredGroup = v3RestoredShapes.find((s) => s.type === ShapeType.GROUP);
    assert(restoredGroup !== undefined, "Group shape must be restored");
    assert(restoredGroup?._id.toString() === groupParentId, "Group ID must match historical ID");

    const restoredChildren = v3RestoredShapes.filter((s) => s.parentId?.toString() === groupParentId);
    assert(restoredChildren.length === 2, `Expected 2 child shapes with parentId ${groupParentId}, got ${restoredChildren.length}`);

    const restoredConnector = v3RestoredShapes.find((s) => s.type === ShapeType.CONNECTOR);
    assert(restoredConnector !== undefined, "Connector shape must be restored");
    assert(restoredConnector?.connector?.sourceShapeId?.toString() === childShape1._id.toString(), "Connector sourceShapeId preserved");
    assert(restoredConnector?.connector?.targetShapeId?.toString() === childShape2._id.toString(), "Connector targetShapeId preserved");
    assert(restoredConnector?.connector?.routing === "orthogonal", "Connector routing preserved");
    console.log("  PASS: Complex hierarchy (nested groups, parentId, connectors) perfectly restored.");

    // ----------------------------------------------------
    // TEST 10: Multi-Canvas Restore
    // ----------------------------------------------------
    console.log("\n[TEST 10] Testing multi-canvas restore...");
    const canvas2 = await CanvasModel.create({
      boardId: board._id,
      name: "Canvas 2",
      order: 2,
      backgroundColor: "#f0f0f0",
    });
    createdCanvasIds.push(canvas2._id as Types.ObjectId);

    const shapeCanvas2 = await ShapeModel.create({
      canvasId: canvas2._id,
      type: ShapeType.STAR,
      x: 50,
      y: 50,
      width: 70,
      height: 70,
      zIndex: 1,
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(shapeCanvas2._id as Types.ObjectId);

    await BoardModel.updateOne({ _id: board._id }, { $set: { collaborationRevision: 20 } });

    // Snapshot Version 5 with 2 canvases
    const snapshotV5 = await SnapshotBuilder.buildBoardSnapshot(board._id as Types.ObjectId);
    assert(snapshotV5.canvases.length === 2, `Expected 2 canvases in snapshot, got ${snapshotV5.canvases.length}`);

    const version5 = await historyRepository.create({
      boardId: board._id as Types.ObjectId,
      name: "Multi-Canvas Version 5",
      trigger: "manual",
      createdBy: owner.user._id as Types.ObjectId,
      collaborationRevision: 20,
      snapshot: snapshotV5,
      isNamed: true,
    });
    createdVersionIds.push(new Types.ObjectId(version5._id));

    // Delete Canvas 2 live
    await ShapeModel.deleteMany({ canvasId: canvas2._id });
    await CanvasModel.deleteOne({ _id: canvas2._id });
    await BoardModel.updateOne({ _id: board._id }, { $set: { collaborationRevision: 25 } });

    // Restore Version 5
    const restoreV5Res = await fetch(`${baseUrl}/boards/${board._id}/versions/${version5._id}/restore`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        expectedCollaborationRevision: 25,
        mutationId: `mut_restore_v5_${Date.now()}`,
      }),
    });
    assert(restoreV5Res.status === 200, `Expected 200 for multi-canvas restore, got ${restoreV5Res.status}`);
    const restoreV5Json = (await restoreV5Res.json()) as ApiResponseBody<TestRestoreResult>;
    createdVersionIds.push(new Types.ObjectId(restoreV5Json.data.newVersion.id));

    const restoredCanvases = await CanvasModel.find({ boardId: board._id }).sort({ order: 1 });
    assert(restoredCanvases.length === 2, `Expected 2 canvases after restore, got ${restoredCanvases.length}`);
    const restoredShapeOnCanvas2 = await ShapeModel.findOne({ canvasId: canvas2._id });
    assert(restoredShapeOnCanvas2 !== null, "Shape on Canvas 2 must be restored");
    assert(restoredShapeOnCanvas2?.type === ShapeType.STAR, "Star shape restored on Canvas 2");
    console.log("  PASS: Multi-canvas state completely restored.");

    console.log("\n==========================================");
    console.log("ALL 10 VERSION RESTORE SERVER TESTS PASSED!");
    console.log("==========================================\n");
  } finally {
    // Teardown & cleanup
    console.log("Cleaning up test fixtures...");
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
    httpServer.close();
    if (isDbConnected) {
      await mongoose.disconnect();
    }
  }
}

runHistoryRestoreTests().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
