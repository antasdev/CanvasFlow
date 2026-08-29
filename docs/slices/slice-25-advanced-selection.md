# Slice 25 — Advanced Selection, Marquee & Lasso

## 1. Purpose

Selection is the primary spatial interaction gateway of CanvasFlow. Prior to Slice 25, CanvasFlow relied on basic Axis-Aligned Bounding Box (AABB) inclusion for multi-selection, requiring the Shift key on empty canvas to draw an unstyled selection box. This naive approach suffered from severe geometric and architectural limitations in a production whiteboard environment:

1. **Rotated Shapes & Non-Rectangular Vector Geometry:** An AABB bounding box for a shape rotated $45^\circ$ expands dramatically. Under simple AABB intersection, empty space around the rotated corners triggers false-positive selections. Similarly, non-rectangular shapes (stars, triangles, circles, curved connectors, and freehand strokes) have large bounding box voids that incorrectly capture selection events.
2. **Directional Intent:** Modern collaborative whiteboards and CAD platforms (AutoCAD, Figma, Sketch) differentiate between **Containment** (selecting only shapes completely inside the drawn marquee) and **Intersection** (selecting any shape touched by the marquee boundary). Without direction-awareness, users cannot easily isolate a single shape tightly surrounded by other objects.
3. **Freeform Lasso Selection:** Real-world whiteboarding involves intricate diagramming, flowcharts, and freehand mind maps where rectangular marquees cannot isolate specific clusters. Lasso selection allows users to draw an arbitrary freeform polygon around or through specific nodes.
4. **Group Hierarchy & Selection Invariants:** In complex whiteboards with nested groups ($G_1 \to G_2 \to S$), selecting a child shape while its parent group is also selected creates severe mathematical and operational ambiguities (double-transformation during drag, duplicate deletion records, and corrupt undo snapshots). A strict policy is required to prevent ancestor-descendant coexistence.
5. **Ephemeral State vs. Persistent Mutation:** Selection represents the local user's transient visual focus. It must **never** write to MongoDB, create `MutationRecord` entities, increment `collaborationRevision`, or pollute the local undo/redo history. It must remain strictly client-side and synchronize only through high-frequency, fire-and-forget presence broadcasts.

---

## 2. Architecture

CanvasFlow follows a layered architecture separating user input, coordinate transformations, geometric evaluation, selection policy, and state synchronization:

```text
Pointer / Touch / Keyboard Events (Screen Space)
                  │
                  ▼
            CanvasEditor
                  │
                  ▼
         useCanvasSelection (React Lifecycle Bridge)
                  │
                  ▼
        SelectionController (Headless Engine)
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
  Marquee Mode         Lasso Mode
  (Left→Right vs       (Freeform World
   Right→Left)          Polygon)
        │                   │
        └─────────┬─────────┘
                  ▼
    Stage 1: Broad-Phase Candidate Filter
    (World AABB Overlap Rejection)
                  │
                  ▼
    Stage 2: Narrow-Phase Geometric Hit Testing
    (Exact SAT / Ray-Casting / Segment Distance)
                  │
                  ▼
            Selection Policy
    (Scope Filtering, Group Hierarchy Resolution,
     Modifier Modes, Group Invariant Enforcement)
                  │
                  ▼
           canvas.store.ts
          (selectedShapeIds)
                  │
        ┌─────────┴─────────┐
        ▼                   ▼
Konva Transformer    Presence Socket
(Visual Handles &    (socketClientService.changeSelection)
 Multi-drag Hook)
```

### 2.1 Component Responsibilities

* **Interaction Layer (`CanvasEditor`, `useCanvasSelection`, `SelectionController`):** Captures pointer down, move, and up events; converts screen coordinates to world coordinates; detects modifier keys (`Shift`, `Ctrl`, `Cmd`); maintains ephemeral drag state and visual feedback (blue solid vs. green dashed marquee, violet dashed lasso).
* **Geometry Layer (`selection-geometry.utils.ts`):** Pure mathematical functions with zero React, zero DOM, and zero Konva dependencies. Operates strictly in continuous world coordinates to evaluate ray casting, segment crossings, polygon containment, and polyline intersections.
* **Policy Layer (`selection-policy.utils.ts`):** Enforces business rules: canvas root scope vs. active group edit scope (`editingGroupId`), nested ancestor hit resolution, modifier math (`replace`, `add`, `toggle`), and the group-descendant exclusion invariant.
* **State Layer (`canvas.store.ts`):** Single source of truth for `selectedShapeIds: string[]`. Drives Konva `<Transformer>` nodes and dispatches presence broadcasts.
* **Existing Geometry Infrastructure (`canvas.coordinates.ts`, `group-geometry.utils.ts`, `shape-geometry.utils.ts`, `alignment.utils.ts`):** Reused directly for screen-to-world conversion, ancestor group transformation inheritance, center-of-mass rotation transforms, and shape vector vertex generation.

---

## 3. Selection State & Invariants

### 3.1 Single Source of Truth
Local selection is governed exclusively by:
```ts
// client/src/features/canvas/store/canvas.store.ts
selectedShapeIds: string[]
```
CanvasFlow does **not** introduce a secondary selection store. All consumers (property panels, context menus, alignment actions, clipboard commands, and Konva shape transformers) consume `selectedShapeIds` directly.

### 3.2 Ephemeral Interaction Guarantees
Selection actions adhere strictly to the following collaborative invariants:
* **No Persistence:** Selection changes are never saved to MongoDB.
* **No Mutation Records:** No `MutationRecord` is created or queued in `useMutationStore`.
* **No Collaboration Revision:** `collaborationRevision` is not incremented.
* **No Undo/Redo Pollution:** Pushing to `past` or `future` stacks is strictly forbidden for selection actions.
* **Presence Separation:** Collaborative awareness uses ephemeral presence packets (`socketClientService.changeSelection(boardId, selectedShapeIds)`), displayed through remote cursor selection tags.

---

## 4. Selection Modes & Modifiers

CanvasFlow supports three platform-safe selection modes:

| Mode | Trigger | Mathematical Formulation | Description |
| :--- | :--- | :--- | :--- |
| **Replace** | Default Click / Drag | $S_{\text{next}} = H$ | Clears prior selection and selects only the hit entities. |
| **Add** | `Shift` + Click / Drag | $S_{\text{next}} = S_{\text{curr}} \cup H$ | Extends current selection with newly hit entities. |
| **Toggle** | `Ctrl` / `Cmd` + Click / Drag | $S_{\text{next}} = S_{\text{curr}} \mathbin{\Delta} H$ | Inverts selection state: unselects selected hits, selects unselected hits. |

*Note: On empty canvas click without dragging ($< 3\text{px}$ movement), replace mode clears selection ($S_{\text{next}} = \emptyset$) and exits active group editing (`exitGroup()`).*

---

## 5. Direction-Aware Marquee Selection

The marquee engine inspects the horizontal drag vector from the initial pointer-down coordinate $(x_{\text{start}}, y_{\text{start}})$ to the current pointer coordinate $(x_{\text{current}}, y_{\text{current}})$:

```text
                         x_start
                            │
   Intersection Mode        │       Containment Mode
   (Right-to-Left)          │       (Left-to-Right)
   currentX < startX        │       currentX >= startX
                            │
   Dashed Emerald Green     │       Solid Sapphire Blue
   Stroke: #10b981          │       Stroke: #3b82f6
   Dash: [6, 4]             │       Dash: none
   Fill: #10b981 (12% op)   │       Fill: #3b82f6 (12% op)
```

### 5.1 Left-to-Right: Containment Mode
* **Criteria:** A candidate shape is selected **only if** its complete geometry is fully contained inside the marquee rectangle.
* **Use Case:** Isolating a dense group of nodes without accidentally capturing a large background shape or overlapping connectors.

### 5.2 Right-to-Left: Intersection Mode
* **Criteria:** A candidate shape is selected if its geometry touches, intersects, or is contained by the marquee rectangle.
* **Use Case:** Rapidly brushing across multiple connectors, text labels, or shapes to gather them in a single fast stroke.

---

## 6. Freeform Lasso Selection

The Lasso tool (`CANVAS_TOOLS.LASSO = "lasso"`) allows users to draw arbitrary selection boundaries:

```text
Pointer Down on Canvas
         │
         ▼
Collect World-Space Points: [{x0, y0}]
         │
         ▼
Pointer Move (Distance threshold > 3px)
  └── Append {xi, yi}
  └── Render Live Preview: Closed Polygon, #8b5cf6, 1.5px dashed [5, 5], 10% opacity
         │
         ▼
Pointer Up (Complete Gesture)
         │
         ├── Check Degeneracy:
         │     ├── If points.length < 3 ──► Abort (no-op)
         │     └── If AABB width < 3px & height < 3px ──► Abort (no-op)
         │
         ├── Stage 1: Filter candidates against Lasso AABB
         │
         ├── Stage 2: Precise Narrow-Phase Intersection
         │     └── Evaluate polygon against candidate shape geometries
         │
         └── Apply Selection Policy & Update Store
```

---

## 7. Coordinate System & Viewport Invariance

All selection calculations occur in **Canvas World Coordinates**.

Screen-space pointer coordinates from browser events are transformed via:
$$\begin{aligned}
x_{\text{world}} &= \frac{x_{\text{screen}} - \text{pan}.x}{\text{zoom}} \\
y_{\text{world}} &= \frac{y_{\text{screen}} - \text{pan}.y}{\text{zoom}}
\end{aligned}$$

### Why World-Space Normalization Matters
1. **Zoom Invariance:** Marquee and lasso boundaries scale with the document. Zooming in to $300\%$ or out to $25\%$ produces identical geometric selection results.
2. **Pan Invariance:** Dragging across the canvas after panning thousands of units maintains absolute spatial fidelity.
3. **Consistent Rotations:** Shapes rotated around their center $(c_x, c_y)$ rotate in world space, ensuring SAT edge tests remain exact.

---

## 8. Two-Stage Selection Pipeline

To ensure high performance ($\ge 60\text{ FPS}$) even with hundreds of shapes on a canvas, CanvasFlow implements a two-stage spatial filter:

```text
Marquee / Lasso
      │
      ▼
Derive World-Space Selection AABB
{ minX, minY, maxX, maxY }
      │
      ▼
┌────────────────────────────────────────────────────────┐
│ STAGE 1: BROAD-PHASE CANDIDATE FILTER                  │
│ filterCandidateShapes(shapes, selectionAABB, scope)   │
│                                                        │
│ - Scope filter: only root shapes OR group children     │
│ - AABB Overlap check:                                  │
│     shapeAABB.minX <= selAABB.maxX &&                 │
│     shapeAABB.maxX >= selAABB.minX &&                 │
│     shapeAABB.minY <= selAABB.maxY &&                 │
│     shapeAABB.maxY >= selAABB.minY                    │
│                                                        │
│ Output: K candidate shapes (K << N)                    │
└────────────────────────────────────────────────────────┘
      │
      ▼
┌────────────────────────────────────────────────────────┐
│ STAGE 2: NARROW-PHASE GEOMETRIC HIT TESTING            │
│ hitTestShapeGeometry(shapeGeom, selectionPoly, mode)   │
│                                                        │
│ - Precise SAT polygon-polygon intersection             │
│ - Ray-casting point-in-polygon containment             │
│ - Polyline-polygon segment intersection checks         │
│ - Circle / ellipse boundary distance checks            │
│                                                        │
│ Output: Exact hit IDs                                  │
└────────────────────────────────────────────────────────┘
```

### Shape-Specific Narrow-Phase Strategies

| Shape Family | Shape Types | Stage 2 Strategy |
| :--- | :--- | :--- |
| **Polygon / Vector** | `rectangle`, `triangle`, `polygon`, `star`, `text`, `sticky_note` | World-space vertex extraction with center-of-mass rotation. Evaluated using `polygonContainsPolygon` (containment) or `polygonIntersectsPolygon` (intersection). |
| **Polylines** | `line`, `arrow`, `connector`, `freehand` | Evaluated as open piecewise-linear polylines using `polylineInsidePolygon` or `polylineIntersectsPolygon` (segment crossing + vertex containment). |
| **Radial** | `circle`, `ellipse` | `circle` uses center-containment and edge-distance tests. `ellipse` samples a 32-vertex rotated polygon representation in world space. |
| **Groups** | `group` | Evaluates group bounding polygon or resolves contained member geometry. |

---

## 9. Group Selection Policy & Invariants

Nested group structures require strict policy rules to avoid scene-graph corruption:

```text
Canvas Scene Graph
├── Group Alpha
│    ├── Child Rectangle
│    └── Group Beta
│         └── Leaf Star
└── Independent Circle
```

### 9.1 Scope Resolution
* **Root Canvas Scope (`editingGroupId === null`):** Only root-level shapes (`!shape.parentId`) are selectable. Any click or marquee hit on `Leaf Star` automatically climbs the parent chain and resolves to `Group Alpha`.
* **Group Edit Scope (`editingGroupId === "group-alpha"`):** Direct children of `Group Alpha` (`Child Rectangle` and `Group Beta`) are selectable. A hit on `Leaf Star` resolves to `Group Beta`.
* **Out-of-Scope Protection:** Shapes outside the active editing group cannot be selected and return `null`.

### 9.2 The Group-Descendant Selection Invariant
$$\text{If } G \in \text{selectedShapeIds}, \quad \forall D \in \text{descendants}(G), \quad D \notin \text{selectedShapeIds}$$

* **The Problem:** If both `Group Alpha` and its child `Child Rectangle` are simultaneously present in `selectedShapeIds`, dragging the selection applies the delta to `Group Alpha` (which moves all children), and **again** to `Child Rectangle`, causing the child to move at $2\times$ speed and visually break out of its container.
* **The Solution:** `enforceGroupHierarchyInvariant` prunes any descendant ID whose ancestor is present in the selection set across all operations (Click, Shift-click, Ctrl-click, Marquee, Lasso, and Select All).

---

## 10. Hit Testing Geometric Utilities Reference

All functions are implemented in [`selection-geometry.utils.ts`](file:///d:/workspace/canvasflow/client/src/features/canvas/utils/selection-geometry.utils.ts):

* **`pointInPolygon(point, polygon)`:** Ray-casting algorithm with epsilon tolerance. Explicitly detects whether a point lies on an edge or vertex to ensure closed boundary inclusion.
* **`segmentsIntersect(p1, p2, p3, p4)`:** Computes cross-product orientation to detect crossing, collinear overlapping, and shared endpoints between two 2D line segments.
* **`polygonIntersectsPolygon(polyA, polyB)`:** Tests edge intersections between both polygons, and checks whether either polygon is contained inside the other.
* **`polygonContainsPolygon(container, target)`:** Verifies that all vertices of `target` lie inside `container` and that no edges cross.
* **`polylineIntersectsPolygon(points, polygon)`:** Evaluates each line segment of a polyline against polygon boundary edges and checks vertex inclusion.
* **`polylineInsidePolygon(points, polygon)`:** Verifies that every point on a polyline is enclosed inside the polygon.
* **`circleIntersectsPolygon(center, radius, polygon)`:** Returns true if the circle center is inside the polygon or if the minimum distance from center to any polygon edge is $\le \text{radius}$.
* **`circleContainedInPolygon(center, radius, polygon)`:** Verifies that the center is inside the polygon and distance to all boundary edges $\ge \text{radius}$.
* **`getShapeGeometryInWorld(shape, allShapes)`:** Converts any shape model into its world-space geometric representation (`polygon`, `polyline`, or `circle`), accounting for group hierarchy transforms and rotation around center $(c_x, c_y)$.
* **`hitTestShapeGeometry(geometry, selectionPoly, matchMode)`:** Dispatches the appropriate narrow-phase test based on geometry kind and match mode.

---

## 11. Transformer Integration & Multi-Drag

CanvasFlow retains its existing Konva Transformer subsystem without architecture regressions:
1. Each shape node (`RectangleNode`, `GroupNode`, etc.) renders its Konva `<Transformer>` when `isSelected && activeTool === CANVAS_TOOLS.SELECT`.
2. On multi-shape selection (`selectedShapeIds.length > 1`), dragging any selected shape delegates to `moveSelectedShapes(deltaX, deltaY)` in `useShapeTransform.ts`.
3. When initiating a drag on a shape that is already selected, `handleSelectionClick` preserves the multi-selection, allowing seamless multi-shape manipulation.

---

## 12. Panning vs. Selection Precedence

To eliminate tool conflicts between canvas navigation and selection gestures, CanvasFlow establishes strict input precedence:

1. **Middle Mouse Drag:** Pans canvas regardless of active tool (`button === 1`).
2. **Spacebar + Left Drag:** Smooth canvas pan (`draggable={isSpacePressed}`). Stage cursor shows `grab` / `grabbing`.
3. **Select Tool + Empty Canvas Drag:** Triggers direction-aware Marquee selection.
4. **Lasso Tool + Empty Canvas Drag:** Triggers freeform Lasso polygon selection.
5. **Empty Canvas Click ($< 3\text{px}$):** Clears selection and exits active group.

---

## 13. API & Internal Contracts

### 13.1 Exported Types (`selection.types.ts`)
```ts
export type SelectionMode = "replace" | "add" | "toggle";
export type MarqueeDirection = "left-to-right" | "right-to-left";
export type SelectionMatchMode = "containment" | "intersection";

export interface SelectionPoint {
  x: number;
  y: number;
}

export interface MarqueeState {
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
  direction: MarqueeDirection;
  matchMode: SelectionMatchMode;
}

export interface LassoState {
  points: SelectionPoint[];
}
```

### 13.2 Selection Controller (`SelectionController`)
```ts
export class SelectionController {
  constructor(options: SelectionControllerOptions);
  public getMarquee(): MarqueeState | null;
  public getLasso(): LassoState | null;
  public isSelecting(): boolean;
  public startSelection(worldPoint: SelectionPoint, mode?: SelectionMode): boolean;
  public updateSelection(worldPoint: SelectionPoint): void;
  public endSelection(): void;
  public handleShapeClick(shapeId: string, mode?: SelectionMode): void;
}
```

---

## 14. Verification & Test Coverage

### 14.1 Test Suites Executed
1. **Geometry Tests (`selection-geometry.utils.test.ts`):** 25/25 passed. Covers point-in-polygon, segment intersections, concave L-shapes, rotated shapes ($45^\circ$), circles, polylines, and degenerate cases.
2. **Policy Tests (`selection-policy.utils.test.ts`):** 17/17 passed. Covers root scope, group edit scope, nested group hit resolution, group invariant pruning, modifier modes, and broad-phase candidate filtering.
3. **Controller Tests (`selection.controller.test.ts`):** 10/10 passed. Covers marquee direction transitions, containment vs. intersection, lasso point accumulation, degenerate lasso rejection, and direct shape clicks.
4. **Store Tests (`canvas.store.test.ts`):** 32/32 passed. Covers `selectAllShapes` scope isolation and group descendant exclusion.
5. **Full Client Regression (`npm run test:run`):** 35 test files passed, 383/383 tests passed.
6. **Server Integration Tests (`npm run test:run`):** 21/21 passed (Auth + Workspace RBAC).
7. **Production Build (`npm run build`):** `tsc -b` and `vite build` completed with zero errors.

---

## 15. Architectural Decision Records (ADR)

### ADR 1: Decoupled Headless Controller vs. Inline CanvasEditor Logic
* **Context:** CanvasEditor is 1800+ lines coordinating Stage, layers, rendering, sockets, and keyboard shortcuts.
* **Decision:** Encapsulate selection interaction in `SelectionController` and wrap it via `useCanvasSelection`.
* **Consequence:** Zero UI coupling, 100% testable in pure Node.js environments without DOM or JSDOM overhead.

### ADR 2: Two-Stage Spatial Filtering vs. Full Narrow-Phase Testing
* **Context:** Evaluating SAT polygon intersections across hundreds of complex vector shapes on every pointer-move event causes frame drops below 60 FPS.
* **Decision:** Implement Stage 1 AABB bounding box pre-filtering before Stage 2 SAT geometry checks.
* **Consequence:** Rejects $>90\%$ of non-overlapping shapes in $O(1)$ operations, maintaining 60 FPS performance and preparing the architecture for future spatial index trees.

### ADR 3: Pure World-Space Coordinates vs. Viewport Stage Coordinates
* **Context:** Zooming or panning during a selection gesture could shift stage coordinates relative to shapes.
* **Decision:** Normalize all selection points to continuous world coordinates at input time via `screenToWorld`.
* **Consequence:** 100% viewport invariance across arbitrary zoom levels ($0.2\times$ to $3.0\times$) and canvas pan offsets.

---

## 16. Future Roadmap & Enhancements

The Slice 25 selection subsystem is designed to support the following future optimizations:
1. **Spatial Indexing (R-tree / Quadtree):** Replacing linear array broad-phase scans with an $O(\log N)$ R-tree spatial index for canvases with $10,000+$ shapes.
2. **Web Worker Offloading:** Offloading heavy SAT and polygon intersection calculations for massive freehand strokes to background Web Workers.
3. **Selection Snapping & Alignment:** Snapping marquee boundaries to nearby shape anchor points or grid lines.
4. **Touch & Stylus Pressure Sensitivity:** Pressure-weighted lasso point smoothing using Bezier curve fitting algorithms.
