import { describe, expect, it } from "vitest";

import type { VersionSummary } from "../types";
import {
  formatDateGroup,
  formatVersionTime,
  formatFullDateTime,
  groupVersionsByDate,
} from "../utils/history-date.utils";

describe("History Date Formatting & Grouping Utilities", () => {
  const createMockVersion = (
    id: string,
    versionNumber: number,
    createdAt: string
  ): VersionSummary => ({
    id,
    boardId: "board-1",
    versionNumber,
    trigger: "manual",
    createdBy: "user-1",
    collaborationRevision: versionNumber,
    canvasCount: 1,
    shapeCount: 3,
    isNamed: false,
    createdAt,
  });

  it("identifies Today and Yesterday correctly based on calendar day", () => {
    const now = new Date();
    const todayIso = now.toISOString();

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayIso = yesterday.toISOString();

    const olderDate = new Date(2025, 5, 15, 14, 30);
    const olderDateIso = olderDate.toISOString();

    expect(formatDateGroup(todayIso)).toBe("Today");
    expect(formatDateGroup(yesterdayIso)).toBe("Yesterday");
    const olderGroup = formatDateGroup(olderDateIso);
    expect(olderGroup).toContain("Jun");
    expect(olderGroup).toContain("15");
  });

  it("handles invalid dates gracefully", () => {
    expect(formatDateGroup("invalid-date-string")).toBe("Unknown Date");
    expect(formatVersionTime("invalid-date-string")).toBe("");
    expect(formatFullDateTime("invalid-date-string")).toBe("");
  });

  it("formats time correctly", () => {
    const d = new Date(2026, 8, 10, 18, 42); // 6:42 PM
    const timeStr = formatVersionTime(d.toISOString());
    expect(timeStr).toMatch(/6:42\s*(PM|pm)/i);
  });

  it("groups versions chronologically descending into date groups", () => {
    const now = new Date();
    const today1 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 18, 42).toISOString();
    const today2 = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 14, 10).toISOString();

    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterday1 = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate(), 20, 15).toISOString();

    const oldDate = new Date(2025, 0, 1, 10, 0).toISOString();

    const versions: VersionSummary[] = [
      createMockVersion("v-4", 4, today1),
      createMockVersion("v-3", 3, today2),
      createMockVersion("v-2", 2, yesterday1),
      createMockVersion("v-1", 1, oldDate),
    ];

    const grouped = groupVersionsByDate(versions);

    expect(grouped.length).toBe(3);
    expect(grouped[0].dateGroup).toBe("Today");
    expect(grouped[0].versions.map((v) => v.id)).toEqual(["v-4", "v-3"]);

    expect(grouped[1].dateGroup).toBe("Yesterday");
    expect(grouped[1].versions.map((v) => v.id)).toEqual(["v-2"]);

    expect(grouped[2].dateGroup).toContain("Jan");
    expect(grouped[2].dateGroup).toContain("1");
    expect(grouped[2].versions.map((v) => v.id)).toEqual(["v-1"]);
  });
});
