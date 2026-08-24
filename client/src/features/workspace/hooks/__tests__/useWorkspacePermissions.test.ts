import { describe, expect, it } from "vitest";

import { useWorkspacePermissions } from "../useWorkspacePermissions";

describe("useWorkspacePermissions hook", () => {
  it("computes permissions correctly for OWNER", () => {
    const result = useWorkspacePermissions("OWNER");

    expect(result.isOwner).toBe(true);
    expect(result.isAdmin).toBe(false);
    expect(result.isEditor).toBe(false);
    expect(result.isViewer).toBe(false);

    expect(result.canEditWorkspace).toBe(true);
    expect(result.canDeleteWorkspace).toBe(true);
    expect(result.canManageMembers).toBe(true);
    expect(result.canCreateBoard).toBe(true);
    expect(result.canEditCanvas).toBe(true);
    expect(result.canAddComment).toBe(true);
  });

  it("computes permissions correctly for ADMIN", () => {
    const result = useWorkspacePermissions("ADMIN");

    expect(result.isOwner).toBe(false);
    expect(result.isAdmin).toBe(true);
    expect(result.canDeleteWorkspace).toBe(false);
    expect(result.canEditWorkspace).toBe(true);
    expect(result.canManageMembers).toBe(true);
    expect(result.canCreateBoard).toBe(true);
    expect(result.canEditCanvas).toBe(true);
  });

  it("computes permissions correctly for EDITOR", () => {
    const result = useWorkspacePermissions("EDITOR");

    expect(result.isEditor).toBe(true);
    expect(result.canEditWorkspace).toBe(false);
    expect(result.canManageMembers).toBe(false);
    expect(result.canCreateBoard).toBe(true);
    expect(result.canEditCanvas).toBe(true);
    expect(result.canEditBoard(true)).toBe(true);
    expect(result.canEditBoard(false)).toBe(false);
  });

  it("computes permissions correctly for VIEWER (read-only)", () => {
    const result = useWorkspacePermissions("VIEWER");

    expect(result.isViewer).toBe(true);
    expect(result.canEditWorkspace).toBe(false);
    expect(result.canDeleteWorkspace).toBe(false);
    expect(result.canManageMembers).toBe(false);
    expect(result.canCreateBoard).toBe(false);
    expect(result.canEditBoard(true)).toBe(false);
    expect(result.canEditCanvas).toBe(false);
    expect(result.canAddComment).toBe(true);
  });

  it("handles null / undefined safely as non-permitted", () => {
    const result = useWorkspacePermissions(null);

    expect(result.canEditCanvas).toBe(false);
    expect(result.canCreateBoard).toBe(false);
    expect(result.canEditWorkspace).toBe(false);
    expect(result.canDeleteWorkspace).toBe(false);
    expect(result.canManageMembers).toBe(false);
    expect(result.canAddComment).toBe(false);
  });
});
