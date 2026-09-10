import { describe, expect, it } from "vitest";

import { HISTORY_QUERY_KEYS } from "../hooks/useVersionHistory";
import type { VersionListResponse } from "../types";

describe("useVersionHistory Query Keys & Pagination Logic", () => {
  it("constructs stable board-scoped query keys", () => {
    expect(HISTORY_QUERY_KEYS.all).toEqual(["versions"]);
    expect(HISTORY_QUERY_KEYS.boardVersions("board-123")).toEqual([
      "boards",
      "board-123",
      "versions",
    ]);
  });

  it("determines next page parameter from API pagination meta", () => {
    const getNextPageParam = (
      lastPage: VersionListResponse
    ): number | undefined => {
      return lastPage.pagination.hasMore
        ? lastPage.pagination.nextCursor
        : undefined;
    };

    const pageWithMore: VersionListResponse = {
      items: [],
      pagination: {
        hasMore: true,
        nextCursor: 42,
        totalCount: 100,
      },
    };

    const lastPage: VersionListResponse = {
      items: [],
      pagination: {
        hasMore: false,
        nextCursor: undefined,
        totalCount: 100,
      },
    };

    expect(getNextPageParam(pageWithMore)).toBe(42);
    expect(getNextPageParam(lastPage)).toBeUndefined();
  });

  it("ensures board isolation by preventing cross-board cache collisions", () => {
    const keyBoardA = HISTORY_QUERY_KEYS.boardVersions("board-A");
    const keyBoardB = HISTORY_QUERY_KEYS.boardVersions("board-B");

    expect(keyBoardA).not.toEqual(keyBoardB);
    expect(keyBoardA[1]).toBe("board-A");
    expect(keyBoardB[1]).toBe("board-B");
  });
});
