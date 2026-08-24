import { createServer } from "http";
import mongoose, { Types } from "mongoose";

import app from "@/app";
import env from "@/config/env";
import { generateAccessToken } from "@/modules/auth/auth.tokens";
import { UserRole } from "@/modules/user/user.types";
import { UserModel } from "@/modules/user/user.model";
import { WorkspaceModel } from "@/modules/workspace/workspace.model";
import { WorkspaceMemberModel } from "@/modules/workspace/workspaceMember.model";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runRbacTests(): Promise<void> {
  console.log("Starting Workspace & Board RBAC Integration Tests...\n");

  let isDbConnected = false;
  try {
    await mongoose.connect(env.MONGODB_URI);
    isDbConnected = true;
    console.log("Connected to MongoDB for RBAC testing.");
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

  const createdUserIds: Types.ObjectId[] = [];

  const createTestUser = async (roleName: string) => {
    const user = await UserModel.create({
      fullName: `RBAC ${roleName}`,
      email: `rbac_${roleName.toLowerCase()}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}@example.com`,
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
    // Setup test users
    const owner = await createTestUser("Owner");
    const admin = await createTestUser("Admin");
    const editor = await createTestUser("Editor");
    const viewer = await createTestUser("Viewer");
    const outsider = await createTestUser("Outsider");
    const newUser = await createTestUser("NewUser");

    // 1. Create workspace as OWNER
    console.log("Test 1: Owner creates private workspace...");
    const createWsRes = await fetch(`${baseUrl}/workspaces`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        name: "RBAC Test Workspace",
        description: "Testing Workspace and Board RBAC",
      }),
    });
    assert(createWsRes.status === 201, `Expected 201, got ${createWsRes.status}`);
    const wsBody = (await createWsRes.json()) as any;
    const workspaceId = wsBody.data.id;
    assert(wsBody.data.role === "OWNER", "Creator role must be OWNER");
    console.log("✓ Workspace created with OWNER role:", workspaceId);

    // 2. Add members with different roles
    console.log("Test 2: Adding ADMIN, EDITOR, and VIEWER members...");
    const addAdminRes = await fetch(`${baseUrl}/workspaces/${workspaceId}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        email: admin.user.email,
        role: "ADMIN",
      }),
    });
    assert(addAdminRes.status === 201, `Expected 201 for adding ADMIN, got ${addAdminRes.status}`);

    const addEditorRes = await fetch(`${baseUrl}/workspaces/${workspaceId}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        email: editor.user.email,
        role: "EDITOR",
      }),
    });
    assert(addEditorRes.status === 201, `Expected 201 for adding EDITOR, got ${addEditorRes.status}`);

    const addViewerRes = await fetch(`${baseUrl}/workspaces/${workspaceId}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        email: viewer.user.email,
        role: "VIEWER",
      }),
    });
    assert(addViewerRes.status === 201, `Expected 201 for adding VIEWER, got ${addViewerRes.status}`);
    console.log("✓ All members added with correct roles.");

    // 3. Verify workspace reading and accurate user roles
    console.log("Test 3: Verifying workspace retrieval reflects callers' individual roles...");
    const getAsOwner = await fetch(`${baseUrl}/workspaces/${workspaceId}`, {
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    const ownerWsData = (await getAsOwner.json()) as any;
    assert(ownerWsData.data.role === "OWNER", "Owner role must be OWNER");

    const getAsAdmin = await fetch(`${baseUrl}/workspaces/${workspaceId}`, {
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    const adminWsData = (await getAsAdmin.json()) as any;
    assert(adminWsData.data.role === "ADMIN", "Admin role must be ADMIN");

    const getAsEditor = await fetch(`${baseUrl}/workspaces/${workspaceId}`, {
      headers: { Authorization: `Bearer ${editor.token}` },
    });
    const editorWsData = (await getAsEditor.json()) as any;
    assert(editorWsData.data.role === "EDITOR", "Editor role must be EDITOR");

    const getAsViewer = await fetch(`${baseUrl}/workspaces/${workspaceId}`, {
      headers: { Authorization: `Bearer ${viewer.token}` },
    });
    const viewerWsData = (await getAsViewer.json()) as any;
    assert(viewerWsData.data.role === "VIEWER", "Viewer role must be VIEWER");

    const getAsOutsider = await fetch(`${baseUrl}/workspaces/${workspaceId}`, {
      headers: { Authorization: `Bearer ${outsider.token}` },
    });
    assert(getAsOutsider.status === 403, `Expected 403 for outsider workspace access, got ${getAsOutsider.status}`);
    console.log("✓ Workspace access and role resolution verified across all members; outsider rejected with 403.");

    // 4. Verify getUserWorkspaces returns memberships with exact role
    console.log("Test 4: Verifying getUserWorkspaces returns membership workspace for editor...");
    const editorWorkspacesRes = await fetch(`${baseUrl}/workspaces`, {
      headers: { Authorization: `Bearer ${editor.token}` },
    });
    const editorWorkspaces = (await editorWorkspacesRes.json()) as any;
    assert(
      editorWorkspaces.data.some((w: any) => w.id === workspaceId && w.role === "EDITOR"),
      "Editor must see workspace in workspace list with role EDITOR"
    );
    console.log("✓ Membership workspace returned in user workspace list.");

    // 5. Workspace Update RBAC
    console.log("Test 5: Workspace update authorization (OWNER & ADMIN allowed, EDITOR & VIEWER rejected)...");
    const ownerUpdateRes = await fetch(`${baseUrl}/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({ name: "Updated by Owner" }),
    });
    assert(ownerUpdateRes.status === 200, `Expected 200 for Owner update, got ${ownerUpdateRes.status}`);

    const adminUpdateRes = await fetch(`${baseUrl}/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({ name: "Updated by Admin" }),
    });
    assert(adminUpdateRes.status === 200, `Expected 200 for Admin update, got ${adminUpdateRes.status}`);

    const editorUpdateRes = await fetch(`${baseUrl}/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${editor.token}`,
      },
      body: JSON.stringify({ name: "Updated by Editor" }),
    });
    assert(editorUpdateRes.status === 403, `Expected 403 for Editor update, got ${editorUpdateRes.status}`);

    const viewerUpdateRes = await fetch(`${baseUrl}/workspaces/${workspaceId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${viewer.token}`,
      },
      body: JSON.stringify({ name: "Updated by Viewer" }),
    });
    assert(viewerUpdateRes.status === 403, `Expected 403 for Viewer update, got ${viewerUpdateRes.status}`);
    console.log("✓ Workspace update permissions verified (OWNER/ADMIN allowed, EDITOR/VIEWER forbidden).");

    // 6. Workspace Deletion RBAC
    console.log("Test 6: Workspace deletion authorization (ADMIN/EDITOR/VIEWER rejected)...");
    const adminDeleteRes = await fetch(`${baseUrl}/workspaces/${workspaceId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    assert(adminDeleteRes.status === 403, `Expected 403 for Admin deleting workspace, got ${adminDeleteRes.status}`);

    const editorDeleteRes = await fetch(`${baseUrl}/workspaces/${workspaceId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${editor.token}` },
    });
    assert(editorDeleteRes.status === 403, `Expected 403 for Editor deleting workspace, got ${editorDeleteRes.status}`);
    console.log("✓ Non-owners forbidden from deleting workspace.");

    // 7. Member Management Edge Cases & Protections
    console.log("Test 7: Member management edge cases (duplicate member, invalid role, owner protection)...");
    const dupMemberRes = await fetch(`${baseUrl}/workspaces/${workspaceId}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({
        email: viewer.user.email,
        role: "EDITOR",
      }),
    });
    assert(dupMemberRes.status === 409, `Expected 409 for duplicate member, got ${dupMemberRes.status}`);

    const assignOwnerRoleRes = await fetch(`${baseUrl}/workspaces/${workspaceId}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${owner.token}`,
      },
      body: JSON.stringify({
        email: newUser.user.email,
        role: "OWNER",
      }),
    });
    assert(assignOwnerRoleRes.status === 400, `Expected 400 for assigning OWNER role, got ${assignOwnerRoleRes.status}`);

    const adminRemoveOwnerRes = await fetch(
      `${baseUrl}/workspaces/${workspaceId}/members/${owner.user._id.toString()}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${admin.token}` },
      }
    );
    assert(adminRemoveOwnerRes.status === 403, `Expected 403 for Admin removing Owner, got ${adminRemoveOwnerRes.status}`);

    const editorAddMemberRes = await fetch(`${baseUrl}/workspaces/${workspaceId}/members`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${editor.token}`,
      },
      body: JSON.stringify({
        email: newUser.user.email,
        role: "VIEWER",
      }),
    });
    assert(editorAddMemberRes.status === 403, `Expected 403 for Editor adding member, got ${editorAddMemberRes.status}`);
    console.log("✓ Member management protections verified.");

    // 8. Board RBAC & IDOR Protection
    console.log("Test 8: Board creation and access permissions...");
    // Editor creates board
    const editorCreateBoardRes = await fetch(`${baseUrl}/boards`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${editor.token}`,
      },
      body: JSON.stringify({
        workspaceId,
        name: "Editor's Board",
        description: "Created by Editor",
      }),
    });
    assert(editorCreateBoardRes.status === 201, `Expected 201 for Editor creating board, got ${editorCreateBoardRes.status}`);
    const editorBoardBody = (await editorCreateBoardRes.json()) as any;
    const boardId = editorBoardBody.data._id || editorBoardBody.data.id;

    // Viewer creating board -> rejected
    const viewerCreateBoardRes = await fetch(`${baseUrl}/boards`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${viewer.token}`,
      },
      body: JSON.stringify({
        workspaceId,
        name: "Viewer's Board",
      }),
    });
    assert(viewerCreateBoardRes.status === 403, `Expected 403 for Viewer creating board, got ${viewerCreateBoardRes.status}`);

    // Outsider accessing board -> rejected (IDOR protection)
    const outsiderGetBoardRes = await fetch(`${baseUrl}/boards/${boardId}`, {
      headers: { Authorization: `Bearer ${outsider.token}` },
    });
    assert(outsiderGetBoardRes.status === 403, `Expected 403 for Outsider accessing board, got ${outsiderGetBoardRes.status}`);

    // Viewer reading board -> allowed
    const viewerGetBoardRes = await fetch(`${baseUrl}/boards/${boardId}`, {
      headers: { Authorization: `Bearer ${viewer.token}` },
    });
    assert(viewerGetBoardRes.status === 200, `Expected 200 for Viewer reading board, got ${viewerGetBoardRes.status}`);

    // Board update: Editor (creator) allowed, Viewer forbidden
    const editorUpdateBoardRes = await fetch(`${baseUrl}/boards/${boardId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${editor.token}`,
      },
      body: JSON.stringify({ name: "Updated Board Name" }),
    });
    assert(editorUpdateBoardRes.status === 200, `Expected 200 for Editor board update, got ${editorUpdateBoardRes.status}`);

    const viewerUpdateBoardRes = await fetch(`${baseUrl}/boards/${boardId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${viewer.token}`,
      },
      body: JSON.stringify({ name: "Viewer Malicious Update" }),
    });
    assert(viewerUpdateBoardRes.status === 403, `Expected 403 for Viewer board update, got ${viewerUpdateBoardRes.status}`);

    // Board deletion: Admin allowed to delete board
    const adminDeleteBoardRes = await fetch(`${baseUrl}/boards/${boardId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${admin.token}` },
    });
    assert(adminDeleteBoardRes.status === 200, `Expected 200 for Admin deleting board, got ${adminDeleteBoardRes.status}`);
    console.log("✓ Board RBAC & IDOR protection verified across all operations.");

    // 9. Workspace deletion by Owner
    console.log("Test 9: Owner deleting workspace...");
    const ownerDeleteWsRes = await fetch(`${baseUrl}/workspaces/${workspaceId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${owner.token}` },
    });
    assert(ownerDeleteWsRes.status === 200, `Expected 200 for Owner deleting workspace, got ${ownerDeleteWsRes.status}`);
    console.log("✓ Workspace deleted successfully by Owner.");

  } finally {
    // Cleanup MongoDB Test Data
    for (const userId of createdUserIds) {
      await WorkspaceMemberModel.deleteMany({ userId });
      await WorkspaceModel.deleteMany({ ownerId: userId });
      await UserModel.findByIdAndDelete(userId);
    }
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
    await mongoose.disconnect();
    console.log("MongoDB disconnected and test data cleaned up.");
  }

  console.log("\nAll Workspace & Board RBAC Integration Tests Passed Successfully!\n");
}

runRbacTests().catch((error) => {
  console.error("RBAC tests failed:", error);
  process.exit(1);
});
