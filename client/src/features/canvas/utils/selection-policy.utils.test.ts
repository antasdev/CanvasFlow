import { describe, expect, it } from "vitest";
import {
  getSelectableShapes,
  resolveGroupHit,
  enforceGroupHierarchyInvariant,
  resolveSelectionWithModifiers,
  resolveSelectAll,
  filterCandidateShapes,
} from "./selection-policy.utils";
import type { RectangleShape, GroupShape, StarShape, Shape } from "../types";

describe("selection-policy.utils", () => {
  const rect1: RectangleShape = {
    id: "r1",
    type: "rectangle",
    x: 10,
    y: 10,
    width: 50,
    height: 50,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    fill: "#fff",
    stroke: "#000",
    strokeWidth: 1,
  };

  const groupB: GroupShape = {
    id: "group-b",
    type: "group",
    parentId: "group-a",
    x: 100,
    y: 100,
    width: 100,
    height: 100,
    rotation: 0,
    opacity: 1,
    zIndex: 2,
  };

  const starChild: StarShape = {
    id: "star-1",
    type: "star",
    parentId: "group-b",
    x: 10,
    y: 10,
    width: 40,
    height: 40,
    rotation: 0,
    opacity: 1,
    zIndex: 3,
    fill: "#fff",
    stroke: "#000",
    strokeWidth: 1,
  };

  const groupA: GroupShape = {
    id: "group-a",
    type: "group",
    x: 100,
    y: 100,
    width: 200,
    height: 200,
    rotation: 0,
    opacity: 1,
    zIndex: 4,
  };

  const shapes: Shape[] = [rect1, groupA, groupB, starChild];

  describe("getSelectableShapes", () => {
    it("returns only root shapes when editingGroupId is null", () => {
      const selectable = getSelectableShapes(shapes, null);
      expect(selectable.map((s) => s.id).sort()).toEqual(["group-a", "r1"].sort());
    });

    it("returns direct children of active group when editingGroupId is set", () => {
      const selectableInA = getSelectableShapes(shapes, "group-a");
      expect(selectableInA.map((s) => s.id)).toEqual(["group-b"]);

      const selectableInB = getSelectableShapes(shapes, "group-b");
      expect(selectableInB.map((s) => s.id)).toEqual(["star-1"]);
    });
  });

  describe("resolveGroupHit", () => {
    it("resolves nested descendant (star-1) to root group-a when at root canvas scope", () => {
      const resolved = resolveGroupHit("star-1", shapes, null);
      expect(resolved).toBe("group-a");
    });

    it("resolves direct root shape to itself", () => {
      expect(resolveGroupHit("r1", shapes, null)).toBe("r1");
      expect(resolveGroupHit("group-a", shapes, null)).toBe("group-a");
    });

    it("resolves star-1 to group-b when editing group-a", () => {
      const resolved = resolveGroupHit("star-1", shapes, "group-a");
      expect(resolved).toBe("group-b");
    });

    it("resolves star-1 to itself when editing group-b", () => {
      const resolved = resolveGroupHit("star-1", shapes, "group-b");
      expect(resolved).toBe("star-1");
    });

    it("returns null for shapes outside the current editing group scope", () => {
      // r1 is at root, so when editing group-a, hitting r1 is outside scope
      expect(resolveGroupHit("r1", shapes, "group-a")).toBeNull();
    });
  });

  describe("enforceGroupHierarchyInvariant", () => {
    it("prunes descendants if an ancestor group is selected", () => {
      const raw = ["group-a", "star-1", "r1"];
      const pruned = enforceGroupHierarchyInvariant(raw, shapes);
      expect(pruned.sort()).toEqual(["group-a", "r1"].sort());
    });

    it("prunes child when group-b and star-1 are selected", () => {
      const raw = ["group-b", "star-1"];
      const pruned = enforceGroupHierarchyInvariant(raw, shapes);
      expect(pruned).toEqual(["group-b"]);
    });

    it("keeps independent shapes untouched", () => {
      const raw = ["r1", "group-a"];
      const result = enforceGroupHierarchyInvariant(raw, shapes);
      expect(result.sort()).toEqual(["group-a", "r1"].sort());
    });
  });

  describe("resolveSelectionWithModifiers", () => {
    it("replaces selection in replace mode", () => {
      const result = resolveSelectionWithModifiers({
        currentSelectedIds: ["r1"],
        hitIds: ["star-1"],
        mode: "replace",
        shapes,
        editingGroupId: null,
      });
      // star-1 resolves to root group-a
      expect(result).toEqual(["group-a"]);
    });

    it("unions selection in add mode", () => {
      const result = resolveSelectionWithModifiers({
        currentSelectedIds: ["r1"],
        hitIds: ["group-a"],
        mode: "add",
        shapes,
        editingGroupId: null,
      });
      expect(result.sort()).toEqual(["group-a", "r1"].sort());
    });

    it("toggles selection in toggle mode", () => {
      // Toggling an already selected shape removes it
      const result1 = resolveSelectionWithModifiers({
        currentSelectedIds: ["r1", "group-a"],
        hitIds: ["r1"],
        mode: "toggle",
        shapes,
        editingGroupId: null,
      });
      expect(result1).toEqual(["group-a"]);

      // Toggling an unselected shape adds it
      const result2 = resolveSelectionWithModifiers({
        currentSelectedIds: ["group-a"],
        hitIds: ["r1"],
        mode: "toggle",
        shapes,
        editingGroupId: null,
      });
      expect(result2.sort()).toEqual(["group-a", "r1"].sort());
    });
  });

  describe("resolveSelectAll", () => {
    it("selects only root shapes when at canvas root", () => {
      const all = resolveSelectAll(shapes, null);
      expect(all.sort()).toEqual(["group-a", "r1"].sort());
    });

    it("selects only direct children when inside a group", () => {
      const allInA = resolveSelectAll(shapes, "group-a");
      expect(allInA).toEqual(["group-b"]);
    });
  });

  describe("filterCandidateShapes (Broad-Phase)", () => {
    it("filters candidate shapes overlapping the selection AABB", () => {
      // Selection box covering (0,0) to (70, 70) touches r1 at (10, 10, 50, 50)
      const selectionAABB = {
        minX: 0,
        minY: 0,
        maxX: 70,
        maxY: 70,
        width: 70,
        height: 70,
        centerX: 35,
        centerY: 35,
      };

      const candidates = filterCandidateShapes(shapes, selectionAABB, null);
      expect(candidates.map((s) => s.id)).toEqual(["r1"]);
    });

    it("excludes shapes completely outside the selection AABB", () => {
      const selectionAABB = {
        minX: 500,
        minY: 500,
        maxX: 600,
        maxY: 600,
        width: 100,
        height: 100,
        centerX: 550,
        centerY: 550,
      };
      const candidates = filterCandidateShapes(shapes, selectionAABB, null);
      expect(candidates).toHaveLength(0);
    });
  });
});
