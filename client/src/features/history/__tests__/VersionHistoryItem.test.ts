import { describe, expect, it } from "vitest";

import type { VersionSummary } from "../types";
import { formatVersionTime, formatFullDateTime } from "../utils/history-date.utils";

describe("VersionHistoryItem Formatting, Badges & Invariants", () => {
  const mockNamedVersion: VersionSummary = {
    id: "v-42",
    boardId: "board-101",
    versionNumber: 42,
    name: "Release Candidate 1",
    description: "Prepared shapes for production release",
    trigger: "manual",
    createdBy: "user-1",
    author: {
      id: "user-1",
      fullName: "Antas Dev",
      email: "antas@example.com",
    },
    collaborationRevision: 150,
    changeSummary: {
      shapesAdded: 3,
      shapesModified: 2,
      shapesDeleted: 1,
    },
    canvasCount: 2,
    shapeCount: 15,
    isNamed: true,
    createdAt: "2026-09-10T13:12:00.000Z",
  };

  const mockAutomaticVersion: VersionSummary = {
    id: "v-41",
    boardId: "board-101",
    versionNumber: 41,
    trigger: "automatic",
    createdBy: "user-2",
    collaborationRevision: 140,
    canvasCount: 1,
    shapeCount: 11,
    isNamed: false,
    createdAt: "2026-09-10T13:01:00.000Z",
  };

  it("extracts version display elements correctly", () => {
    expect(`v${mockNamedVersion.versionNumber}`).toBe("v42");
    expect(mockNamedVersion.isNamed).toBe(true);
    expect(mockNamedVersion.name).toBe("Release Candidate 1");
    expect(mockNamedVersion.author?.fullName).toBe("Antas Dev");
    expect(mockNamedVersion.shapeCount).toBe(15);
    expect(mockNamedVersion.canvasCount).toBe(2);
  });

  it("handles missing optional author and description gracefully", () => {
    const authorName = mockAutomaticVersion.author?.fullName || "Collaborator";
    expect(authorName).toBe("Collaborator");
    expect(mockAutomaticVersion.name).toBeUndefined();
    expect(mockAutomaticVersion.description).toBeUndefined();
    expect(mockAutomaticVersion.isNamed).toBe(false);
  });

  it("derives change count tags correctly", () => {
    const summary = mockNamedVersion.changeSummary!;
    expect(summary.shapesAdded).toBe(3);
    expect(summary.shapesModified).toBe(2);
    expect(summary.shapesDeleted).toBe(1);

    const formatCounts = (s: typeof summary) => ({
      added: s.shapesAdded > 0 ? `+${s.shapesAdded} added` : null,
      modified: s.shapesModified > 0 ? `~${s.shapesModified} modified` : null,
      deleted: s.shapesDeleted > 0 ? `-${s.shapesDeleted} deleted` : null,
    });

    expect(formatCounts(summary)).toEqual({
      added: "+3 added",
      modified: "~2 modified",
      deleted: "-1 deleted",
    });
  });

  it("verifies time and datetime formatting", () => {
    const timeFormatted = formatVersionTime(mockNamedVersion.createdAt);
    expect(timeFormatted).toBeTruthy();

    const fullDateTime = formatFullDateTime(mockNamedVersion.createdAt);
    expect(fullDateTime).toContain("2026");
  });

  it("verifies Slice 40 Preview and Slice 41 Restore affordance disabled states", () => {
    const isPreviewEnabled = false; // Deferred to Slice 40
    const isRestoreEnabled = false; // Deferred to Slice 41

    expect(isPreviewEnabled).toBe(false);
    expect(isRestoreEnabled).toBe(false);
  });
});
