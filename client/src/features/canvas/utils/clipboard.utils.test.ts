import { describe, it, expect } from "vitest";
import type { RectangleShape, CircleShape, GroupShape, ConnectorShape } from "../types";
import {
  extractClipboardSceneGraph,
  cloneSceneGraphWithNewIds,
  validateClipboardPayload,
} from "./clipboard.utils";
import { CLIPBOARD_VERSION } from "../types/clipboard.types";

function createRect(id: string, x: number, y: number, parentId: string | null = null): RectangleShape {
  return {
    id,
    type: "rectangle",
    x,
    y,
    width: 100,
    height: 80,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    fill: "#3b82f6",
    stroke: "#1d4ed8",
    strokeWidth: 2,
    parentId,
  };
}

function createCircle(id: string, x: number, y: number, parentId: string | null = null): CircleShape {
  return {
    id,
    type: "circle",
    x,
    y,
    width: 60,
    height: 60,
    rotation: 0,
    opacity: 1,
    zIndex: 2,
    fill: "#10b981",
    stroke: "#047857",
    strokeWidth: 2,
    parentId,
  };
}

function createGroup(id: string, x: number, y: number, parentId: string | null = null): GroupShape {
  return {
    id,
    type: "group",
    x,
    y,
    width: 200,
    height: 200,
    rotation: 0,
    opacity: 1,
    zIndex: 3,
    parentId,
  };
}

describe("clipboard.utils", () => {
  describe("extractClipboardSceneGraph", () => {
    it("extracts a single root shape", () => {
      const r1 = createRect("r1", 50, 50);
      const extracted = extractClipboardSceneGraph(["r1"], [r1]);
      expect(extracted).toHaveLength(1);
      expect(extracted[0].id).toBe("r1");
    });

    it("extracts entire group with all descendants", () => {
      const g1 = createGroup("g1", 100, 100);
      const c1 = createRect("c1", 10, 10, "g1");
      const c2 = createCircle("c2", 80, 80, "g1");
      const all = [g1, c1, c2];

      const extracted = extractClipboardSceneGraph(["g1"], all);
      expect(extracted).toHaveLength(3);
      const extractedIds = extracted.map((s) => s.id);
      expect(extractedIds).toContain("g1");
      expect(extractedIds).toContain("c1");
      expect(extractedIds).toContain("c2");
    });

    it("extracts nested groups and deep descendants", () => {
      const gParent = createGroup("gParent", 100, 100);
      const gChild = createGroup("gChild", 20, 20, "gParent");
      const leaf = createRect("leaf", 5, 5, "gChild");
      const all = [gParent, gChild, leaf];

      const extracted = extractClipboardSceneGraph(["gParent"], all);
      expect(extracted).toHaveLength(3);
      const extractedIds = extracted.map((s) => s.id);
      expect(extractedIds).toEqual(["gParent", "gChild", "leaf"]);
    });

    it("deduplicates when parent and child are both selected", () => {
      const g1 = createGroup("g1", 100, 100);
      const c1 = createRect("c1", 10, 10, "g1");
      const all = [g1, c1];

      const extracted = extractClipboardSceneGraph(["g1", "c1"], all);
      expect(extracted).toHaveLength(2);
      expect(extracted.map((s) => s.id)).toEqual(["g1", "c1"]);
    });

    it("promotes child-only selection to root with world coordinates", () => {
      const g1 = createGroup("g1", 100, 200);
      const c1 = createRect("c1", 15, 25, "g1");
      const all = [g1, c1];

      // Only c1 is selected
      const extracted = extractClipboardSceneGraph(["c1"], all);
      expect(extracted).toHaveLength(1);
      expect(extracted[0].id).toBe("c1");
      expect(extracted[0].parentId).toBeNull();
      // World coordinates: 100 + 15 = 115, 200 + 25 = 225
      expect(extracted[0].x).toBe(115);
      expect(extracted[0].y).toBe(225);
    });
  });

  describe("cloneSceneGraphWithNewIds", () => {
    it("generates new unique IDs and applies paste offset to root", () => {
      const r1 = createRect("r1", 100, 100);
      const result = cloneSceneGraphWithNewIds([r1], 1);

      expect(result.shapes).toHaveLength(1);
      const cloned = result.shapes[0];
      expect(cloned.id).not.toBe("r1");
      expect(result.idMap.get("r1")).toBe(cloned.id);
      expect(cloned.x).toBe(120); // 100 + 20
      expect(cloned.y).toBe(120);
      expect(result.rootIds).toEqual([cloned.id]);
    });

    it("applies consecutive paste offset", () => {
      const r1 = createRect("r1", 100, 100);
      const result = cloneSceneGraphWithNewIds([r1], 3);

      expect(result.shapes[0].x).toBe(160); // 100 + 3*20
      expect(result.shapes[0].y).toBe(160);
    });

    it("preserves group hierarchy and remaps parentId", () => {
      const g1 = createGroup("g1", 50, 50);
      const c1 = createRect("c1", 10, 15, "g1");
      const result = cloneSceneGraphWithNewIds([g1, c1], 1);

      expect(result.shapes).toHaveLength(2);
      const clonedGroup = result.shapes.find((s) => s.type === "group")!;
      const clonedChild = result.shapes.find((s) => s.type === "rectangle")!;

      expect(clonedGroup.id).not.toBe("g1");
      expect(clonedChild.id).not.toBe("c1");
      // Group received offset in world space
      expect(clonedGroup.x).toBe(70);
      expect(clonedGroup.y).toBe(70);
      // Child maintained local coordinates
      expect(clonedChild.x).toBe(10);
      expect(clonedChild.y).toBe(15);
      // Child parentId remapped to new group id
      expect(clonedChild.parentId).toBe(clonedGroup.id);
      expect(result.rootIds).toEqual([clonedGroup.id]);
    });

    it("remaps internal connector references", () => {
      const r1 = createRect("r1", 10, 10);
      const r2 = createRect("r2", 200, 10);
      const conn: ConnectorShape = {
        id: "conn1",
        type: "connector",
        x: 10,
        y: 10,
        width: 190,
        height: 50,
        rotation: 0,
        opacity: 1,
        zIndex: 3,
        stroke: "#000",
        strokeWidth: 2,
        points: [0, 0, 190, 0],
        connector: {
          sourceShapeId: "r1",
          sourceAnchor: "right",
          targetShapeId: "r2",
          targetAnchor: "left",
          routing: "straight",
        },
      };

      const result = cloneSceneGraphWithNewIds([r1, r2, conn], 1);
      const clonedConn = result.shapes.find((s) => s.type === "connector") as ConnectorShape;
      const newR1Id = result.idMap.get("r1")!;
      const newR2Id = result.idMap.get("r2")!;

      expect(clonedConn.connector?.sourceShapeId).toBe(newR1Id);
      expect(clonedConn.connector?.targetShapeId).toBe(newR2Id);
    });

    it("safely detaches external connector references", () => {
      const r1 = createRect("r1", 10, 10);
      // r2 is NOT in copied list
      const conn: ConnectorShape = {
        id: "conn1",
        type: "connector",
        x: 10,
        y: 10,
        width: 190,
        height: 50,
        rotation: 0,
        opacity: 1,
        zIndex: 2,
        stroke: "#000",
        strokeWidth: 2,
        points: [0, 0, 190, 0],
        connector: {
          sourceShapeId: "r1",
          sourceAnchor: "right",
          targetShapeId: "external_r2",
          targetAnchor: "left",
          routing: "straight",
        },
      };

      const result = cloneSceneGraphWithNewIds([r1, conn], 1);
      const clonedConn = result.shapes.find((s) => s.type === "connector") as ConnectorShape;
      const newR1Id = result.idMap.get("r1")!;

      // Internal endpoint remapped
      expect(clonedConn.connector?.sourceShapeId).toBe(newR1Id);
      // External endpoint safely detached
      expect(clonedConn.connector?.targetShapeId).toBeNull();
      // Anchor and points metadata preserved
      expect(clonedConn.connector?.targetAnchor).toBe("left");
      expect(clonedConn.points).toEqual([0, 0, 190, 0]);
    });

    it("pastes into active destination group converting world coordinates to local space", () => {
      const r1 = createRect("r1", 100, 100);
      const destGroup = createGroup("destGroup", 50, 50);

      // Pasting r1 into destGroup (pasteCount=1 -> targetWorld = (120, 120))
      // Inside destGroup at (50, 50), local pos = (120 - 50, 120 - 50) = (70, 70)
      const result = cloneSceneGraphWithNewIds([r1], 1, "destGroup", destGroup);

      expect(result.shapes).toHaveLength(1);
      const cloned = result.shapes[0];
      expect(cloned.parentId).toBe("destGroup");
      expect(cloned.x).toBe(70);
      expect(cloned.y).toBe(70);
    });
  });

  describe("validateClipboardPayload", () => {
    it("accepts a valid clipboard payload", () => {
      const valid = {
        version: CLIPBOARD_VERSION,
        sourceCanvasId: "canvas_123",
        shapes: [createRect("r1", 10, 10)],
        createdAt: Date.now(),
      };
      const validated = validateClipboardPayload(valid);
      expect(validated.version).toBe(CLIPBOARD_VERSION);
      expect(validated.shapes).toHaveLength(1);
    });

    it("rejects invalid version", () => {
      const invalid = {
        version: 999,
        sourceCanvasId: "canvas_123",
        shapes: [createRect("r1", 10, 10)],
        createdAt: Date.now(),
      };
      expect(() => validateClipboardPayload(invalid)).toThrow(/validation failed/);
    });

    it("rejects empty shapes array", () => {
      const invalid = {
        version: CLIPBOARD_VERSION,
        sourceCanvasId: "canvas_123",
        shapes: [],
        createdAt: Date.now(),
      };
      expect(() => validateClipboardPayload(invalid)).toThrow(/at least 1 shape/);
    });

    it("rejects unsupported shape type", () => {
      const invalid = {
        version: CLIPBOARD_VERSION,
        sourceCanvasId: "canvas_123",
        shapes: [{ ...createRect("r1", 10, 10), type: "invalid_type" }],
        createdAt: Date.now(),
      };
      expect(() => validateClipboardPayload(invalid)).toThrow(/validation failed/);
    });

    it("rejects non-object input", () => {
      expect(() => validateClipboardPayload("not-json")).toThrow(/expected an object/);
    });
  });
});
