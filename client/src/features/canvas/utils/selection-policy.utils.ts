import type { Shape, SelectionMode } from "../types";

import { getShapeWorldAABB, type AABB } from "./alignment.utils";

/**
 * Returns all shapes eligible for selection within the current canvas scope.
 * - At root level (editingGroupId === null): returns root shapes (no parentId).
 * - Inside a group (editingGroupId !== null): returns direct children of editingGroupId.
 */
export function getSelectableShapes(
  shapes: Shape[],
  editingGroupId: string | null
): Shape[] {
  if (!editingGroupId) {
    return shapes.filter((s) => !s.parentId);
  }
  return shapes.filter((s) => s.parentId === editingGroupId);
}

/**
 * Resolves a hit on any shape (including deeply nested descendants) to the
 * appropriate selectable entity in the current scope.
 * - At root level: resolves up to the root ancestor.
 * - In group edit mode: resolves up to the direct child of editingGroupId.
 * - If the shape is outside editingGroupId scope: returns null.
 */
export function resolveGroupHit(
  hitShapeId: string,
  shapes: Shape[],
  editingGroupId: string | null
): string | null {
  const shapeMap = new Map<string, Shape>();
  for (const s of shapes) {
    shapeMap.set(s.id, s);
  }

  const target = shapeMap.get(hitShapeId);
  if (!target) {
    return null;
  }

  // Root canvas scope
  if (!editingGroupId) {
    let current = target;
    const visited = new Set<string>([current.id]);
    while (current.parentId) {
      const parent = shapeMap.get(current.parentId);
      if (!parent || visited.has(parent.id)) {
        break;
      }
      visited.add(parent.id);
      current = parent;
    }
    return current.id;
  }

  // Editing inside a group
  if (target.parentId === editingGroupId) {
    return target.id;
  }

  let current: Shape = target;
  const visited = new Set<string>([current.id]);
  while (current.parentId) {
    if (current.parentId === editingGroupId) {
      return current.id;
    }
    const parent = shapeMap.get(current.parentId);
    if (!parent || visited.has(parent.id)) {
      break;
    }
    visited.add(parent.id);
    current = parent;
  }

  // Shape was outside the editing group
  return null;
}

/**
 * Collects all descendant IDs of a given root ID.
 */
export function getAllDescendantIds(
  rootId: string,
  shapes: Shape[]
): Set<string> {
  const descendants = new Set<string>();
  const queue = [rootId];
  const visited = new Set<string>([rootId]);

  while (queue.length > 0) {
    const parentId = queue.shift()!;
    for (const shape of shapes) {
      if (shape.parentId === parentId && !visited.has(shape.id)) {
        visited.add(shape.id);
        descendants.add(shape.id);
        queue.push(shape.id);
      }
    }
  }

  return descendants;
}

/**
 * Enforces the group hierarchy invariant:
 * A group and its descendants must NEVER be simultaneously selected.
 * If an ancestor is selected, all its descendants are pruned from selection.
 */
export function enforceGroupHierarchyInvariant(
  selectedIds: string[],
  shapes: Shape[]
): string[] {
  const uniqueIds = Array.from(new Set(selectedIds));
  const idSet = new Set(uniqueIds);
  const toRemove = new Set<string>();

  for (const id of uniqueIds) {
    const descendants = getAllDescendantIds(id, shapes);
    for (const descId of descendants) {
      if (idSet.has(descId)) {
        toRemove.add(descId);
      }
    }
  }

  return uniqueIds.filter((id) => !toRemove.has(id));
}

export type ResolveSelectionOptions = {
  currentSelectedIds: string[];
  hitIds: string[];
  mode: SelectionMode;
  shapes: Shape[];
  editingGroupId: string | null;
};

/**
 * Resolves final selection state given current selection, hit IDs, and modifier mode.
 */
export function resolveSelectionWithModifiers({
  currentSelectedIds,
  hitIds,
  mode,
  shapes,
  editingGroupId,
}: ResolveSelectionOptions): string[] {
  // Map all hits to selectable scope
  const resolvedHitIds = new Set<string>();
  for (const id of hitIds) {
    const resolved = resolveGroupHit(id, shapes, editingGroupId);
    if (resolved) {
      resolvedHitIds.add(resolved);
    }
  }

  let nextSelected: string[] = [];

  switch (mode) {
    case "replace":
      nextSelected = Array.from(resolvedHitIds);
      break;

    case "add": {
      const combined = new Set([...currentSelectedIds, ...resolvedHitIds]);
      nextSelected = Array.from(combined);
      break;
    }

    case "toggle": {
      const currentSet = new Set(currentSelectedIds);
      for (const hitId of resolvedHitIds) {
        if (currentSet.has(hitId)) {
          currentSet.delete(hitId);
        } else {
          currentSet.add(hitId);
        }
      }
      nextSelected = Array.from(currentSet);
      break;
    }
  }

  return enforceGroupHierarchyInvariant(nextSelected, shapes);
}

/**
 * Resolves Select All action (Ctrl+A / Cmd+A).
 * Selects only eligible root shapes or active group children, strictly avoiding
 * selecting both group and descendants.
 */
export function resolveSelectAll(
  shapes: Shape[],
  editingGroupId: string | null
): string[] {
  const selectable = getSelectableShapes(shapes, editingGroupId);
  return selectable.map((s) => s.id);
}

/**
 * Stage 1 candidate filtering:
 * Discards shapes whose world AABB does not intersect the selection AABB.
 */
export function filterCandidateShapes(
  shapes: Shape[],
  selectionAABB: AABB,
  editingGroupId: string | null
): Shape[] {
  const candidates = getSelectableShapes(shapes, editingGroupId);

  return candidates.filter((shape) => {
    const shapeAABB = getShapeWorldAABB(shape, shapes);
    const overlaps =
      shapeAABB.minX <= selectionAABB.maxX &&
      shapeAABB.maxX >= selectionAABB.minX &&
      shapeAABB.minY <= selectionAABB.maxY &&
      shapeAABB.maxY >= selectionAABB.minY;

    return overlaps;
  });
}
