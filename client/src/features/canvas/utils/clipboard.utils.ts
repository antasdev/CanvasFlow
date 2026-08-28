import { z } from "zod";

import type { Shape } from "../types";
import {
  CLIPBOARD_VERSION,
  MAX_CLIPBOARD_SHAPES,
  MAX_CLIPBOARD_PAYLOAD_SIZE,
  PASTE_OFFSET,
  type CanvasFlowClipboardData,
} from "../types/clipboard.types";
import { getShapeWorldTransform, worldToLocal } from "./group-geometry.utils";

/**
 * Centralized unique identifier generator matching CanvasFlow convention.
 */
export function generateClipboardEntityId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `shape_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Recursively collects all descendant shapes of a group.
 */
function collectDescendantShapes(
  parentId: string,
  shapesByParent: Map<string, Shape[]>
): Shape[] {
  const children = shapesByParent.get(parentId) ?? [];
  const descendants: Shape[] = [];

  for (const child of children) {
    descendants.push(child);
    if (child.type === "group") {
      descendants.push(...collectDescendantShapes(child.id, shapesByParent));
    }
  }

  return descendants;
}

/**
 * Extracts a complete, self-contained scene graph from the current canvas selection.
 *
 * Rules:
 * 1. Entire Group Selected: Copies the group and all its descendants recursively.
 * 2. Parent & Child Selected: Deduplicates so children are not copied twice.
 * 3. Child-Only Selected (parent not selected): Promotes child to root-level in world coordinates
 *    with parentId = null, preventing dangling references to uncopied parent groups.
 */
export function extractClipboardSceneGraph(
  selectedIds: string[],
  allShapes: Shape[]
): Shape[] {
  if (selectedIds.length === 0 || allShapes.length === 0) {
    return [];
  }

  const selectedSet = new Set(selectedIds);
  const shapeMap = new Map<string, Shape>(allShapes.map((s) => [s.id, s]));

  // Index shapes by parentId for fast descendant traversal
  const shapesByParent = new Map<string, Shape[]>();
  for (const shape of allShapes) {
    if (shape.parentId) {
      const list = shapesByParent.get(shape.parentId) ?? [];
      list.push(shape);
      shapesByParent.set(shape.parentId, list);
    }
  }

  const extractedMap = new Map<string, Shape>();

  for (const shapeId of selectedIds) {
    const shape = shapeMap.get(shapeId);
    if (!shape) continue;

    // If already included via ancestor group, continue
    if (extractedMap.has(shape.id)) continue;

    // Check if any ancestor of this shape is also in selectedSet
    let currentParentId: string | null | undefined = shape.parentId;
    let hasSelectedAncestor = false;
    while (currentParentId) {
      if (selectedSet.has(currentParentId)) {
        hasSelectedAncestor = true;
        break;
      }
      const parent = shapeMap.get(currentParentId);
      currentParentId = parent?.parentId;
    }

    if (hasSelectedAncestor) {
      // Child will be collected when processing its selected ancestor group
      continue;
    }

    if (shape.type === "group") {
      // Entire group selected: add group and all descendants
      extractedMap.set(shape.id, { ...shape });
      const descendants = collectDescendantShapes(shape.id, shapesByParent);
      for (const d of descendants) {
        extractedMap.set(d.id, { ...d });
      }
    } else if (shape.parentId) {
      // Child-only selected without parent selected: promote to root level in world coordinates
      const worldTransform = getShapeWorldTransform(shape, allShapes);
      extractedMap.set(shape.id, {
        ...shape,
        parentId: null,
        x: worldTransform.x,
        y: worldTransform.y,
        rotation: worldTransform.rotation,
      });
    } else {
      // Root shape
      extractedMap.set(shape.id, { ...shape });
    }
  }

  // Preserve relative canvas ordering as in allShapes
  const originalOrder = new Map<string, number>(allShapes.map((s, idx) => [s.id, idx]));
  const extractedList = Array.from(extractedMap.values());
  extractedList.sort((a, b) => (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0));
  return extractedList;
}

export type ClonedSceneGraphResult = {
  shapes: Shape[];
  idMap: Map<string, string>;
  rootIds: string[];
};

/**
 * Clones an extracted scene graph with new IDs, remapped parent & connector references,
 * and applied paste offsets.
 *
 * Rules:
 * 1. New IDs generated for every shape.
 * 2. parentId remapped using idMap for internal hierarchy.
 * 3. Root shapes receive world-space (PASTE_OFFSET * pasteCount).
 * 4. Children inside groups maintain local coordinates.
 * 5. If destinationGroup is provided (Group Edit Mode), root shapes become children of that group
 *    and their world coordinates are projected into destinationGroup local space.
 * 6. Internal connector endpoints (both shapes in idMap) are remapped to new IDs.
 * 7. External connector endpoints (unselected shapes) are safely detached (nullified).
 */
export function cloneSceneGraphWithNewIds(
  copiedShapes: Shape[],
  pasteCount: number,
  destinationParentId?: string | null,
  destinationGroup?: Shape | null
): ClonedSceneGraphResult {
  if (copiedShapes.length === 0) {
    return { shapes: [], idMap: new Map(), rootIds: [] };
  }

  const idMap = new Map<string, string>();
  for (const s of copiedShapes) {
    idMap.set(s.id, generateClipboardEntityId());
  }

  const offset = PASTE_OFFSET * Math.max(1, pasteCount);
  const rootIds: string[] = [];

  const clonedShapes: Shape[] = copiedShapes.map((original) => {
    const newId = idMap.get(original.id)!;
    const isInternalChild = Boolean(original.parentId && idMap.has(original.parentId));

    if (isInternalChild) {
      // Nested child: preserve local coordinates and point to new parent group
      const newParentId = idMap.get(original.parentId!)!;
      const cloned: Shape = {
        ...original,
        id: newId,
        parentId: newParentId,
      };
      remapConnectorReferences(cloned, idMap);
      return cloned;
    }

    // Root-level shape in copied set:
    rootIds.push(newId);
    const targetWorldX = original.x + offset;
    const targetWorldY = original.y + offset;

    if (destinationParentId && destinationGroup) {
      // Pasting into an active destination group: convert world position to local space
      const localPos = worldToLocal(
        { x: targetWorldX, y: targetWorldY },
        destinationGroup
      );
      const cloned: Shape = {
        ...original,
        id: newId,
        parentId: destinationParentId,
        x: Math.round(localPos.x),
        y: Math.round(localPos.y),
      };
      remapConnectorReferences(cloned, idMap);
      return cloned;
    }

    // Pasting at root level
    const cloned: Shape = {
      ...original,
      id: newId,
      parentId: null,
      x: Math.round(targetWorldX),
      y: Math.round(targetWorldY),
    };
    remapConnectorReferences(cloned, idMap);
    return cloned;
  });

  return {
    shapes: clonedShapes,
    idMap,
    rootIds,
  };
}

/**
 * Remaps internal connector references to newly generated IDs or detaches external endpoints.
 */
function remapConnectorReferences(shape: Shape, idMap: Map<string, string>): void {
  if (shape.type !== "connector" || !shape.connector) {
    return;
  }

  const connectorData = { ...shape.connector };

  // Source endpoint
  if (connectorData.sourceShapeId) {
    if (idMap.has(connectorData.sourceShapeId)) {
      connectorData.sourceShapeId = idMap.get(connectorData.sourceShapeId)!;
    } else {
      // Detach external reference
      connectorData.sourceShapeId = null;
    }
  }

  // Target endpoint
  if (connectorData.targetShapeId) {
    if (idMap.has(connectorData.targetShapeId)) {
      connectorData.targetShapeId = idMap.get(connectorData.targetShapeId)!;
    } else {
      // Detach external reference
      connectorData.targetShapeId = null;
    }
  }

  shape.connector = connectorData;
}

// ----------------------------------------------------
// Strict Zod Validation Schema for Clipboard Payloads
// ----------------------------------------------------

const anchorPositionEnum = z.enum(["top", "right", "bottom", "left", "center"]).nullable().optional();
const connectorRoutingEnum = z.enum(["straight", "orthogonal", "curved"]).optional();

const shapeConnectorSchema = z
  .object({
    sourceShapeId: z.string().nullable().optional(),
    sourceAnchor: anchorPositionEnum,
    targetShapeId: z.string().nullable().optional(),
    targetAnchor: anchorPositionEnum,
    routing: connectorRoutingEnum,
  })
  .optional();

const shapeShadowSchema = z
  .object({
    enabled: z.boolean().optional(),
    color: z.string().optional(),
    blur: z.number().optional(),
    offsetX: z.number().optional(),
    offsetY: z.number().optional(),
    opacity: z.number().optional(),
  })
  .optional();

const shapeConfigSchema = z
  .object({
    sides: z.number().optional(),
    points: z.number().optional(),
    innerRadiusRatio: z.number().optional(),
  })
  .optional();

const shapeSchema = z.object({
  id: z.string().min(1, "Shape ID cannot be empty."),
  type: z.enum([
    "rectangle",
    "circle",
    "ellipse",
    "triangle",
    "polygon",
    "star",
    "line",
    "arrow",
    "connector",
    "text",
    "sticky_note",
    "freehand",
    "group",
  ]),
  x: z.number().finite("x must be a finite number."),
  y: z.number().finite("y must be a finite number."),
  width: z.number().positive("width must be positive."),
  height: z.number().positive("height must be positive."),
  rotation: z.number().finite().default(0),
  opacity: z.number().min(0).max(1).default(1),
  zIndex: z.number().finite().default(1),
  parentId: z.string().nullable().optional(),
  text: z.string().optional(),
  points: z.array(z.number().finite()).optional(),
  connector: shapeConnectorSchema,
  shapeConfig: shapeConfigSchema,
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  strokeStyle: z.enum(["solid", "dashed", "dotted"]).optional(),
  shadow: shapeShadowSchema,
  fontSize: z.number().optional(),
  fontFamily: z.string().optional(),
  fontWeight: z.union([z.string(), z.number()]).optional(),
  fontStyle: z.enum(["normal", "italic"]).optional(),
  textDecoration: z.enum(["none", "underline"]).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
  verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
  backgroundColor: z.string().optional(),
  textColor: z.string().optional(),
  arrowHeadEnd: z.boolean().optional(),
  arrowHeadStart: z.boolean().optional(),
  pointerLength: z.number().optional(),
  pointerWidth: z.number().optional(),
});

export const clipboardPayloadSchema = z.object({
  version: z.literal(CLIPBOARD_VERSION),
  sourceCanvasId: z.string().min(1, "sourceCanvasId is required."),
  shapes: z
    .array(shapeSchema)
    .min(1, "Clipboard must contain at least 1 shape.")
    .max(MAX_CLIPBOARD_SHAPES, `Clipboard cannot exceed ${MAX_CLIPBOARD_SHAPES} shapes.`),
  createdAt: z.number().positive(),
});

/**
 * Validates untrusted clipboard payload data against the strict Zod schema.
 * Rejects oversized payloads, malformed structures, unsupported shapes, or invalid types.
 */
export function validateClipboardPayload(data: unknown): CanvasFlowClipboardData {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid clipboard data: expected an object.");
  }

  // Enforce serialized payload size limit if checking a stringified version
  const serialized = JSON.stringify(data);
  if (serialized.length > MAX_CLIPBOARD_PAYLOAD_SIZE) {
    throw new Error(`Clipboard payload size exceeds ${MAX_CLIPBOARD_PAYLOAD_SIZE} bytes limit.`);
  }

  const parsed = clipboardPayloadSchema.safeParse(data);
  if (!parsed.success) {
    const errorMsg = parsed.error.issues.map((i) => i.message).join(", ");
    throw new Error(`Clipboard validation failed: ${errorMsg}`);
  }

  return parsed.data as CanvasFlowClipboardData;
}
