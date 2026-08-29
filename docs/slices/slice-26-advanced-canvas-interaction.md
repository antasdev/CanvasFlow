# Slice 26 — Advanced Canvas Interaction & Navigation

## 1. Purpose

Viewport navigation is the foundational spatial gateway of CanvasFlow. A collaborative whiteboard is an unbounded two-dimensional canvas where users must navigate effortlessly across vast mindmaps, architecture diagrams, and wireframes.

Prior to Slice 26, viewport navigation suffered from significant architectural and ergonomic deficiencies:

1. **Hardware Fragmentation & Trackpad Conflicts:** Mouse wheel events treated every scroll gesture as a zoom operation (`zoom * 1.05`). Users on modern laptops with trackpads could not execute two-finger directional panning; any trackpad gesture triggered aggressive zooming.
2. **Missing Middle-Mouse and Hand Tool Navigation:** Industry-standard whiteboard and design workflows (Figma, Miro, Blender) rely heavily on middle-mouse button dragging and dedicated Hand tools (`H`) for panning without altering the active drawing or selection tool. Middle clicks were completely unhandled, and no Hand tool existed.
3. **Lack of Interaction Arbitration (State Machine):** Event handlers in `CanvasEditor.tsx` relied on fragmented boolean flags (`isSpacePressed`, `isSelecting`, `activeTool === ...`). A single pointer down could trigger multiple conflicting side effects or leave orphaned preview drafts when switching tools mid-gesture.
4. **Stuck Drag Gestures on Canvas Boundary Crossings:** Pointer release (`mouseup`) was bound solely to the Konva `<Stage>`. When users dragged outside the viewport and released the mouse, no `mouseup` event fired on the canvas, causing drag operations to become permanently stuck in active drawing or panning states.
5. **Escape Key Blind Spots:** Pressing `Escape` abruptly cleared shape selection or exited group edit mode, even when the user was in the middle of drawing a vector line, pulling a marquee box, or streaming a freehand stroke.
6. **Zero-Mutation Viewport Boundary:** Like selection, viewport navigation represents local, transient viewing coordinates. Pan and zoom operations must **never** touch persistent storage, trigger MongoDB mutations, create `MutationRecord` instances, increment `collaborationRevision`, or contaminate the local undo/redo history.

---

## 2. Architecture

Slice 26 establishes a modular, layered interaction and navigation architecture separating input capture, state arbitration, pure coordinate math, and UI controls:

```text
       Hardware Input (Wheel, Trackpad, Mouse, Touch, Keyboard)
                                 │
                                 ▼
                     CanvasInteractionController
                     (Deterministic Arbitration)
                                 │
       ┌─────────────────────────┴─────────────────────────┐
       ▼                                                   ▼
Viewport System                                  Tool / Selection System
• useCanvasViewport                              • useCanvasSelection
• viewport.utils                                 • Shape Drawing & Drafting
• CanvasZoomControls                             • Collaborative Streams
       │                                                   │
       ▼                                                   ▼
useCanvasStore (pan, zoom)                       Ephemeral Overlays / Nodes
       │                                                   │
       └─────────────────────────┬─────────────────────────┘
                                 ▼
                      Konva <Stage> Viewport
```

### 2.1 Interaction Arbitration State Machine

All pointer events pass through `CanvasInteractionController.determineInteractionOwner(context, tool, canEdit)` to establish a single, unambiguous owner:

| Priority | Condition | Interaction Mode | Owner / Behavior |
| :--- | :--- | :--- | :--- |
| **1** | Spacebar held OR Middle Mouse (`button === 1`) OR `HAND` tool | `"panning"` | `useCanvasViewport`: Pan viewport smoothly; cursor: `"grabbing"` |
| **2** | Transformer handle clicked | `"transforming"` | Konva `<Transformer>`: Shape resizing / rotation |
| **3** | Existing shape clicked with `SELECT` tool | `"selecting"` | Single / Multi-selection, transform drag |
| **4** | Empty canvas clicked with `SELECT` tool | `"marquee_selecting"` | `SelectionController`: Containment vs Intersection Marquee |
| **5** | Empty canvas clicked with `LASSO` tool | `"lasso_selecting"` | `SelectionController`: Freeform polygon selection |
| **6** | Empty canvas clicked with `FREEHAND` tool | `"drawing_freehand"` | Ephemeral stroke stream + RDP simplification |
| **7** | Empty canvas clicked with `LINE` / `ARROW` / `CONNECTOR` | `"drawing_vector"` | Transient vector drafting with anchor snapping |
| **8** | Empty canvas clicked with Basic Shape tools | `"drawing_shape"` | Real-time shape bounds calculation |
| **9** | Empty canvas clicked with `TEXT` tool | `"text_editing"` | Inline text creation overlay |

---

## 3. Pure Viewport Mathematics

All viewport calculations reside in pure, framework-agnostic utility functions in `client/src/features/canvas/utils/viewport.utils.ts`.

### 3.1 Pointer-Invariant Zoom Formula

When zooming, the world-space coordinate directly under the pointer cursor must remain completely stationary. Let:
- $P = (P_x, P_y)$ be the pointer position in screen coordinates.
- $Z_{current}$ and $T_{current} = (T_x, T_y)$ be the current zoom and pan translation.
- $Z_{target}$ be the target clamped zoom level.

1. **Calculate the stationary world point:**
   $$W = \frac{P - T_{current}}{Z_{current}}$$

2. **Derive the new pan translation to satisfy $P = W \cdot Z_{target} + T_{new}$:**
   $$T_{new} = P - W \cdot Z_{target}$$

This mathematical invariant ensures that zooming in on a small diagram detail never shifts that detail away from the user's cursor.

### 3.2 Trackpad Scroll vs. Pinch-to-Zoom Differentiation

Browser wheel events convey both trackpad panning and pinch-to-zoom:
- **Pinch-to-zoom or Ctrl+Scroll:** Emits a `wheel` event where `event.ctrlKey === true` or `event.metaKey === true`. Interpreted as **Pointer Zoom**.
- **Two-finger trackpad scroll or standard mouse wheel:** Emits a `wheel` event with `ctrlKey === false`. Interpreted as **Viewport Pan**:
  $$T_{new}.x = T_{current}.x - \Delta x$$
  $$T_{new}.y = T_{current}.y - \Delta y$$

### 3.3 Zoom Limits and Constants

Centralized in `client/src/features/canvas/constants/canvas.constants.ts`:
- `MIN_ZOOM = 0.2` (20%)
- `MAX_ZOOM = 3.0` (300%)
- `DEFAULT_ZOOM = 1.0` (100%)
- `ZOOM_STEP = 1.1`
- `ZOOM_PRESETS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 2.0, 3.0]`

---

## 4. Escape Key Cancellation Ladder

When the user presses `Escape`, `CanvasInteractionController.evaluateEscape` executes a strict cancellation priority hierarchy:

1. **Active In-Progress Drawing / Drafting:** Immediately clears `drawing`, `vectorDraft`, `freehandDrawing`, aborts active collaborative streams, and resets anchor snap indicators without creating shapes.
2. **Active In-Progress Selection:** Aborts active marquee or lasso gesture without altering current shape selections.
3. **Active In-Progress Panning:** Cancels drag-panning and restores initial pan coordinates.
4. **Pending Text Creation:** Closes pending text input overlay.
5. **Active Group Isolation Mode:** Exits group editing mode to root canvas.
6. **Active Shape Selection:** Clears selected shape IDs (`selectedShapeIds = []`).
7. **Active Tool:** Resets `activeTool` back to `CANVAS_TOOLS.SELECT`.

---

## 5. Tool Switching Lifecycle & Safety

When the user switches tools (e.g. from `rectangle` to `hand` or `select`), `CanvasInteractionController.handleToolSwitch(previousTool, nextTool)` executes cleanup:
- Safely cancels any uncommitted shape drafts or vector previews.
- Concludes open selection bounding boxes.
- Aborts active collaborative drawing interactions (`socketClientService.endInteraction`).
- Computes and applies the new default cursor (`"grab"` for Hand, `"crosshair"` for drawing/lasso, `"text"` for Text, `"default"` for Select).

Additionally, window-level event listeners on `pointerup` and `pointercancel` ensure that releasing the mouse or lifting a finger outside the browser window gracefully concludes active panning and dragging gestures.

---

## 6. Architectural Decision Records (ADRs)

### ADR 1: Centralized Headless Arbitration Controller over Event Propagation Hacks
- **Context:** Multiple subsystems (Konva stage dragging, shape nodes, marquee selection, vector drawing) competed for pointer events.
- **Decision:** Implement `CanvasInteractionController` as a pure, headless state machine determining ownership prior to executing any side effects.
- **Consequences:** Eliminates accidental simultaneous interactions (e.g., drawing a rectangle while panning). Zero regressions in existing Slice 25 selection and shape transformations.

### ADR 2: Controlled Pan State Management over Konva `<Stage draggable>`
- **Context:** Konva's `<Stage draggable>` manipulates internal container transforms without updating `useCanvasStore.pan` until `onDragEnd`. This caused screen-anchored overlays (toolbars, comment badges, text editors) to lag behind or become misaligned during drags.
- **Decision:** Drive panning through controlled pointer updates in `useCanvasViewport` using `startPan`, `updatePan`, `endPan`, and `cancelPan`.
- **Consequences:** Overlays remain perfectly synchronized in real time during panning across Spacebar, Middle-mouse, and Hand tool operations.

### ADR 3: Pure Mathematics Separation
- **Context:** Viewport math was formerly inlined in component event callbacks with magic numbers.
- **Decision:** Extract all coordinate and zoom calculations into `viewport.utils.ts` with 100% test coverage.
- **Consequences:** Highly testable, zero side effects, clean reusability in zoom controls, minimaps, and export functions.

### ADR 4: Strictly Ephemeral Navigation Lifecycle
- **Context:** Viewport navigation must not pollute server data or client undo stacks.
- **Decision:** Pan and zoom state are kept strictly ephemeral in `useCanvasStore` with 0 MongoDB writes, 0 `MutationRecord` entities, 0 `collaborationRevision` increments, and 0 history snapshots.
- **Consequences:** High-performance, 60fps pan/zoom interactions without database or network overhead.

---

## 7. Verification Summary

### 7.1 Automated Test Suites

1. **Pure Viewport Math (`viewport.utils.test.ts`):**
   - 12/12 unit tests passing.
   - Verified world-point invariance across zoom-in, zoom-out, arbitrary canvas offsets, and boundary clamping.
2. **Arbitration State Machine (`canvas-interaction.controller.test.ts`):**
   - 22/22 unit tests passing.
   - Verified pan override, transformer precedence, shape selection, tool switching cleanup, and the 7-step Escape cancellation ladder.
3. **Canvas Feature Suite:**
   - 29 test files, 345/345 tests passed.
4. **Full Client Regression:**
   - 37 test files, 417/417 tests passed (0 failures).
5. **Backend RBAC & Auth Regression:**
   - 21/21 integration tests passed.
6. **Production Build:**
   - `tsc -b && vite build` passed with 0 errors.
