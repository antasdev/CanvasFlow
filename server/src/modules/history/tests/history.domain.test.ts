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
import { historyService } from "../history.service";
import { historyRepository } from "../history.repository";
import {
  boardVersionsQuerySchema,
  createManualVersionSchema,
  updateVersionMetadataSchema,
  versionParamsSchema,
} from "../history.validation";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runHistoryDomainTests(): Promise<void> {
  console.log("Starting Version History Domain & Integration Tests...\n");

  let isDbConnected = false;
  try {
    await mongoose.connect(env.MONGODB_URI);
    isDbConnected = true;
    console.log("Connected to MongoDB for Version History testing.");
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

  // Fixture trackers for teardown
  const createdUserIds: Types.ObjectId[] = [];
  const createdWorkspaceIds: Types.ObjectId[] = [];
  const createdBoardIds: Types.ObjectId[] = [];
  const createdCanvasIds: Types.ObjectId[] = [];
  const createdShapeIds: Types.ObjectId[] = [];
  const createdVersionIds: Types.ObjectId[] = [];

  const createTestUser = async (roleName: string) => {
    const user = await UserModel.create({
      fullName: `History ${roleName}`,
      email: `hist_${roleName.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@example.com`,
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
    // TEST 1: Zod Validation Schemas
    // ----------------------------------------------------
    console.log("Test 1: Validating Zod Schemas...");
    const validCreate = createManualVersionSchema.safeParse({
      params: { boardId: new Types.ObjectId().toString() },
      body: { name: "Milestone 1", description: "First complete design" },
    });
    assert(validCreate.success, "Valid create manual version should pass");

    const longName = createManualVersionSchema.safeParse({
      params: { boardId: new Types.ObjectId().toString() },
      body: { name: "a".repeat(101) },
    });
    assert(!longName.success, "Name over 100 characters must be rejected");

    const longDesc = createManualVersionSchema.safeParse({
      params: { boardId: new Types.ObjectId().toString() },
      body: { description: "d".repeat(501) },
    });
    assert(!longDesc.success, "Description over 500 characters must be rejected");

    const invalidBoardId = createManualVersionSchema.safeParse({
      params: { boardId: "invalid-id" },
      body: { name: "Test" },
    });
    assert(!invalidBoardId.success, "Invalid boardId format must be rejected");

    const emptyUpdate = updateVersionMetadataSchema.safeParse({
      params: {
        boardId: new Types.ObjectId().toString(),
        versionId: new Types.ObjectId().toString(),
      },
      body: {},
    });
    assert(!emptyUpdate.success, "Empty update body without name or description must be rejected");

    const validQuery = boardVersionsQuerySchema.safeParse({
      params: { boardId: new Types.ObjectId().toString() },
      query: { trigger: "manual", isNamed: "true", limit: "10", cursor: "5" },
    });
    assert(validQuery.success, "Valid query parameters should pass and coerce integers");
    if (validQuery.success) {
      assert(validQuery.data.query?.limit === 10, "limit should be coerced to number 10");
      assert(validQuery.data.query?.cursor === 5, "cursor should be coerced to number 5");
    }

    const invalidTriggerQuery = boardVersionsQuerySchema.safeParse({
      params: { boardId: new Types.ObjectId().toString() },
      query: { trigger: "unknown_trigger" as any },
    });
    assert(!invalidTriggerQuery.success, "Invalid trigger enum must be rejected");
    console.log("✓ Zod validation schemas strictly enforce parameter and payload boundaries.");

    // ----------------------------------------------------
    // Fixture Setup
    // ----------------------------------------------------
    console.log("\nSetting up test fixtures (Workspace, Board, Canvases, Shapes)...");
    const owner = await createTestUser("Owner");
    const admin = await createTestUser("Admin");
    const editor = await createTestUser("Editor");
    const viewer = await createTestUser("Viewer");
    const outsider = await createTestUser("Outsider");

    const workspace = await WorkspaceModel.create({
      name: "History Test Workspace",
      ownerId: owner.user._id,
    });
    createdWorkspaceIds.push(workspace._id as Types.ObjectId);

    await WorkspaceMemberModel.create([
      { workspaceId: workspace._id, userId: admin.user._id, role: WorkspaceRole.ADMIN },
      { workspaceId: workspace._id, userId: editor.user._id, role: WorkspaceRole.EDITOR },
      { workspaceId: workspace._id, userId: viewer.user._id, role: WorkspaceRole.VIEWER },
    ]);

    const boardA = await BoardModel.create({
      workspaceId: workspace._id,
      name: "Board A - Design System",
      createdBy: owner.user._id,
      collaborationRevision: 42,
    });
    createdBoardIds.push(boardA._id as Types.ObjectId);

    const boardB = await BoardModel.create({
      workspaceId: workspace._id,
      name: "Board B - Marketing Flow",
      createdBy: owner.user._id,
      collaborationRevision: 10,
    });
    createdBoardIds.push(boardB._id as Types.ObjectId);

    const canvas1 = await CanvasModel.create({
      boardId: boardA._id,
      name: "Page 1 - Components",
      order: 1,
      backgroundColor: "#FAFAFA",
    });
    createdCanvasIds.push(canvas1._id as Types.ObjectId);

    const canvas2 = await CanvasModel.create({
      boardId: boardA._id,
      name: "Page 2 - Layouts",
      order: 2,
      backgroundColor: "#1E1E1E",
    });
    createdCanvasIds.push(canvas2._id as Types.ObjectId);

    const canvasB1 = await CanvasModel.create({
      boardId: boardB._id,
      name: "Page 1 - Overview",
      order: 1,
      backgroundColor: "#FFFFFF",
    });
    createdCanvasIds.push(canvasB1._id as Types.ObjectId);

    // Create diverse shapes on Canvas 1
    const rectShape = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.RECTANGLE,
      x: 100,
      y: 150,
      width: 200,
      height: 100,
      rotation: 15,
      zIndex: 1,
      style: { fill: "#3B82F6", stroke: "#1D4ED8", strokeWidth: 2 },
      createdBy: owner.user._id,
      version: 3,
    });
    createdShapeIds.push(rectShape._id as Types.ObjectId);

    const groupShape = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.GROUP,
      x: 350,
      y: 200,
      width: 180,
      height: 120,
      rotation: 0,
      zIndex: 2,
      style: {},
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(groupShape._id as Types.ObjectId);

    const circleChild = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.CIRCLE,
      x: 20,
      y: 20,
      width: 60,
      height: 60,
      rotation: 0,
      zIndex: 3,
      style: { fill: "#EF4444" },
      createdBy: owner.user._id,
      parentId: groupShape._id,
      version: 2,
    });
    createdShapeIds.push(circleChild._id as Types.ObjectId);

    const connectorShape = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.CONNECTOR,
      x: 300,
      y: 150,
      width: 50,
      height: 50,
      zIndex: 4,
      connector: {
        sourceShapeId: rectShape._id,
        sourceAnchor: "right",
        targetShapeId: groupShape._id,
        targetAnchor: "left",
        routing: "orthogonal",
      },
      style: { stroke: "#000000", strokeWidth: 2 },
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(connectorShape._id as Types.ObjectId);

    const textShape = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.TEXT,
      x: 100,
      y: 80,
      width: 250,
      height: 40,
      zIndex: 5,
      text: "Version History Domain Title",
      style: { fontSize: 24, fontFamily: "Inter", fill: "#111827" },
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(textShape._id as Types.ObjectId);

    // Create 1 shape on Canvas 2
    const starShape = await ShapeModel.create({
      canvasId: canvas2._id,
      type: ShapeType.STAR,
      x: 500,
      y: 300,
      width: 100,
      height: 100,
      zIndex: 1,
      shapeConfig: { points: 5, innerRadiusRatio: 0.5 },
      style: { fill: "#F59E0B" },
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(starShape._id as Types.ObjectId);

    console.log("✓ Fixtures created (5 shapes on Canvas 1, 1 shape on Canvas 2).");

    // ----------------------------------------------------
    // TEST 2: Create Manual Version Snapshot
    // ----------------------------------------------------
    console.log("\nTest 2: Creating manual version checkpoint for Board A...");
    const v1 = await historyService.createManualVersion(
      boardA._id as Types.ObjectId,
      owner.user._id as Types.ObjectId,
      {
        name: "Initial Wireframe",
        description: "Baseline with rectangle, group, circle child, connector, text, star",
      }
    );
    createdVersionIds.push(new Types.ObjectId(v1.id));

    assert(v1.versionNumber === 1, "First version must have versionNumber === 1");
    assert(v1.name === "Initial Wireframe", "Version name must match");
    assert(v1.description === "Baseline with rectangle, group, circle child, connector, text, star", "Description must match");
    assert(v1.isNamed === true, "isNamed flag must be true for custom named version");
    assert(v1.trigger === "manual", "trigger must be manual");
    assert(v1.collaborationRevision === 42, "Must capture board collaboration revision (42)");
    assert(v1.createdBy === owner.user._id.toString(), "createdBy must match owner");
    assert(v1.author?.fullName === owner.user.fullName, "Author fullName must be populated");
    assert(v1.shapeCount === 6, "Total shapeCount must be 6 (5 on canvas 1, 1 on canvas 2)");
    assert(v1.snapshot.canvases.length === 2, "Snapshot must contain both canvases");

    const snapC1 = v1.snapshot.canvases.find((c) => c.canvasId === canvas1._id.toString());
    assert(Boolean(snapC1), "Canvas 1 snapshot must exist");
    assert(snapC1?.shapes.length === 5, "Canvas 1 snapshot must have 5 shapes");

    const snapRect = snapC1?.shapes.find((s) => s.id === rectShape._id.toString());
    assert(Boolean(snapRect), "Rectangle shape snapshot must exist");
    assert(snapRect?.x === 100 && snapRect?.y === 150, "Shape geometry must be preserved");
    assert(snapRect?.rotation === 15, "Rotation must be preserved");
    assert(snapRect?.version === 3, "Shape OCC version must be preserved in snapshot");

    const snapConnector = snapC1?.shapes.find((s) => s.id === connectorShape._id.toString());
    assert(snapConnector?.connector?.sourceShapeId === rectShape._id.toString(), "Connector sourceShapeId must be preserved");
    assert(snapConnector?.connector?.targetShapeId === groupShape._id.toString(), "Connector targetShapeId must be preserved");

    const snapGroupChild = snapC1?.shapes.find((s) => s.id === circleChild._id.toString());
    assert(snapGroupChild?.parentId === groupShape._id.toString(), "Parent-child group hierarchy must be preserved");

    console.log("✓ Version 1 successfully created with full self-contained snapshot.");

    // ----------------------------------------------------
    // TEST 3: Immutability Verification against Live Mutations
    // ----------------------------------------------------
    console.log("\nTest 3: Verifying snapshot immutability against live canvas modifications...");
    // Mutate live shapes
    await ShapeModel.findByIdAndUpdate(rectShape._id, {
      $set: { x: 999, y: 888, "style.fill": "#000000" },
      $inc: { version: 1 },
    });
    await ShapeModel.findByIdAndDelete(connectorShape._id);
    const brandNewShape = await ShapeModel.create({
      canvasId: canvas1._id,
      type: ShapeType.TRIANGLE,
      x: 400,
      y: 400,
      width: 80,
      height: 80,
      zIndex: 10,
      style: { fill: "#10B981" },
      createdBy: owner.user._id,
      version: 1,
    });
    createdShapeIds.push(brandNewShape._id as Types.ObjectId);

    // Fetch Version 1 again
    const v1Refetched = await historyService.getVersionById(
      boardA._id as Types.ObjectId,
      new Types.ObjectId(v1.id),
      owner.user._id as Types.ObjectId
    );

    const refetchedSnapC1 = v1Refetched.snapshot.canvases.find((c) => c.canvasId === canvas1._id.toString());
    const refetchedRect = refetchedSnapC1?.shapes.find((s) => s.id === rectShape._id.toString());
    assert(refetchedRect?.x === 100, "Historical shape x coordinate must remain 100 (not mutated 999)");
    assert(refetchedRect?.y === 150, "Historical shape y coordinate must remain 150 (not mutated 888)");
    assert(refetchedRect?.style?.fill === "#3B82F6", "Historical shape fill must remain #3B82F6 (not mutated #000000)");

    const refetchedConnector = refetchedSnapC1?.shapes.find((s) => s.id === connectorShape._id.toString());
    assert(Boolean(refetchedConnector), "Deleted live connector must STILL exist in historical snapshot");

    const refetchedNewShape = refetchedSnapC1?.shapes.find((s) => s.id === brandNewShape._id.toString());
    assert(!refetchedNewShape, "Newly created shape must NOT appear in past historical snapshot");
    console.log("✓ Version 1 snapshot is completely immutable and isolated from subsequent live modifications.");

    // ----------------------------------------------------
    // TEST 4: Monotonic Board-Scoped Numbering
    // ----------------------------------------------------
    console.log("\nTest 4: Verifying monotonic board-scoped version numbering...");
    const v2 = await historyService.createManualVersion(
      boardA._id as Types.ObjectId,
      admin.user._id as Types.ObjectId,
      { name: "Second Iteration" }
    );
    createdVersionIds.push(new Types.ObjectId(v2.id));
    assert(v2.versionNumber === 2, "Board A second version must have versionNumber === 2");

    const v3 = await historyService.createManualVersion(
      boardA._id as Types.ObjectId,
      editor.user._id as Types.ObjectId
    );
    createdVersionIds.push(new Types.ObjectId(v3.id));
    assert(v3.versionNumber === 3, "Board A third version must have versionNumber === 3");
    assert(v3.isNamed === false, "Unnamed version must have isNamed === false");

    // Independent Board B numbering
    const vB1 = await historyService.createManualVersion(
      boardB._id as Types.ObjectId,
      owner.user._id as Types.ObjectId,
      { name: "Board B Launch" }
    );
    createdVersionIds.push(new Types.ObjectId(vB1.id));
    assert(vB1.versionNumber === 1, "Board B first version must have versionNumber === 1 (independent sequence)");
    console.log("✓ Version numbering is strictly monotonic and independently scoped per board.");

    // ----------------------------------------------------
    // TEST 5: Metadata Update & Snapshot Protection
    // ----------------------------------------------------
    console.log("\nTest 5: Updating version metadata (name/description)...");
    const v1Updated = await historyService.updateVersionMetadata(
      boardA._id as Types.ObjectId,
      new Types.ObjectId(v1.id),
      editor.user._id as Types.ObjectId,
      {
        name: "Renamed Baseline Wireframe",
        description: "Updated description notes",
      }
    );

    assert(v1Updated.name === "Renamed Baseline Wireframe", "Name must be updated");
    assert(v1Updated.description === "Updated description notes", "Description must be updated");
    assert(v1Updated.isNamed === true, "isNamed must remain true");
    assert(v1Updated.versionNumber === 1, "versionNumber must be immutable");
    assert(v1Updated.snapshot.shapeCount === 6, "Snapshot must remain intact");
    console.log("✓ Version metadata updated successfully with snapshot immutability intact.");

    // ----------------------------------------------------
    // TEST 6: RBAC Authorization & IDOR Protection
    // ----------------------------------------------------
    console.log("\nTest 6: Verifying RBAC and cross-board access control...");
    // Viewer creating version -> FORBIDDEN
    let viewerFailed = false;
    try {
      await historyService.createManualVersion(
        boardA._id as Types.ObjectId,
        viewer.user._id as Types.ObjectId,
        { name: "Viewer Attempt" }
      );
    } catch (err: any) {
      viewerFailed = true;
      assert(err.statusCode === 403, "Viewer must be rejected with 403 FORBIDDEN");
    }
    assert(viewerFailed, "Viewer must NOT be allowed to create versions");

    // Viewer reading board versions -> ALLOWED
    const viewerVersions = await historyService.getBoardVersions(
      boardA._id as Types.ObjectId,
      viewer.user._id as Types.ObjectId
    );
    assert(viewerVersions.versions.length >= 3, "Viewer must be allowed to read version list");

    // Outsider reading private board -> FORBIDDEN
    let outsiderFailed = false;
    try {
      await historyService.getBoardVersions(
        boardA._id as Types.ObjectId,
        outsider.user._id as Types.ObjectId
      );
    } catch (err: any) {
      outsiderFailed = true;
      assert(err.statusCode === 403, "Outsider must be rejected with 403 FORBIDDEN");
    }
    assert(outsiderFailed, "Outsider must NOT access private board history");

    // Cross-board IDOR check: Fetching Board A's version under Board B's ID
    let crossBoardFailed = false;
    try {
      await historyService.getVersionById(
        boardB._id as Types.ObjectId,
        new Types.ObjectId(v1.id),
        owner.user._id as Types.ObjectId
      );
    } catch (err: any) {
      crossBoardFailed = true;
      assert(err.statusCode === 404, "Cross-board version mismatch must return 404 NOT_FOUND");
    }
    assert(crossBoardFailed, "Cross-board version retrieval must be rejected with 404");
    console.log("✓ RBAC permissions and IDOR boundaries strictly verified.");

    // ----------------------------------------------------
    // TEST 7: Pagination and Filtering
    // ----------------------------------------------------
    console.log("\nTest 7: Testing cursor pagination and filters...");
    const paginatedPage1 = await historyService.getBoardVersions(
      boardA._id as Types.ObjectId,
      owner.user._id as Types.ObjectId,
      { limit: 2 }
    );
    assert(paginatedPage1.versions.length === 2, "Page 1 must contain exactly 2 versions");
    assert(paginatedPage1.hasMore === true, "hasMore must be true when more versions exist");
    assert(paginatedPage1.versions[0].versionNumber === 3, "Latest version (3) must come first");
    assert(paginatedPage1.versions[1].versionNumber === 2, "Second version (2) must come second");
    assert(paginatedPage1.nextCursor === 2, "nextCursor should be 2");

    const paginatedPage2 = await historyService.getBoardVersions(
      boardA._id as Types.ObjectId,
      owner.user._id as Types.ObjectId,
      { limit: 2, cursor: paginatedPage1.nextCursor }
    );
    assert(paginatedPage2.versions.length === 1, "Page 2 must contain remaining 1 version");
    assert(paginatedPage2.versions[0].versionNumber === 1, "Page 2 item must be Version 1");
    assert(paginatedPage2.hasMore === false, "hasMore must be false on final page");

    const namedOnly = await historyService.getBoardVersions(
      boardA._id as Types.ObjectId,
      owner.user._id as Types.ObjectId,
      { isNamed: true }
    );
    assert(namedOnly.versions.every((v) => v.isNamed === true), "Filter isNamed must only return named versions");
    console.log("✓ Cursor pagination and filtering verified.");

    // ----------------------------------------------------
    // TEST 8: HTTP REST API Endpoints End-to-End
    // ----------------------------------------------------
    console.log("\nTest 8: Testing REST API endpoints (POST, GET, PATCH)...");

    // POST /api/v1/boards/:boardId/versions
    const postRes = await fetch(`${baseUrl}/boards/${boardA._id}/versions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${editor.token}`,
      },
      body: JSON.stringify({
        name: "HTTP REST Checkpoint",
        description: "Created via HTTP POST",
      }),
    });
    assert(postRes.status === 201, `POST /versions should return 201, got ${postRes.status}`);
    const postJson: any = await postRes.json();
    assert(postJson.success === true, "Response success must be true");
    assert(postJson.data.name === "HTTP REST Checkpoint", "Returned version name must match");
    assert(postJson.data.versionNumber === 4, "Version number must be 4");
    createdVersionIds.push(new Types.ObjectId(postJson.data.id));

    // GET /api/v1/boards/:boardId/versions
    const getListRes = await fetch(`${baseUrl}/boards/${boardA._id}/versions?limit=5`, {
      headers: {
        Authorization: `Bearer ${viewer.token}`,
      },
    });
    assert(getListRes.status === 200, `GET /versions should return 200, got ${getListRes.status}`);
    const listJson: any = await getListRes.json();
    assert(listJson.success === true && Array.isArray(listJson.data), "GET /versions must return list");
    assert(listJson.data[0].versionNumber === 4, "Newest version must be first in list");

    // GET /api/v1/boards/:boardId/versions/:versionId
    const getSingleRes = await fetch(`${baseUrl}/boards/${boardA._id}/versions/${postJson.data.id}`, {
      headers: {
        Authorization: `Bearer ${viewer.token}`,
      },
    });
    assert(getSingleRes.status === 200, `GET /versions/:versionId should return 200, got ${getSingleRes.status}`);
    const singleJson: any = await getSingleRes.json();
    assert(Boolean(singleJson.data.snapshot), "Single version endpoint must include complete snapshot");

    // PATCH /api/v1/boards/:boardId/versions/:versionId
    const patchRes = await fetch(`${baseUrl}/boards/${boardA._id}/versions/${postJson.data.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({
        name: "Renamed via PATCH",
      }),
    });
    assert(patchRes.status === 200, `PATCH /versions/:versionId should return 200, got ${patchRes.status}`);
    const patchJson: any = await patchRes.json();
    assert(patchJson.data.name === "Renamed via PATCH", "Patched name must match");
    console.log("✓ HTTP REST API endpoints verified end-to-end.");

    // ----------------------------------------------------
    // TEST 9: Architectural Separation Verification
    // ----------------------------------------------------
    console.log("\nTest 9: Verifying strict architectural separation...");
    // 1. Verify board collaborationRevision was NOT incremented by version creation
    const freshBoardA = await BoardModel.findById(boardA._id);
    assert(freshBoardA?.collaborationRevision === 42, "board.collaborationRevision must NOT be altered by version creation (remains 42)");

    // 2. Verify MutationRecord collection was NOT polluted
    const mutationRecords = await MutationRecordModel.find({ boardId: boardA._id });
    assert(mutationRecords.length === 0, "MutationRecord collection must have 0 records from version checkpoints");

    // 3. Verify Shape OCC versions are independent from version numbers
    const freshShapes = await ShapeModel.find({ canvasId: canvas1._id });
    const rectFresh = freshShapes.find((s) => s._id.equals(rectShape._id));
    assert(rectFresh?.version === 4, "Shape OCC version is 4 (incremented only by shape update, not by board versions)");
    console.log("✓ Architectural boundaries strictly preserved: 0 collaborationRevision pollution, 0 MutationRecord pollution, 0 OCC confusion.");

  } finally {
    // ----------------------------------------------------
    // Cleanup / Teardown
    // ----------------------------------------------------
    console.log("\nCleaning up test fixtures from database...");
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

    httpServer.close();
    if (isDbConnected) {
      await mongoose.disconnect();
      console.log("Disconnected from MongoDB.");
    }
  }

  console.log("\nAll Version History Domain & Integration Tests Passed Successfully!");
}

runHistoryDomainTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
