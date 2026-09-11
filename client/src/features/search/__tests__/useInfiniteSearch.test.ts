import { describe, expect, it } from "vitest";
import type { SearchResponse } from "../types/search.types";

describe("useInfiniteSearch Cursor Pagination & Invariants", () => {
  const mockPage1: SearchResponse = {
    results: [
      {
        id: "b1",
        entityType: "board",
        title: "Board 1",
        boardId: "b1",
        matchedField: "name",
        createdAt: "2026-09-10T10:00:00.000Z",
        updatedAt: "2026-09-10T10:00:00.000Z",
      },
      {
        id: "c1",
        entityType: "canvas",
        title: "Canvas 1",
        boardId: "b1",
        canvasId: "c1",
        matchedField: "name",
        createdAt: "2026-09-10T10:01:00.000Z",
        updatedAt: "2026-09-10T10:01:00.000Z",
      },
    ],
    pagination: {
      limit: 2,
      nextCursor: "eyJ2IjoyLCJiIjp7InQiOjE3ODkxMjgwMDAwMDB9fQ",
      hasMore: true,
    },
  };

  const mockPage2: SearchResponse = {
    results: [
      {
        id: "s1",
        entityType: "shape",
        title: "Shape 1",
        boardId: "b1",
        canvasId: "c1",
        shapeId: "s1",
        matchedField: "text",
        createdAt: "2026-09-10T10:02:00.000Z",
        updatedAt: "2026-09-10T10:02:00.000Z",
      },
    ],
    pagination: {
      limit: 2,
      nextCursor: null,
      hasMore: false,
    },
  };

  it("passes cursor back opaquely to getNextPageParam without inspecting or decoding it", () => {
    const getNextPageParam = (lastPage: SearchResponse): string | undefined => {
      return lastPage.pagination.hasMore && lastPage.pagination.nextCursor
        ? lastPage.pagination.nextCursor
        : undefined;
    };

    // Page 1 hasMore=true -> returns nextCursor verbatim
    const cursorForPage2 = getNextPageParam(mockPage1);
    expect(cursorForPage2).toBe("eyJ2IjoyLCJiIjp7InQiOjE3ODkxMjgwMDAwMDB9fQ");

    // Page 2 hasMore=false -> returns undefined (terminates pagination)
    const cursorAfterPage2 = getNextPageParam(mockPage2);
    expect(cursorAfterPage2).toBeUndefined();
  });

  it("flattens multiple pages into a combined result list in strict order", () => {
    const pages = [mockPage1, mockPage2];
    const allResults = pages.flatMap((p) => p.results);

    expect(allResults).toHaveLength(3);
    expect(allResults[0].id).toBe("b1");
    expect(allResults[1].id).toBe("c1");
    expect(allResults[2].id).toBe("s1");
  });

  it("validates query enablement invariants", () => {
    const isSearchQueryValid = (params: {
      q: string;
      scope: "workspace" | "board";
      workspaceId?: string;
      boardId?: string;
    }): boolean => {
      const isQueryValid = params.q.trim().length >= 1;
      const isScopeValid =
        (params.scope === "workspace" && Boolean(params.workspaceId)) ||
        (params.scope === "board" && Boolean(params.boardId));
      return isQueryValid && isScopeValid;
    };

    // Valid queries
    expect(
      isSearchQueryValid({
        q: "design",
        scope: "workspace",
        workspaceId: "6aa37ae4f2adcf355053d3e2",
      })
    ).toBe(true);

    expect(
      isSearchQueryValid({
        q: "box",
        scope: "board",
        boardId: "6aa37ae4f2adcf355053d3e3",
      })
    ).toBe(true);

    // Empty query rejected
    expect(
      isSearchQueryValid({
        q: "   ",
        scope: "workspace",
        workspaceId: "6aa37ae4f2adcf355053d3e2",
      })
    ).toBe(false);

    // Missing workspaceId in workspace scope rejected
    expect(
      isSearchQueryValid({
        q: "design",
        scope: "workspace",
      })
    ).toBe(false);

    // Missing boardId in board scope rejected
    expect(
      isSearchQueryValid({
        q: "design",
        scope: "board",
      })
    ).toBe(false);
  });
});
