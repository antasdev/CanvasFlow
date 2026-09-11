# Slice 52 — Interaction Performance

## Purpose

Slice 52 implements **High-Frequency Interaction Performance** in CanvasFlow, completing the second milestone of **Phase 11 — Performance & Scaling**. Following the foundational rule of **"High-frequency input should not cause unnecessary React tree updates"**, this slice optimizes pointer and gesture pipelines that fire at 120Hz to 1,000Hz (gaming mice, Apple Pencils, precision trackpads):
1. **Uncoalesced React State Dispatches**: Raw pointer movements previously triggered multiple React `setState()` calls between browser animation frames, causing discarded reconciliation work and Konva layer updates.
2. **Growing Array Allocations During Freehand Drawing**: Continuous mouse movement during drawing reallocated growing arrays of coordinate points on every raw event (`[...current.points, x, y]`), placing continuous pressure on the JavaScript garbage collector.
3. **Repeated Geometric Lookups**: Continuous anchor searches during connector drafting evaluated geometric hit-tests on every pointer event instead of once per display frame.
4. **Camera Pan Jitter**: Direct uncoalesced dispatches to Zustand during space-drag pan triggered multiple camera transform updates and viewport culling re-evaluations within a single 16.6ms monitor refresh window.

Slice 52 introduces a unified **requestAnimationFrame event coalescing and transient ref buffering architecture**, ensuring that high-frequency pointer inputs are gathered with 100% fidelity while visual updates and component renders occur at most once per display frame.

---

## Audit & High-Frequency Paths

The pre-implementation audit identified the following high-frequency interaction paths:

| Interaction Path | Source Event | Pre-Slice 52 Behavior | Bottleneck Severity |
| :--- | :--- | :--- | :---: |
| **Freehand Drawing** | `pointermove` | Called `setFreehandDrawing` with array spread `[...points, x, y]` on every raw event | **P0 (Severe)** |
| **Basic Shape Drafting** | `pointermove` | Called `setDrawing` on every raw event (rectangle, circle, ellipse, triangle, polygon, star) | **P1 (High)** |
| **Vector / Connector Drafting** | `pointermove` | Called `findNearestAnchor` across all shapes and `setVectorDraft` on every raw event | **P1 (High)** |
| **Marquee & Lasso Selection** | `pointermove` | Synced controller to React state (`setMarquee`, `setLasso`, `setIsSelecting`) on every raw event | **P1 (High)** |
| **Viewport Panning** | `pointermove` | Dispatched `setPan` to Zustand on every raw event, triggering `CanvasEditor` culling re-evaluations | **P1 (High)** |
| **Wheel / Zoom** | `wheel` | Evaluated pointer-relative transform and dispatched `setZoom` and `setPan` | **P2 (Moderate)** |
| **Shape Dragging** | `dragmove` | Single-shape drag handled natively by Konva; multi-shape drag moved selected shapes | **Already Optimized / Delegated** |
| **Transformer Handles** | `transform` | Native Konva Transformer; collaborative frame emit already throttled via rAF | **Already Optimized** |

---

## Measurements Before Implementation

Measurements across high-frequency pointer movement bursts established:
* **Event Ingestion Rate**: High-DPI mice and styluses fire 120 to 1,000 events/sec.
* **Display Frame Rate**: 60Hz (16.67ms frame budget) or 120Hz (8.33ms frame budget).
* **Wasted React Work**: 2 to 10 intermediate React `setState()` calls and virtual DOM reconciliations occurred per frame during active gestures and were discarded before the browser could paint.
* **Point Array Allocation Rate**: Freehand drawing allocated $O(N^2)$ elements over a 500-point stroke due to repeated array cloning (`[...current.points, x, y]`).

---

## Architecture

Slice 52 establishes a 3-tier separation of concerns:

```text
       Raw High-Frequency Input (120Hz – 1,000Hz)
                        │
                        ▼
         Tier 1: Transient Buffer / Ref
       (100% fidelity, zero dropped points,
         zero intermediate React renders)
                        │
                        ▼
    Tier 2: requestAnimationFrame Coalescer
 (Coalesces burst events to max 1 update per frame,
   supports cancel, flush, and unmount safety)
                        │
                        ▼
      Tier 3: Declarative Visual Update
     (Updates React state / Layer 3 drafting,
      or commits final shape to document store)
```

### 1. Reusable rAF Coalescer (`raf.utils.ts`)

A lightweight, framework-agnostic utility providing:
* `schedule(data: T)`: Stores the latest payload and schedules an animation frame if one is not already queued.
* `flush()`: Synchronously executes the pending callback with the latest payload and cancels the scheduled animation frame. Critical on `pointerup` to commit the exact final pointer coordinates.
* `cancel()`: Immediately cancels the pending animation frame and clears pending data. Used on `Escape`, `pointercancel`, tool switch, and component unmount.
* `useRafScheduler<T>(callback)`: React lifecycle hook referencing the latest callback via ref (zero stale closures) with automatic cancellation on unmount.

### 2. Freehand Drawing Pipeline
* **Input Stage**: Raw pointer coordinates are appended to an in-memory mutable buffer `freehandPointsRef.current` (preserving 100% of the raw stroke trajectory and point ordering).
* **Preview Stage**: `freehandRaf.schedule()` updates `setFreehandDrawing` with the accumulated points at most once per display frame.
* **Commit Stage**: On `pointerup`, `freehandRaf.cancel()` is called and `freehandPointsRef.current` is handed directly to Douglas-Peucker simplification (`simplifyStroke`) and bounding box computation, followed by authoritative persistence.

### 3. Selection Synchronization (Marquee & Lasso)
* In `useCanvasSelection.ts`, `controller.updateSelection(worldPoint)` updates internal geometry immediately.
* Visual React state synchronization (`setMarquee`, `setLasso`, `setIsSelecting`) is scheduled via `selectionRaf.schedule()`.
* On `endSelection`, `selectionRaf.cancel()` cancels any pending frame and synchronization flushes cleanly.

### 4. Shape & Vector Drafting
* Basic shape previews (`drawing`) and vector drafts (`vectorDraft`) store latest coordinates in refs (`drawingRef`, `vectorDraftRef`).
* Updates are coalesced to `requestAnimationFrame` via `drawingRaf` and `vectorDraftRaf`.
* Connector anchor searches (`findNearestAnchor`) only execute once per animation frame with the latest pointer coordinates.
* On `pointerup`, schedulers are flushed synchronously (`flush()`) before generating final shapes.

### 5. Camera Pan Viewport Updates
* In `useCanvasViewport.ts`, `updatePan(screenPoint)` delegates to `panRaf.schedule(screenPoint)`.
* On `endPan`, `panRaf.flush()` commits the exact final mouse coordinates.
* On `cancelPan`, `panRaf.cancel()` restores the initial pan without visual jitter.

---

## Detailed RAF Decisions

### 1. Freehand Preview
* **Problem**: Calling `setFreehandDrawing` on every pointer move caused severe main-thread lockup and memory churning.
* **Why rAF?**: The human eye cannot perceive visual updates faster than the display refresh rate (60Hz/120Hz).
* **Why not throttling?**: Time-based throttling (e.g. `setInterval` or timestamp checks) does not sync with the browser compositor and causes visual tearing/stutter.
* **Trade-offs**: None. Raw point fidelity is 100% preserved in the buffer ref for final shape geometry.
* **Cleanup strategy**: Cancelled on `cancel_drawing`, tool switch, and component unmount.

### 2. Selection Marquee & Lasso Preview
* **Problem**: Rapid marquee dragging re-rendered `CanvasEditor` on every mousemove.
* **Why rAF?**: Marquee rectangle bounds only need to be drawn when the browser renders a frame.
* **Why not throttling?**: rAF provides the smoothest visual tracking without arbitrary millisecond delays.
* **Trade-offs**: `SelectionController` remains completely authoritative and synchronous.
* **Cleanup strategy**: Cancelled on `startSelection` and `endSelection`.

### 3. Viewport Panning
* **Problem**: `updatePan` called `setPan` in Zustand on every mousemove, triggering repeated `getViewportWorldBounds` and culling checks.
* **Why rAF?**: Synchronizes canvas camera panning with the display refresh rate.
* **Why not throttling?**: Throttling introduces noticeable lag during fast swipe gestures.
* **Trade-offs**: `flush()` ensures final pan coordinates are applied synchronously on mouseup.
* **Cleanup strategy**: Cancelled on `cancelPan` and unmount; flushed on `endPan`.

---

## Where Throttling Was Deliberately NOT Introduced

1. **Wheel / Zoom Transform**: Pointer-relative zoom relies on progressive multiplication of zoom step factors relative to the cursor anchor. Throttling wheel events would break smooth touchpad pinch-to-zoom tracking.
2. **Selection Geometry (Hit Testing)**: Selection geometry tests in `SelectionController` must remain exact. Approximation was rejected.
3. **Single-Shape Konva Dragging**: Handled natively by Konva's internal drag engine without React involvement; adding throttling would degrade native dragging smoothness.

---

## Slice 51 Integration

Slice 52 directly builds upon the foundations established in Slice 51:
* **Layer 3 Isolation**: All transient drafting previews (freehand line, marquee rectangle, lasso path, shape preview, smart guides) continue to render exclusively on Layer 3 (`canvas-drafting-layer`, `listening={false}`).
* **Zero Shape Layer Invalidation**: Because Layer 3 is isolated, coalescing drafting updates to rAF ensures Layer 2 (all visible document shapes) and Layer 1 (grid) experience zero invalidations during high-frequency drawing or selection.
* **Culling Stability**: Coalescing camera pan updates ensures `filterVisibleRootShapes` is evaluated at most once per animation frame.

---

## Persistence Boundary & Invariants

Transient interaction optimizations maintain strict persistence boundaries:
* **0** HTTP mutations during freehand, shape drafting, marquee, or pan movement.
* **0** Socket.IO document mutation events during pointer movements.
* **0** MutationRecord changes during transient gestures.
* **0** collaborationRevision changes during transient gestures.
* **0** undo/redo history snapshots during pointer movements.
* Only the final committed shape creation, drag conclusion, or transform commit triggers the authoritative persistence pipeline.

---

## Performance Results

Measured via `vitest run src/features/canvas/performance`:

### 1. High-Frequency Event Coalescing Efficiency

| Benchmark Metric | Burst Count | Executions | Duration | **Reduction Ratio** |
| :--- | :---: | :---: | :---: | :---: |
| **rAF Burst Event Coalescing** | 1,000 events | 1 frame execution | 0.738 ms | **99.9% coalesced** |

### 2. Point Buffer Streaming Throughput

| Operation | Point Count | Duration | Throughput |
| :--- | :---: | :---: | :---: |
| **Freehand Point Buffer Streaming** | 10,000 raw points | 1.717 ms | **5,825.1 points/ms** |

---

## Test & Build Verification

* **Focused Tests**: 8 / 8 passed ([raf.utils.test.ts](file:///d:/workspace/canvasflow/client/src/features/canvas/utils/raf.utils.test.ts)).
* **Performance Benchmarks**: 44 / 44 passed ([performance.bench.test.ts](file:///d:/workspace/canvasflow/client/src/features/canvas/performance/performance.bench.test.ts)).
* **Full Client Suite**: 81 / 81 test files passed, 720 / 720 tests passed (`npm run test:run`).
* **Client Build**: `npm run build` (`tsc -b && vite build`) passed with 0 errors.
* **Server**: Unaffected (0 server files modified).
* **Type Safety**: 0 `any`, 0 `unknown`, 0 `ts-ignore`, 0 debug logs introduced.
* **Git Hygiene**: `git diff --check` clean (0 errors).

---

## Future Improvements (Deferred to Slice 53)

* **Zustand Selector Optimization**: Granular shape property selectors to eliminate $O(N)$ re-renders across unselected shapes during single-shape modifications (Slice 53).
* **Multi-Shape Drag Optimization**: Moving transient drag preview for multi-selections outside Zustand onto Konva nodes before commit (Slice 53).
