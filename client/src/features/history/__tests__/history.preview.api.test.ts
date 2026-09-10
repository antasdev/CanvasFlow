import { afterEach, describe, expect, it, vi } from "vitest";

import { api } from "@/services/api";

import { historyApi } from "../api";
import type { VersionDetail } from "../types";

describe("History API - getVersionById", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches single historical version snapshot with correct endpoint", async () => {
    const mockDetail: VersionDetail = {
      id: "ver-100",
      boardId: "board-1",
      versionNumber: 100,
      trigger: "manual",
      createdBy: "usr-1",
      collaborationRevision: 50,
      canvasCount: 1,
      shapeCount: 2,
      isNamed: true,
      name: "Milestone v100",
      createdAt: "2026-09-10T12:00:00.000Z",
      snapshot: {
        canvases: [
          {
            canvasId: "c-1",
            name: "Page 1",
            order: 0,
            backgroundColor: "#ffffff",
            shapes: [
              {
                id: "shape-1",
                canvasId: "c-1",
                type: "rectangle",
                x: 10,
                y: 20,
                width: 100,
                height: 100,
              },
            ],
          },
        ],
        shapeCount: 1,
      },
    };

    const getSpy = vi.spyOn(api, "get").mockResolvedValueOnce({
      data: {
        success: true,
        data: mockDetail,
      },
    });

    const result = await historyApi.getVersionById("board-1", "ver-100");

    expect(getSpy).toHaveBeenCalledTimes(1);
    expect(getSpy).toHaveBeenCalledWith("/boards/board-1/versions/ver-100");
    expect(result.id).toBe("ver-100");
    expect(result.versionNumber).toBe(100);
    expect(result.snapshot.canvases).toHaveLength(1);
    expect(result.snapshot.canvases[0].shapes).toHaveLength(1);
  });

  it("propagates network and API errors cleanly", async () => {
    vi.spyOn(api, "get").mockRejectedValueOnce(
      new Error("Version 404 Not Found")
    );

    await expect(
      historyApi.getVersionById("board-1", "non-existent")
    ).rejects.toThrow("Version 404 Not Found");
  });
});
