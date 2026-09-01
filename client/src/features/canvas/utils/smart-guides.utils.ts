import type { Shape } from "../types";

import { getShapeWorldAABB, type AABB } from "./alignment.utils";

export type SmartGuideOrientation = "horizontal" | "vertical";

export type SmartGuideKind = "edge" | "center" | "spacing";

export type SmartGuide = {
  id: string;
  orientation: SmartGuideOrientation;
  position: number; // for vertical guide: x; for horizontal guide: y
  start: number; // along perpendicular axis
  end: number; // along perpendicular axis
  kind: SmartGuideKind;
  label?: string; // optional badge for equal spacing (e.g. "20px")
};

export type SmartGuideCandidate = {
  shapeId: string;
  aabb: AABB;
};

export const BASE_SMART_GUIDE_THRESHOLD = 6;

/**
 * Filters shapes to candidate obstacles for smart-guide snapping.
 * Excludes moving shape, its descendants, and invisible shapes.
 * Complexity: O(N) candidate scan.
 */
export function findSmartGuideCandidates(
  movingShapeId: string,
  allShapes: Shape[],
  descendantIds?: Set<string>
): SmartGuideCandidate[] {
  const excluded = descendantIds ? new Set(descendantIds) : new Set<string>();
  excluded.add(movingShapeId);

  const candidates: SmartGuideCandidate[] = [];

  for (const s of allShapes) {
    if (excluded.has(s.id)) continue;
    // Don't compare against child shapes of a group if the group itself is a candidate,
    // or include shapes directly.
    const aabb = getShapeWorldAABB(s, allShapes);
    candidates.push({
      shapeId: s.id,
      aabb,
    });
  }

  return candidates;
}

type SnapCandidateX = {
  guideId: string;
  position: number;
  snapDeltaX: number;
  kind: SmartGuideKind;
  targetY1: number;
  targetY2: number;
};

type SnapCandidateY = {
  guideId: string;
  position: number;
  snapDeltaY: number;
  kind: SmartGuideKind;
  targetX1: number;
  targetX2: number;
};

/**
 * Calculates smart guides and snap adjustments for a moving bounding box against static candidates.
 * Applies zoom-aware thresholds and hysteresis.
 */
export function calculateSmartGuides(
  movingAABB: AABB,
  candidates: SmartGuideCandidate[],
  zoom = 1,
  activeSnapState?: { activeGuideX?: string; activeGuideY?: string }
): {
  guides: SmartGuide[];
  snapDeltaX: number;
  snapDeltaY: number;
  matchedGuideX?: string;
  matchedGuideY?: string;
} {
  const snapThreshold = BASE_SMART_GUIDE_THRESHOLD / Math.max(0.1, zoom);
  const releaseThreshold = snapThreshold * 1.5;

  let bestX: SnapCandidateX | null = null;
  let bestY: SnapCandidateY | null = null;

  const movingLeft = movingAABB.minX;
  const movingCenterX = movingAABB.centerX;
  const movingRight = movingAABB.maxX;

  const movingTop = movingAABB.minY;
  const movingCenterY = movingAABB.centerY;
  const movingBottom = movingAABB.maxY;

  // 1. Edge & Center alignment detection
  for (const c of candidates) {
    const ca = c.aabb;

    // --- Vertical Guides (X-axis alignment: left, center, right) ---
    const xChecks: Array<{
      guideId: string;
      candPos: number;
      movingPos: number;
      kind: SmartGuideKind;
    }> = [
      { guideId: `x-ll-${c.shapeId}`, candPos: ca.minX, movingPos: movingLeft, kind: "edge" },
      { guideId: `x-cc-${c.shapeId}`, candPos: ca.centerX, movingPos: movingCenterX, kind: "center" },
      { guideId: `x-rr-${c.shapeId}`, candPos: ca.maxX, movingPos: movingRight, kind: "edge" },
      { guideId: `x-lr-${c.shapeId}`, candPos: ca.maxX, movingPos: movingLeft, kind: "edge" },
      { guideId: `x-rl-${c.shapeId}`, candPos: ca.minX, movingPos: movingRight, kind: "edge" },
    ];

    for (const check of xChecks) {
      const diff = check.candPos - check.movingPos;
      const absDiff = Math.abs(diff);
      const isRetained = activeSnapState?.activeGuideX === check.guideId;
      const threshold = isRetained ? releaseThreshold : snapThreshold;

      if (absDiff <= threshold) {
        if (!bestX || absDiff < Math.abs(bestX.snapDeltaX)) {
          bestX = {
            guideId: check.guideId,
            position: check.candPos,
            snapDeltaX: diff,
            kind: check.kind,
            targetY1: Math.min(movingAABB.minY, ca.minY),
            targetY2: Math.max(movingAABB.maxY, ca.maxY),
          };
        }
      }
    }

    // --- Horizontal Guides (Y-axis alignment: top, center, bottom) ---
    const yChecks: Array<{
      guideId: string;
      candPos: number;
      movingPos: number;
      kind: SmartGuideKind;
    }> = [
      { guideId: `y-tt-${c.shapeId}`, candPos: ca.minY, movingPos: movingTop, kind: "edge" },
      { guideId: `y-cc-${c.shapeId}`, candPos: ca.centerY, movingPos: movingCenterY, kind: "center" },
      { guideId: `y-bb-${c.shapeId}`, candPos: ca.maxY, movingPos: movingBottom, kind: "edge" },
      { guideId: `y-tb-${c.shapeId}`, candPos: ca.maxY, movingPos: movingTop, kind: "edge" },
      { guideId: `y-bt-${c.shapeId}`, candPos: ca.minY, movingPos: movingBottom, kind: "edge" },
    ];

    for (const check of yChecks) {
      const diff = check.candPos - check.movingPos;
      const absDiff = Math.abs(diff);
      const isRetained = activeSnapState?.activeGuideY === check.guideId;
      const threshold = isRetained ? releaseThreshold : snapThreshold;

      if (absDiff <= threshold) {
        if (!bestY || absDiff < Math.abs(bestY.snapDeltaY)) {
          bestY = {
            guideId: check.guideId,
            position: check.candPos,
            snapDeltaY: diff,
            kind: check.kind,
            targetX1: Math.min(movingAABB.minX, ca.minX),
            targetX2: Math.max(movingAABB.maxX, ca.maxX),
          };
        }
      }
    }
  }

  // 2. Equal Spacing Detection (between two neighbor candidates)
  // Check if moving shape is equidistant between two candidates or creates equal adjacent gap
  if (!bestX && candidates.length >= 2) {
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const c1 = candidates[i].aabb;
        const c2 = candidates[j].aabb;

        // Ensure c1 is to the left of c2
        const [leftC, rightC] = c1.minX < c2.minX ? [c1, c2] : [c2, c1];

        // Case A: Moving shape is between leftC and rightC
        if (movingAABB.minX > leftC.maxX && movingAABB.maxX < rightC.minX) {
          const gapLeft = movingAABB.minX - leftC.maxX;
          const gapRight = rightC.minX - movingAABB.maxX;
          const diff = (gapRight - gapLeft) / 2;
          if (Math.abs(diff) <= snapThreshold) {
            const snapDeltaX = diff;
            bestX = {
              guideId: `spacing-x-${leftC.minX}-${rightC.minX}`,
              position: movingAABB.centerX + snapDeltaX,
              snapDeltaX,
              kind: "spacing",
              targetY1: Math.min(leftC.minY, rightC.minY, movingAABB.minY),
              targetY2: Math.max(leftC.maxY, rightC.maxY, movingAABB.maxY),
            };
          }
        }
      }
    }
  }

  if (!bestY && candidates.length >= 2) {
    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const c1 = candidates[i].aabb;
        const c2 = candidates[j].aabb;

        const [topC, bottomC] = c1.minY < c2.minY ? [c1, c2] : [c2, c1];

        if (movingAABB.minY > topC.maxY && movingAABB.maxY < bottomC.minY) {
          const gapTop = movingAABB.minY - topC.maxY;
          const gapBottom = bottomC.minY - movingAABB.maxY;
          const diff = (gapBottom - gapTop) / 2;
          if (Math.abs(diff) <= snapThreshold) {
            const snapDeltaY = diff;
            bestY = {
              guideId: `spacing-y-${topC.minY}-${bottomC.minY}`,
              position: movingAABB.centerY + snapDeltaY,
              snapDeltaY,
              kind: "spacing",
              targetX1: Math.min(topC.minX, bottomC.minX, movingAABB.minX),
              targetX2: Math.max(topC.maxX, bottomC.maxX, movingAABB.maxX),
            };
          }
        }
      }
    }
  }

  const guides: SmartGuide[] = [];
  const margin = 20 / Math.max(0.1, zoom);

  if (bestX) {
    guides.push({
      id: bestX.guideId,
      orientation: "vertical",
      position: bestX.position,
      start: bestX.targetY1 - margin,
      end: bestX.targetY2 + margin,
      kind: bestX.kind,
    });
  }

  if (bestY) {
    guides.push({
      id: bestY.guideId,
      orientation: "horizontal",
      position: bestY.position,
      start: bestY.targetX1 - margin,
      end: bestY.targetX2 + margin,
      kind: bestY.kind,
    });
  }

  return {
    guides,
    snapDeltaX: bestX ? bestX.snapDeltaX : 0,
    snapDeltaY: bestY ? bestY.snapDeltaY : 0,
    matchedGuideX: bestX ? bestX.guideId : undefined,
    matchedGuideY: bestY ? bestY.guideId : undefined,
  };
}
