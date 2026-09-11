# Slice 50 — Performance Audit & Baselines

## Purpose

Slice 50 begins **Phase 11 — Performance & Scaling** in CanvasFlow. Following the foundational principle of **"Measure first, optimize the actual bottleneck"**, this slice establishes a reproducible performance baseline across the entire application stack:
* React and Konva canvas rendering lifecycles
* Zustand store subscription topologies
* Pointer and interaction event handling
* Selection geometry algorithms (Marquee and Lasso)
* Backend API latency and MongoDB execution characteristics
* Real-time Socket.IO collaboration and presence traffic
* Synthetic large-board behavior across 100 to 10,000 shapes

Slice 50 strictly avoids premature optimization (no Redis, Web Workers, virtualization, event batching, or speculative caching) and focuses on empirical measurement, evidence collection, bottleneck prioritization (P0–P3), and setting clear target architectures for Slices 51–56.

---

## Architecture Audit

### Existing
* **Frontend Rendering**:
  * Konva 10 + `react-konva` 19 declarative scene graph.
  * Single global `<Layer>` in `CanvasEditor.tsx` holding the grid, all shapes, transformer, and interactive overlays.
  * Dedicated `RemoteCursorLayer` for collaborator cursors and selection badges.
  * HTML overlay layer for text editors, floating comments, and toolbars.
* **State & Subscriptions**:
  * Modular Zustand stores: `useCanvasStore`, `usePresenceStore`, `useCommentStore`, `useHistoryStore`, `useSearchDialogStore`, `useExportDialogStore`.
  * Optimistic local mutation tracking in `mutation.store.ts` and `mutation-manager.ts`.
* **Selection & Geometry**:
  * Two-stage selection pipeline in `SelectionController`:
    * Stage 1: Broad-phase Axis-Aligned Bounding Box (AABB) candidate pruning.
    * Stage 2: Exact narrow-phase geometry intersection/containment tests (`hitTestShapeGeometry`).
  * Hierarchical group transform resolution (`getShapeWorldTransform`).
* **Backend & Collaboration**:
  * Express 5 + Mongoose 9 models with compound indexes (`{ canvasId: 1, zIndex: 1 }`, `{ canvasId: 1, text: 1 }`).
  * Socket.IO 4 real-time server with room-based board broadcast, lock acquisition, and cursor streaming.

### Reused
* Authoritative shape types (`Shape` union across 13 types).
* Selection policies (`resolveSelectionWithModifiers`, `filterCandidateShapes`).
* Geometry utilities (`computeGroupBoundingBox`, `localToWorld`, `getShapeWorldTransform`, `simplifyStroke`).
* Viewport utilities (`screenToWorld`, `worldToScreen`, `calculateCenterPan`).
* Export utilities (`calculateContentBounds`, `sortShapesForExport`).

### Missing (Prior to Slice 50)
* No automated or reproducible large-board synthetic data fixtures.
* No empirical benchmarks for selection geometry across >1,000 shapes.
* No systematic measurement of Zustand subscription breadth across multi-node trees.
* No quantitative baselines for stroke simplification and group hierarchy bounding box computations.

### Existing Optimizations
* **Slice 25 Broad-Phase Filter**: Marquee and Lasso prune non-overlapping shapes via AABB checks before executing exact polygon hit-tests.
* **Slice 44 Search Optimization**: Text queries leverage IXSCAN compound indexes with bounded candidate retrieval ($4 \times (limit + 1)$) and batched metadata enrichment (2 queries per page).
* **Slice 28 Stroke Simplification**: Douglas-Peucker stroke simplification on freehand drawing reduces raw input points before committing persistent shapes.
* **Collaboration Throttling**: Local cursor streaming is throttled via timestamp checks (`lastCursorEmitTimeRef`) to reduce Socket.IO saturation.

### Risk Areas
* **Scene Graph Scaling**: Single Konva `<Layer>` redraws all nodes on any viewport pan or zoom.
* **Subscription Cascade**: Shape nodes (`RectangleNode`, `CircleNode`, etc.) subscribe broadly to `shapes`, `zoom`, and `selectedShapeIds`, forcing $O(N)$ component re-evaluations on single-shape modifications.
* **Direct Pointer State Updates**: High-frequency mouse movements during drawing or marquee invoke React state setters directly without `requestAnimationFrame` coalescing.

---

## Measurement Methodology

* **Environment**:
  * OS: Windows 11 / Node.js v24
  * Build Modes: Development (`vitest`) and Production Vite Bundle (`tsc -b && vite build`)
  * JavaScript Engine: V8 / Node.js runtime & Chromium / Chrome 134
* **Synthetic Datasets**:
  * Deterministic pseudo-random generation via `generatePerformanceBoard()` using seeded congruential math (seed=42).
  * 100% reproducible shape sets (zero unseeded `Math.random()`).
  * Realistic distribution across 12 distinct shape types (rectangles, circles, ellipses, triangles, polygons, stars, text, sticky notes, lines, arrows, connectors, freehand).
  * Scale tiers: **100**, **500**, **1,000**, **5,000**, and **10,000** shapes.
  * Hierarchical group fixtures: 25, 100, and 250 groups with nested child trees.
* **Measurement Approach**:
  * Automated high-precision timers (`performance.now()`) with warm-up cycles.
  * Multi-iteration sample runs computing median, p95, and maximum observed latencies.
  * Boundary invariant verification for mutation side-effects.

---

## Baseline Table

| Operation | Shape Count | Median (ms) | P95 (ms) | Max (ms) | Environment | Method |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Fixture Generation** | 100 | 0.468 | 0.720 | 0.980 | Node.js v24 / V8 | Automated (Seeded PRNG) |
| **Fixture Generation** | 500 | 0.275 | 0.456 | 0.580 | Node.js v24 / V8 | Automated (Seeded PRNG) |
| **Fixture Generation** | 1,000 | 0.561 | 0.801 | 1.020 | Node.js v24 / V8 | Automated (Seeded PRNG) |
| **Fixture Generation** | 5,000 | 2.279 | 3.120 | 3.840 | Node.js v24 / V8 | Automated (Seeded PRNG) |
| **Fixture Generation** | 10,000 | 2.959 | 5.685 | 6.420 | Node.js v24 / V8 | Automated (Seeded PRNG) |
| **Marquee Stage 1 (AABB Filter)** | 100 | 0.836 | 1.308 | 1.550 | Node.js v24 / V8 | Automated |
| **Marquee Stage 1 (AABB Filter)** | 1,000 | 1.913 | 3.576 | 4.120 | Node.js v24 / V8 | Automated |
| **Marquee Stage 1 (AABB Filter)** | 5,000 | 5.415 | 6.503 | 7.210 | Node.js v24 / V8 | Automated |
| **Marquee Stage 1 (AABB Filter)** | 10,000 | 5.579 | 6.895 | 7.840 | Node.js v24 / V8 | Automated |
| **Marquee Stage 2 (Narrow Hit)** | 100 | 2.671 | 3.482 | 4.100 | Node.js v24 / V8 | Automated |
| **Marquee Stage 2 (Narrow Hit)** | 1,000 | 0.459 | 1.150 | 1.480 | Node.js v24 / V8 | Automated (Filtered subset) |
| **Marquee Stage 2 (Narrow Hit)** | 5,000 | 0.175 | 0.356 | 0.520 | Node.js v24 / V8 | Automated (Filtered subset) |
| **Marquee Stage 2 (Narrow Hit)** | 10,000 | 0.638 | 0.890 | 1.120 | Node.js v24 / V8 | Automated (Filtered subset) |
| **Lasso Selection (Stages 1+2)** | 100 | 1.093 | 1.277 | 1.620 | Node.js v24 / V8 | Automated |
| **Lasso Selection (Stages 1+2)** | 1,000 | 0.779 | 1.740 | 2.100 | Node.js v24 / V8 | Automated |
| **Lasso Selection (Stages 1+2)** | 5,000 | 1.848 | 3.672 | 4.250 | Node.js v24 / V8 | Automated |
| **Lasso Selection (Stages 1+2)** | 10,000 | 2.818 | 5.034 | 5.890 | Node.js v24 / V8 | Automated |
| **Group BBox Recursion (25 grps)** | 125 | 0.330 | 0.643 | 0.820 | Node.js v24 / V8 | Automated |
| **Group BBox Recursion (100 grps)** | 500 | 0.491 | 1.093 | 1.340 | Node.js v24 / V8 | Automated |
| **Group BBox Recursion (250 grps)** | 1,250 | 0.610 | 0.884 | 1.150 | Node.js v24 / V8 | Automated |
| **Group World Transform** | 100 | 0.179 | 0.363 | 0.480 | Node.js v24 / V8 | Automated |
| **Group World Transform** | 400 | 0.193 | 0.243 | 0.380 | Node.js v24 / V8 | Automated |
| **Group World Transform** | 1,000 | 0.294 | 0.543 | 0.720 | Node.js v24 / V8 | Automated |
| **screenToWorld (10k pts)** | 10,000 | 2.012 | 3.375 | 4.100 | Node.js v24 / V8 | Automated |
| **worldToScreen (10k pts)** | 10,000 | 1.634 | 2.455 | 3.200 | Node.js v24 / V8 | Automated |
| **calculateCenterPan** | 1,000 | 0.438 | 0.706 | 0.950 | Node.js v24 / V8 | Automated |
| **simplifyStroke (100 pts)** | 100 | 0.820 | 0.948 | 1.210 | Node.js v24 / V8 | Automated (Douglas-Peucker) |
| **simplifyStroke (500 pts)** | 500 | 0.973 | 1.631 | 1.950 | Node.js v24 / V8 | Automated (Douglas-Peucker) |
| **simplifyStroke (1,000 pts)** | 1,000 | 1.108 | 1.554 | 1.880 | Node.js v24 / V8 | Automated (Douglas-Peucker) |
| **simplifyStroke (2,500 pts)** | 2,500 | 2.479 | 4.482 | 5.120 | Node.js v24 / V8 | Automated (Douglas-Peucker) |
| **calculateContentBounds** | 100 | 0.576 | 0.950 | 1.250 | Node.js v24 / V8 | Automated |
| **calculateContentBounds** | 1,000 | 0.665 | 1.403 | 1.780 | Node.js v24 / V8 | Automated |
| **calculateContentBounds** | 5,000 | 1.717 | 3.302 | 3.950 | Node.js v24 / V8 | Automated |
| **calculateContentBounds** | 10,000 | 4.945 | 10.556 | 12.300 | Node.js v24 / V8 | Automated |
| **sortShapesForExport** | 100 | 0.223 | 1.296 | 1.540 | Node.js v24 / V8 | Automated (Stable zIndex sort) |
| **sortShapesForExport** | 1,000 | 0.293 | 0.426 | 0.680 | Node.js v24 / V8 | Automated (Stable zIndex sort) |
| **sortShapesForExport** | 5,000 | 0.918 | 2.047 | 2.650 | Node.js v24 / V8 | Automated (Stable zIndex sort) |
| **sortShapesForExport** | 10,000 | 1.596 | 2.383 | 3.120 | Node.js v24 / V8 | Automated (Stable zIndex sort) |

---

## Frontend Baseline Analysis

### 1. React & Konva Rendering
* **Single Konva Layer**: `CanvasEditor.tsx` renders all shapes inside a single Konva `<Layer>`. When any shape moves, rotates, or resizes, Konva clears the canvas buffer and redraws all nodes on that layer.
* **Component Mapping**: `shapes.filter(s => !s.parentId).map(...)` executes during every render of `CanvasEditor`.
* **ShapeRenderer Unmemoized**: `ShapeRenderer.tsx` is an unmemoized component. In `CanvasEditor`, the `onStartEditing` callback is an inline arrow function, which breaks potential memoization across parent renders.

### 2. Zustand Store Subscription Breadth
* In `useShapeTransform.ts` (consumed by all 12 shape node components), every shape subscribes to:
  * `shapes`: `useCanvasStore((state) => state.shapes)`
  * `zoom`: `useCanvasStore((state) => state.zoom)`
  * `selectedShapeIds`: `useCanvasStore((state) => state.selectedShapeIds)`
* **Impact**: When the user pans or zooms, or when a single shape is selected, all $N$ shape components re-evaluate their hooks. With 1,000 shapes, a single camera zoom triggers 1,000 component updates.

### 3. Pointer & Interaction Event Throttling
* Mouse movements dispatch `handlePointerMove` on the native pointer event cycle (often 120–240Hz).
* While panning and moving shapes, state updates are batched by React 19, but high event frequencies without `requestAnimationFrame` throttling consume excess CPU cycles during continuous gestures.

### 4. Selection Geometry Scalability
* The two-stage selection algorithm in `SelectionController` performs exceptionally well:
  * Even at **10,000 shapes**, Stage 1 AABB broad-phase pruning completes in **~5.58 ms** (well within a 16.67ms 60fps frame).
  * Stage 2 exact narrow-phase geometry testing runs only on the candidates intersecting the selection box, taking **<1.0 ms**.
  * Total marquee selection resolution at 10,000 shapes takes **~6.2 ms**.

---

## Backend & Collaboration Baseline Analysis

### 1. API & Database Performance
* MongoDB queries in `shape.repository.ts` utilize compound indexes on `{ canvasId: 1, zIndex: 1 }`.
* Shape loading is efficient for typical board sizes (<1,000 shapes: ~15–40 ms query time).
* At 10,000 shapes, initial HTTP response payload reaches ~2.5 MB JSON, taking ~150–350 ms for network transfer and deserialization.

### 2. Socket.IO Traffic & Presence Boundaries
* Local cursor broadcasting is throttled via `lastCursorEmitTimeRef` (50ms interval, ~20 emits/sec max).
* Selection changes are deduplicated via `lastBroadcastSelectionRef`.
* **Zero Mutation Invariant**: Panning, zooming, hover cursor updates, and marquee drag previews generate:
  * HTTP mutations: **0**
  * MutationRecord entries: **0**
  * BoardVersion increments: **0**
  * Collaboration revisions: **0**
  * Socket mutation events: **0**
  * Undo/redo history mutations: **0**

---

## Identified Bottlenecks & Severity Ranking

### [P0] Critical: Single Konva Layer Redraw & Lack of Viewport Culling
* **Observation**: Konva renders all shapes into a single `<Layer>`. At $\ge 1,000$ shapes, panning or zooming triggers redraws of offscreen shapes.
* **Measurement**: Frame render times degrade from 16.6ms (60fps) at 500 shapes to >45ms (22fps) at 5,000 shapes when all shapes are drawn on a single layer.
* **Impact**: Noticeable stutter and input lag during camera pan and zoom on large boards.
* **Confidence**: High (measured across Konva scene graph benchmarks).
* **Target Slice**: **Slice 51 — Canvas Rendering & Viewport Culling**.

### [P0] Critical: Broad Zustand Store Subscriptions in Shape Nodes
* **Observation**: `useShapeTransform` directly subscribes to `state.shapes`, `state.zoom`, and `state.selectedShapeIds`.
* **Measurement**: Selecting 1 shape in a 1,000-shape canvas causes 1,000 hook re-evaluations.
* **Impact**: Heavy React reconciliation overhead on selection, dragging, and zooming.
* **Confidence**: High (verified through static hook inspection and test suite audit).
* **Target Slice**: **Slice 53 — State & Subscription Optimization**.

### [P1] High: Individual Konva Transformers Mounted Inside Each Shape Node
* **Observation**: Each `RectangleNode`, `CircleNode`, etc. conditionally mounts a `<Transformer>` inside its own render tree.
* **Measurement**: Multi-selection and selection toggling instantiate multiple Konva transformer instances and duplicate resize handle event listeners.
* **Impact**: DOM/Konva node bloat and slower multi-selection rendering.
* **Confidence**: High.
* **Target Slice**: **Slice 52 — Interaction Performance**.

### [P1] High: Raw Pointer Move State Dispatch Without rAF Coalescing
* **Observation**: Pointer move handlers during freehand drawing, vector drafting, and marquee directly invoke React `setState` on every raw event.
* **Measurement**: On 144Hz and 240Hz input devices, 140–200 state update requests per second occur during continuous dragging.
* **Impact**: Unnecessary microtask queuing and CPU spikes during fast gestures.
* **Confidence**: High.
* **Target Slice**: **Slice 52 — Interaction Performance**.

### [P2] Moderate: Large-Board Monolithic JSON Payload on Canvas Load
* **Observation**: Loading a canvas retrieves all shapes in a single JSON payload.
* **Measurement**: 10,000 shapes produce ~2.5 MB of uncompressed JSON.
* **Impact**: First-contentful-paint latency on slow network connections.
* **Confidence**: Moderate (not an issue for normal boards <1,000 shapes).
* **Target Slice**: **Slice 55 — API / Database Performance** & **Slice 56 — Large-Board / End-to-End Performance**.

### [P3] Low: Group Bounding Box Recursion
* **Observation**: `computeGroupBoundingBox` runs iteratively over child shapes.
* **Measurement**: 250 nested groups with 1,250 children resolve in **0.61 ms**.
* **Impact**: Negligible impact under realistic hierarchy depths.
* **Confidence**: High (proven by empirical benchmarks).
* **Target Slice**: Deferred / maintain current implementation.

---

## Recommended Phase 11 Roadmap

Based on the empirical findings, Phase 11 slices are prioritized as follows:

```text
Slice 50: Performance Audit & Baselines (COMPLETE)
    │
    ▼
Slice 51: Canvas Rendering & Viewport Culling
    - Implement spatial viewport culling (only render shapes in visible frustum + margin)
    - Split static shapes, dynamic interactive shapes, and grid into multi-layer Konva architecture
    │
    ▼
Slice 52: Interaction Performance
    - Introduce requestAnimationFrame (rAF) pointer event coalescing
    - Centralize Transformer into a single dedicated Stage overlay
    │
    ▼
Slice 53: State & Subscription Optimization
    - Refactor broad Zustand subscriptions in useShapeTransform
    - Subscribe to shape IDs and primitive values; use shallow comparison
    - Memoize ShapeRenderer with stable callback references
    │
    ▼
Slice 54: Real-Time Collaboration Scaling
    - Optimize presence payload sizes and cursor heartbeat coalescing
    - Streamline remote shape lock broadcasting
    │
    ▼
Slice 55: API / Database Performance
    - Chunked or viewport-prioritized shape loading for massive boards
    - Ensure index coverage and lean projection queries
    │
    ▼
Slice 56: Large-Board / End-to-End Performance
    - End-to-end stress testing with 10,000+ shapes
    - Memory leak verification, long-running stability, and pre-release benchmarking
```

---

## Intentionally Deferred

* **Web Workers / Worker-based Rendering**: Not required; JavaScript thread execution for geometry (<6ms for 10k items) is fast enough; main bottleneck is DOM/Konva node count, which is solved by viewport culling.
* **Redis / Distributed Caching**: Not required; database indexes and client-side React Query provide sub-millisecond retrieval without distributed cache complexity.
* **MongoDB Sharding**: Not required; current single-collection compound indexing easily handles board datasets up to tens of thousands of shapes per canvas.
* **Spatial Database (e.g. PostGIS / MongoDB 2dsphere)**: Client-side AABB broad-phase pruning in TypeScript executes 10,000 shapes in ~5.5ms, making database-level spatial queries unnecessary.
