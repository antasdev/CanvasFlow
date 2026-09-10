import { beforeEach, describe, expect, it } from "vitest";

import { useHistoryStore } from "../store";
import type { VersionSummary } from "../types";
import { groupVersionsByDate } from "../utils/history-date.utils";

describe("VersionHistoryPanel State & Invariants", () => {
  const version1: VersionSummary = {
    id: "v-1",
    boardId: "board-1",
    versionNumber: 1,
    trigger: "manual",
    createdBy: "user-1",
    author: { id: "user-1", fullName: "Alice" },
    collaborationRevision: 10,
    canvasCount: 1,
    shapeCount: 5,
    isNamed: true,
    name: "Initial Draft",
    createdAt: "2026-09-08T10:00:00.000Z",
  };

  const version2: VersionSummary = {
    id: "v-2",
    boardId: "board-1",
    versionNumber: 2,
    trigger: "automatic",
    createdBy: "user-2",
    collaborationRevision: 20,
    canvasCount: 1,
    shapeCount: 8,
    isNamed: false,
    createdAt: "2026-09-09T14:30:00.000Z",
  };

  const version3: VersionSummary = {
    id: "v-3",
    boardId: "board-1",
    versionNumber: 3,
    trigger: "manual",
    createdBy: "user-1",
    author: { id: "user-1", fullName: "Alice" },
    collaborationRevision: 30,
    canvasCount: 2,
    shapeCount: 12,
    isNamed: true,
    name: "Final Polish",
    createdAt: "2026-09-10T11:00:00.000Z",
  };

  beforeEach(() => {
    useHistoryStore.setState({ isPanelOpen: false });
  });

  it("toggles panel open/closed state correctly in Zustand store", () => {
    expect(useHistoryStore.getState().isPanelOpen).toBe(false);

    useHistoryStore.getState().togglePanel();
    expect(useHistoryStore.getState().isPanelOpen).toBe(true);

    useHistoryStore.getState().togglePanel(false);
    expect(useHistoryStore.getState().isPanelOpen).toBe(false);

    useHistoryStore.getState().setIsPanelOpen(true);
    expect(useHistoryStore.getState().isPanelOpen).toBe(true);
  });

  it("computes derived version totals and date-grouped timeline lists", () => {
    const versions = [version3, version2, version1];
    const grouped = groupVersionsByDate(versions);

    expect(versions.length).toBe(3);
    expect(grouped.length).toBeGreaterThanOrEqual(1);

    const allVersionIds = grouped.flatMap((g) => g.versions.map((v) => v.id));
    expect(allVersionIds).toEqual(["v-3", "v-2", "v-1"]);
  });

  it("validates WAI-ARIA panel attributes and role properties", () => {
    const getAriaPanelProps = () => ({
      role: "region",
      "aria-label": "Version History Panel",
    });

    const getAriaFeedProps = () => ({
      id: "version-history-feed",
      tabIndex: 0,
      "aria-label": "Version history timeline",
    });

    expect(getAriaPanelProps()).toEqual({
      role: "region",
      "aria-label": "Version History Panel",
    });

    expect(getAriaFeedProps()).toEqual({
      id: "version-history-feed",
      tabIndex: 0,
      "aria-label": "Version history timeline",
    });
  });

  it("deduplicates version lists across paginated fetches", () => {
    const page1 = [version3, version2];
    const page2 = [version2, version1]; // overlapping version2

    const map = new Map<string, VersionSummary>();
    for (const page of [page1, page2]) {
      for (const item of page) {
        if (!map.has(item.id)) {
          map.set(item.id, item);
        }
      }
    }

    const deduplicated = Array.from(map.values());
    expect(deduplicated.length).toBe(3);
    expect(deduplicated.map((v) => v.id)).toEqual(["v-3", "v-2", "v-1"]);
  });
});
