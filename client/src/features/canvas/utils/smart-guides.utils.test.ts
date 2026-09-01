import { describe, expect, it } from "vitest";

import type { RectangleShape, GroupShape } from "../types";

import type { AABB } from "./alignment.utils";
import {
  calculateSmartGuides,
  findSmartGuideCandidates,
  type SmartGuideCandidate,
} from "./smart-guides.utils";

describe("smart-guides.utils", () => {
  it("findSmartGuideCandidates excludes moving shape and its descendants", () => {
    const group: GroupShape = {
      id: "g1",
      type: "group",
      x: 50,
      y: 50,
      width: 200,
      height: 200,
      rotation: 0,
      zIndex: 1,
      opacity: 1,
    };
    const child: RectangleShape = {
      id: "c1",
      type: "rectangle",
      x: 10,
      y: 10,
      width: 40,
      height: 40,
      parentId: "g1",
      rotation: 0,
      zIndex: 2,
      opacity: 1,
      fill: "#ffffff",
      stroke: "#000000",
      strokeWidth: 1,
    };
    const other: RectangleShape = {
      id: "o1",
      type: "rectangle",
      x: 400,
      y: 400,
      width: 50,
      height: 50,
      rotation: 0,
      zIndex: 3,
      opacity: 1,
      fill: "#ffffff",
      stroke: "#000000",
      strokeWidth: 1,
    };

    const candidates = findSmartGuideCandidates("g1", [group, child, other], new Set(["c1"]));
    expect(candidates.length).toBe(1);
    expect(candidates[0].shapeId).toBe("o1");
  });

  describe("Edge & Center Snapping", () => {
    const candidateAABBs: SmartGuideCandidate[] = [
      {
        shapeId: "s1",
        aabb: {
          minX: 100,
          minY: 100,
          maxX: 180,
          maxY: 160,
          width: 80,
          height: 60,
          centerX: 140,
          centerY: 130,
        },
      },
    ];

    it("snaps left edge to candidate left edge within threshold", () => {
      const movingAABB: AABB = {
        minX: 103, // 3px difference <= threshold 6
        minY: 300,
        maxX: 153,
        maxY: 350,
        width: 50,
        height: 50,
        centerX: 128,
        centerY: 325,
      };

      const result = calculateSmartGuides(movingAABB, candidateAABBs, 1);
      expect(result.snapDeltaX).toBe(-3);
      expect(result.guides.length).toBeGreaterThan(0);
      expect(result.guides[0].orientation).toBe("vertical");
      expect(result.guides[0].position).toBe(100);
    });

    it("snaps center X to candidate center X", () => {
      const movingAABB: AABB = {
        minX: 113,
        minY: 300,
        maxX: 163, // centerX is 138 -> candidate centerX is 140 -> diff 2
        maxY: 350,
        width: 50,
        height: 50,
        centerX: 138,
        centerY: 325,
      };

      const result = calculateSmartGuides(movingAABB, candidateAABBs, 1);
      expect(result.snapDeltaX).toBe(2);
      expect(result.guides.some((g) => g.kind === "center" && g.position === 140)).toBe(true);
    });

    it("snaps top edge to candidate top edge", () => {
      const movingAABB: AABB = {
        minX: 400,
        minY: 102, // diff 2 from candidate minY 100
        maxX: 450,
        maxY: 152,
        width: 50,
        height: 50,
        centerX: 425,
        centerY: 127,
      };

      const result = calculateSmartGuides(movingAABB, candidateAABBs, 1);
      expect(result.snapDeltaY).toBe(-2);
      expect(result.guides.some((g) => g.orientation === "horizontal" && g.position === 100)).toBe(true);
    });

    it("does not snap when distance exceeds threshold", () => {
      const movingAABB: AABB = {
        minX: 500, // far from all candidate coordinates (100, 140, 180)
        minY: 300,
        maxX: 550,
        maxY: 350,
        width: 50,
        height: 50,
        centerX: 525,
        centerY: 325,
      };

      const result = calculateSmartGuides(movingAABB, candidateAABBs, 1);
      expect(result.snapDeltaX).toBe(0);
      expect(result.guides.length).toBe(0);
    });

    it("scales threshold with zoom", () => {
      // At zoom = 2, threshold becomes 6 / 2 = 3px
      // 4px difference should NOT snap at zoom = 2
      const movingAABB: AABB = {
        minX: 500,
        minY: 104, // 4px > 3px threshold
        maxX: 550,
        maxY: 164,
        width: 50,
        height: 60,
        centerX: 525,
        centerY: 134,
      };

      const resultZoom2 = calculateSmartGuides(movingAABB, candidateAABBs, 2);
      expect(resultZoom2.snapDeltaY).toBe(0);

      // At zoom = 0.5, threshold becomes 6 / 0.5 = 12px
      // 8px difference SHOULD snap at zoom = 0.5
      const movingAABB8: AABB = {
        minX: 500,
        minY: 108, // 8px <= 12px threshold
        maxX: 550,
        maxY: 168,
        width: 50,
        height: 60,
        centerX: 525,
        centerY: 138,
      };

      const resultZoomHalf = calculateSmartGuides(movingAABB8, candidateAABBs, 0.5);
      expect(resultZoomHalf.snapDeltaY).toBe(-8);
    });

    it("hysteresis keeps snap while within release threshold", () => {
      // Candidate pos is 100. Moving pos is 108.
      // Base threshold is 6. Release threshold is 9.
      const movingAABB: AABB = {
        minX: 108,
        minY: 300,
        maxX: 158,
        maxY: 350,
        width: 50,
        height: 50,
        centerX: 133,
        centerY: 325,
      };

      // Without active snap: 8 > 6, so no snap
      const freshResult = calculateSmartGuides(movingAABB, candidateAABBs, 1);
      expect(freshResult.snapDeltaX).toBe(0);

      // With active snap on guide 'x-ll-s1': 8 <= release threshold (9), so snap is retained!
      const retainedResult = calculateSmartGuides(movingAABB, candidateAABBs, 1, {
        activeGuideX: "x-ll-s1",
      });
      expect(retainedResult.snapDeltaX).toBe(-8);
    });
  });

  describe("Equal Spacing Snapping", () => {
    // Two static shapes:
    // Left: [100, 150] (width 50, maxX 150)
    // Right: [300, 350] (width 50, minX 300)
    // Total gap = 300 - 150 = 150
    // If moving shape of width 50 is centered at x=200:
    // gapLeft = 200 - 150 = 50
    // gapRight = 300 - 250 = 50 -> equal spacing!
    const candidates: SmartGuideCandidate[] = [
      {
        shapeId: "c-left",
        aabb: { minX: 100, minY: 100, maxX: 150, maxY: 150, width: 50, height: 50, centerX: 125, centerY: 125 },
      },
      {
        shapeId: "c-right",
        aabb: { minX: 300, minY: 100, maxX: 350, maxY: 150, width: 50, height: 50, centerX: 325, centerY: 125 },
      },
    ];

    it("detects equal horizontal spacing and snaps", () => {
      // Moving shape placed near x=202 (gapLeft=52, gapRight=48, diff = -2)
      const movingAABB: AABB = {
        minX: 202,
        minY: 100,
        maxX: 252,
        maxY: 150,
        width: 50,
        height: 50,
        centerX: 227,
        centerY: 125,
      };

      const result = calculateSmartGuides(movingAABB, candidates, 1);
      expect(result.snapDeltaX).toBe(-2);
      expect(result.guides.some((g) => g.kind === "spacing")).toBe(true);
    });
  });
});
