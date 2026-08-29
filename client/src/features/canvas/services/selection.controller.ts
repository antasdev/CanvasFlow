import type {
  Shape,
  SelectionPoint,
  SelectionMode,
  MarqueeState,
  LassoState,
  MarqueeDirection,
  SelectionMatchMode,
} from "../types";
import {
  marqueeToPolygon,
  getShapeGeometryInWorld,
  hitTestShapeGeometry,
} from "../utils/selection-geometry.utils";
import {
  filterCandidateShapes,
  resolveSelectionWithModifiers,
  resolveGroupHit,
} from "../utils/selection-policy.utils";
import type { AABB } from "../utils/alignment.utils";
import type { PresenceActivity } from "@/services/socket";

export type SelectionControllerState = {
  marquee: MarqueeState | null;
  lasso: LassoState | null;
  isSelecting: boolean;
};

export type SelectionControllerOptions = {
  getShapes: () => Shape[];
  getSelectedShapeIds: () => string[];
  getEditingGroupId: () => string | null;
  getActiveTool: () => string;
  setSelectedShapeIds: (ids: string[]) => void;
  clearSelection: () => void;
  exitGroup: () => void;
  onActivity?: (activity: PresenceActivity) => void;
};

export class SelectionController {
  private marqueeState: MarqueeState | null = null;
  private lassoState: LassoState | null = null;
  private isSelectingState = false;
  private startPoint: SelectionPoint | null = null;
  private hasMoved = false;
  private selectionMode: SelectionMode = "replace";
  private readonly options: SelectionControllerOptions;

  constructor(options: SelectionControllerOptions) {
    this.options = options;
  }

  public get state(): SelectionControllerState {
    return {
      marquee: this.marqueeState,
      lasso: this.lassoState,
      isSelecting: this.isSelectingState,
    };
  }

  public getMarquee(): MarqueeState | null {
    return this.marqueeState;
  }

  public getLasso(): LassoState | null {
    return this.lassoState;
  }

  public isSelecting(): boolean {
    return this.isSelectingState;
  }

  /**
   * Starts marquee or lasso selection.
   */
  public startSelection(
    worldPoint: SelectionPoint,
    mode: SelectionMode = "replace"
  ): boolean {
    const activeTool = this.options.getActiveTool();
    this.selectionMode = mode;
    this.startPoint = { x: worldPoint.x, y: worldPoint.y };
    this.hasMoved = false;

    if (activeTool === "lasso") {
      this.isSelectingState = true;
      this.lassoState = {
        points: [{ x: worldPoint.x, y: worldPoint.y }],
      };
      return true;
    }

    if (activeTool === "select") {
      this.isSelectingState = true;
      this.marqueeState = {
        startX: worldPoint.x,
        startY: worldPoint.y,
        currentX: worldPoint.x,
        currentY: worldPoint.y,
        direction: "left-to-right",
        matchMode: "containment",
      };
      return true;
    }

    return false;
  }

  /**
   * Updates marquee or lasso preview as the pointer moves.
   */
  public updateSelection(worldPoint: SelectionPoint): void {
    if (!this.isSelectingState || !this.startPoint) {
      return;
    }

    const dx = worldPoint.x - this.startPoint.x;
    const dy = worldPoint.y - this.startPoint.y;
    if (Math.hypot(dx, dy) > 3) {
      this.hasMoved = true;
    }

    const activeTool = this.options.getActiveTool();

    if (activeTool === "lasso" && this.lassoState) {
      this.options.onActivity?.("selecting");
      const last = this.lassoState.points[this.lassoState.points.length - 1];
      if (!last || Math.hypot(worldPoint.x - last.x, worldPoint.y - last.y) >= 3) {
        this.lassoState = {
          points: [...this.lassoState.points, { x: worldPoint.x, y: worldPoint.y }],
        };
      }
      return;
    }

    if (activeTool === "select" && this.marqueeState) {
      this.options.onActivity?.("selecting");
      const direction: MarqueeDirection =
        worldPoint.x >= this.startPoint.x ? "left-to-right" : "right-to-left";
      const matchMode: SelectionMatchMode =
        direction === "left-to-right" ? "containment" : "intersection";

      this.marqueeState = {
        ...this.marqueeState,
        currentX: worldPoint.x,
        currentY: worldPoint.y,
        direction,
        matchMode,
      };
    }
  }

  /**
   * Concludes selection on pointer up, applying Stage 1 & Stage 2 hit tests and Selection Policy.
   */
  public endSelection(): void {
    if (!this.isSelectingState) {
      return;
    }

    this.isSelectingState = false;
    const mode = this.selectionMode;
    const hasMoved = this.hasMoved;
    const shapes = this.options.getShapes();
    const selectedShapeIds = this.options.getSelectedShapeIds();
    const editingGroupId = this.options.getEditingGroupId();

    // 1. Resolve Marquee
    if (this.marqueeState) {
      const marquee = this.marqueeState;
      this.marqueeState = null;

      // Click on empty canvas without drag
      if (!hasMoved) {
        if (mode === "replace") {
          if (editingGroupId) {
            this.options.exitGroup();
          }
          this.options.clearSelection();
        }
        return;
      }

      const marqueePoly = marqueeToPolygon(marquee);
      const minX = Math.min(marquee.startX, marquee.currentX);
      const maxX = Math.max(marquee.startX, marquee.currentX);
      const minY = Math.min(marquee.startY, marquee.currentY);
      const maxY = Math.max(marquee.startY, marquee.currentY);

      const marqueeAABB: AABB = {
        minX,
        minY,
        maxX,
        maxY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
      };

      // Stage 1 Broad-Phase filter
      const candidates = filterCandidateShapes(shapes, marqueeAABB, editingGroupId);

      // Stage 2 Narrow-Phase geometry test
      const hitIds: string[] = [];
      for (const candidate of candidates) {
        const geom = getShapeGeometryInWorld(candidate, shapes);
        if (hitTestShapeGeometry(geom, marqueePoly, marquee.matchMode)) {
          hitIds.push(candidate.id);
        }
      }

      // Selection Policy resolution
      const resolved = resolveSelectionWithModifiers({
        currentSelectedIds: selectedShapeIds,
        hitIds,
        mode,
        shapes,
        editingGroupId,
      });

      this.options.setSelectedShapeIds(resolved);
      return;
    }

    // 2. Resolve Lasso
    if (this.lassoState) {
      const lasso = this.lassoState;
      this.lassoState = null;

      if (lasso.points.length < 3 || !hasMoved) {
        return;
      }

      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;

      for (const pt of lasso.points) {
        if (pt.x < minX) minX = pt.x;
        if (pt.x > maxX) maxX = pt.x;
        if (pt.y < minY) minY = pt.y;
        if (pt.y > maxY) maxY = pt.y;
      }

      if (maxX - minX < 3 && maxY - minY < 3) {
        return;
      }

      const lassoAABB: AABB = {
        minX,
        minY,
        maxX,
        maxY,
        width: Math.max(1, maxX - minX),
        height: Math.max(1, maxY - minY),
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
      };

      // Stage 1 Broad-Phase filter
      const candidates = filterCandidateShapes(shapes, lassoAABB, editingGroupId);

      // Stage 2 Narrow-Phase geometry test
      const hitIds: string[] = [];
      for (const candidate of candidates) {
        const geom = getShapeGeometryInWorld(candidate, shapes);
        if (hitTestShapeGeometry(geom, lasso.points, "intersection")) {
          hitIds.push(candidate.id);
        }
      }

      // Selection Policy resolution
      const resolved = resolveSelectionWithModifiers({
        currentSelectedIds: selectedShapeIds,
        hitIds,
        mode,
        shapes,
        editingGroupId,
      });

      this.options.setSelectedShapeIds(resolved);
    }
  }

  /**
   * Handles click selection on a shape directly.
   */
  public handleShapeClick(shapeId: string, mode: SelectionMode = "replace"): void {
    const shapes = this.options.getShapes();
    const editingGroupId = this.options.getEditingGroupId();
    const selectedShapeIds = this.options.getSelectedShapeIds();

    const resolvedTarget = resolveGroupHit(shapeId, shapes, editingGroupId);
    if (!resolvedTarget) {
      return;
    }

    const resolved = resolveSelectionWithModifiers({
      currentSelectedIds: selectedShapeIds,
      hitIds: [resolvedTarget],
      mode,
      shapes,
      editingGroupId,
    });

    this.options.setSelectedShapeIds(resolved);
  }
}
