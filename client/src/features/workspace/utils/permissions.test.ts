import { describe, expect, it } from "vitest";

import {
  canAddComment,
  canCreateBoard,
  canDeleteBoard,
  canDeleteWorkspace,
  canEditBoard,
  canEditCanvas,
  canEditWorkspace,
  canManageMembers,
} from "./permissions";

describe("Workspace & Board Permissions Utility", () => {
  describe("canEditWorkspace", () => {
    it("allows OWNER and ADMIN", () => {
      expect(canEditWorkspace("OWNER")).toBe(true);
      expect(canEditWorkspace("ADMIN")).toBe(true);
    });

    it("denies EDITOR, VIEWER, and unauthenticated/null", () => {
      expect(canEditWorkspace("EDITOR")).toBe(false);
      expect(canEditWorkspace("VIEWER")).toBe(false);
      expect(canEditWorkspace(null)).toBe(false);
      expect(canEditWorkspace(undefined)).toBe(false);
    });
  });

  describe("canDeleteWorkspace", () => {
    it("allows ONLY OWNER", () => {
      expect(canDeleteWorkspace("OWNER")).toBe(true);
      expect(canDeleteWorkspace("ADMIN")).toBe(false);
      expect(canDeleteWorkspace("EDITOR")).toBe(false);
      expect(canDeleteWorkspace("VIEWER")).toBe(false);
    });
  });

  describe("canManageMembers", () => {
    it("allows OWNER and ADMIN", () => {
      expect(canManageMembers("OWNER")).toBe(true);
      expect(canManageMembers("ADMIN")).toBe(true);
    });

    it("denies EDITOR and VIEWER", () => {
      expect(canManageMembers("EDITOR")).toBe(false);
      expect(canManageMembers("VIEWER")).toBe(false);
    });
  });

  describe("canCreateBoard", () => {
    it("allows OWNER, ADMIN, and EDITOR", () => {
      expect(canCreateBoard("OWNER")).toBe(true);
      expect(canCreateBoard("ADMIN")).toBe(true);
      expect(canCreateBoard("EDITOR")).toBe(true);
    });

    it("denies VIEWER and null", () => {
      expect(canCreateBoard("VIEWER")).toBe(false);
      expect(canCreateBoard(null)).toBe(false);
    });
  });

  describe("canEditBoard", () => {
    it("allows OWNER and ADMIN unconditionally", () => {
      expect(canEditBoard("OWNER", false)).toBe(true);
      expect(canEditBoard("ADMIN", false)).toBe(true);
    });

    it("allows EDITOR only if they are the creator", () => {
      expect(canEditBoard("EDITOR", true)).toBe(true);
      expect(canEditBoard("EDITOR", false)).toBe(false);
    });

    it("denies VIEWER even if claimed as creator", () => {
      expect(canEditBoard("VIEWER", true)).toBe(false);
      expect(canEditBoard("VIEWER", false)).toBe(false);
    });
  });

  describe("canDeleteBoard", () => {
    it("allows OWNER and ADMIN unconditionally", () => {
      expect(canDeleteBoard("OWNER", false)).toBe(true);
      expect(canDeleteBoard("ADMIN", false)).toBe(true);
    });

    it("allows EDITOR only if they are the creator", () => {
      expect(canDeleteBoard("EDITOR", true)).toBe(true);
      expect(canDeleteBoard("EDITOR", false)).toBe(false);
    });

    it("denies VIEWER", () => {
      expect(canDeleteBoard("VIEWER", true)).toBe(false);
      expect(canDeleteBoard("VIEWER", false)).toBe(false);
    });
  });

  describe("canEditCanvas", () => {
    it("allows OWNER, ADMIN, and EDITOR", () => {
      expect(canEditCanvas("OWNER")).toBe(true);
      expect(canEditCanvas("ADMIN")).toBe(true);
      expect(canEditCanvas("EDITOR")).toBe(true);
    });

    it("denies VIEWER (read-only)", () => {
      expect(canEditCanvas("VIEWER")).toBe(false);
    });
  });

  describe("canAddComment", () => {
    it("allows all valid workspace roles", () => {
      expect(canAddComment("OWNER")).toBe(true);
      expect(canAddComment("ADMIN")).toBe(true);
      expect(canAddComment("EDITOR")).toBe(true);
      expect(canAddComment("VIEWER")).toBe(true);
    });

    it("denies null/undefined", () => {
      expect(canAddComment(null)).toBe(false);
      expect(canAddComment(undefined)).toBe(false);
    });
  });
});
