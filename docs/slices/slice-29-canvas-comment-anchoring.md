# Slice 29 — Canvas Comment Anchoring & UI

## Master Architectural Documentation & Production Verification

### Executive Summary

Slice 29 implements **Canvas Comment Anchoring & UI** in CanvasFlow. It delivers a dedicated comment tool, world-space coordinate anchoring, canvas comment markers, floating in-canvas composer, seamless synchronization with the comment panel, strict interaction arbitration, and real-time collaborative updates.

This slice preserves the foundational architectural principle established in Slice 28: **Comments are collaboration metadata, NOT canvas Shapes**. They do not participate in Konva shape pipelines, shape selection states, transformer mutations, or canvas undo/redo history.

```text
Canvas Geometry
      ↓
Comment Anchor (World Coordinates { x, y })
      ↓
Comment Thread (Root Comment)
      ↓
Comment Messages (Thread Replies)
```

---

## 1. Purpose: Why Canvas Comment Anchoring Exists

In modern visual collaboration software (e.g., Figma, FigJam, Miro), comments are placed directly onto the infinite whiteboard to annotate designs, ask questions, and conduct reviews.

1. **Contextual Whiteboard Placement:** Placing comments at specific spatial coordinates allows collaborators to discuss diagrams, flows, and wireframes in-situ.
2. **Coordinate Stability:** As users pan across the board or zoom between 20% and 300%, comment pins must remain fixed to their exact spatial location without drifting or becoming unaligned.
3. **Collaboration Metadata Isolation:** Comments represent conversations between people. Keeping them outside the graphical rendering model ensures that graphical actions (such as `Ctrl+Z` to undo a rectangle, or dragging a selection box) never inadvertently delete, select, or move comments.

---

## 2. Architecture & Component Structure

### 2.1 Component Hierarchy

```text
CanvasEditor (Main Editor Shell)
 ├── Stage (Konva Multi-Layer Canvas)
 │    ├── Layer (CanvasGrid, ShapeRenderer)
 │    ├── Layer (Marquee, Lasso, SmartGuides)
 │    └── Layer (RemoteCursorLayer, CollaboratorPresence)
 ├── CanvasCommentOverlay (HTML DOM Layer - z-index: 10)
 │    ├── CommentMarker (Rendered at worldToScreen(comment.position))
 │    └── FloatingCommentComposer (Rendered at worldToScreen(draftPosition))
 ├── CanvasToolbar (Includes CANVAS_TOOLS.COMMENT button & C hotkey)
 ├── CommentPanel (Thread Sidebar List & Filter Controls)
 ├── CanvasZoomControls (Zoom & Viewport Manipulation)
 └── KeyboardShortcutsModal (Cheatsheet documenting 'C' for Comment tool)
```

### 2.2 Store & State Separation

| State Category | Store / Layer | Stored Data |
| :--- | :--- | :--- |
| **Server State** | TanStack Query + Socket.IO | Authoritative comments, server versions, author profiles. |
| **Comments UI State** | `useCommentStore` (Zustand) | `comments` map, `activeThreadId`, `filter` ("all" \| "open" \| "resolved"), `isPanelOpen`, `draftPosition`. |
| **Canvas Tool & Geometry State** | `useCanvasStore` (Zustand) | `activeTool`, `shapes`, `selectedShapeIds`, `pan`, `zoom`, `past`/`future` undo stacks. |
| **Interaction Arbitration** | `CanvasInteractionController` (Headless) | Deterministic interaction mode (`commenting`, `panning`, `selecting`, `drawing_shape`, `transforming`, etc.). |

---

## 3. Coordinate Strategy: World vs Screen Coordinates

### 3.1 Mathematical Formulation

CanvasFlow uses two distinct coordinate reference frames:
1. **Screen Coordinates $(x_s, y_s)$:** Pixel coordinates relative to the canvas viewport DOM container. Screen coordinates change dynamically during zoom and pan operations.
2. **World Coordinates $(x_w, y_w)$:** Persistent 2D Cartesian plane coordinates of the infinite whiteboard.

#### Transformation Equations:

$$\text{screenToWorld}((x_s, y_s), \{\text{zoom}, \text{pan}\}) = \left( \frac{x_s - \text{pan.x}}{\text{zoom}}, \frac{y_s - \text{pan.y}}{\text{zoom}} \right)$$

$$\text{worldToScreen}((x_w, y_w), \{\text{zoom}, \text{pan}\}) = \left( x_w \cdot \text{zoom} + \text{pan.x}, y_w \cdot \text{zoom} + \text{pan.y} \right)$$

#### Round-Trip Invariance:

$$\text{worldToScreen}(\text{screenToWorld}((x_s, y_s), V), V) \equiv (x_s, y_s)$$

$$\text{screenToWorld}(\text{worldToScreen}((x_w, y_w), V), V) \equiv (x_w, y_w)$$

### 3.2 Persistent Anchoring Rules

* **Creation:** When a user clicks with the Comment Tool at screen position $(x_s, y_s)$, `screenToWorld` converts it to $(x_w, y_w)$, which is persisted in the comment's `position` field.
* **Rendering:** `CanvasCommentOverlay` calculates the screen placement of each marker dynamically via `worldToScreen(comment.position, { zoom, pan })`.
* **Pan Operations:** Modifying `pan.x` and `pan.y` shifts the marker screen placement in exact 1:1 parity with Konva shapes. World coordinates are **never mutated** during pan.
* **Zoom Operations:** Modifying `zoom` (and adjusting `pan` toward the zoom focus) scales the marker placement in screen space. World coordinates are **never mutated** during zoom.
* **Zero Spatial Drift:** Because persistent coordinates are always stored in world space, comment pins remain permanently anchored to their spatial features under arbitrary zoom and pan sequences.

---

## 4. End-to-End Data Flow

```text
1. User activates Comment Tool (Toolbar icon or 'C' shortcut)
                         ↓
2. User clicks on Canvas at screen coordinate (clientX, clientY)
                         ↓
3. Convert pointer: screenToWorld(pointer, { zoom, pan }) → worldPoint { x, y }
                         ↓
4. Set draftPosition = worldPoint in useCommentStore
                         ↓
5. CanvasCommentOverlay mounts FloatingCommentComposer at worldToScreen(draftPosition)
                         ↓
6. User enters text and clicks "Post" (or presses ⌘/Ctrl + Enter)
                         ↓
7. Validate: non-empty, trimmed, length <= 2000 chars
                         ↓
8. Optimistic UI: create temporary Comment with tempId in useCommentStore
                         ↓
9. Network dispatch: socketClientService.createComment({ boardId, canvasId, content, position: draftPosition })
                         ↓
10. Server verifies RBAC + positionSchema (finite numbers) → persists in MongoDB Comment collection
                         ↓
11. Server emits `comment:created` broadcast to board room
                         ↓
12. Client replaces optimistic comment with authoritative entity via replaceOptimisticComment(tempId, authoritative)
                         ↓
13. CanvasCommentOverlay renders CommentMarker at worldToScreen(comment.position)
                         ↓
14. Draft position cleared → activeThreadId set → CommentPanel opened → activeTool resets to SELECT
```

---

## 5. Interaction Arbitration

The headless `CanvasInteractionController` arbitrates all canvas pointer events to ensure clear priority and avoid race conditions or conflicting gestures.

### 5.1 Gesture Priority Hierarchy

1. **Priority 1: Navigation / Pan (Highest)**
   - Triggered when Spacebar is held, Middle Mouse is dragged, or `CANVAS_TOOLS.HAND` is active.
   - Panning overrides all drawing and commenting tools to ensure frictionless navigation.
2. **Priority 2: Transformer Handles**
   - Clicking on a Konva Transformer resize/rotate handle initiates `transforming`.
3. **Priority 3: Comment Tool Placement**
   - When `activeTool === CANVAS_TOOLS.COMMENT`, clicking anywhere (empty canvas or over shapes) returns mode `"commenting"`.
   - Captures the world coordinate and sets `draftPosition`.
   - **Crucially:** Does NOT select or transform underlying shapes.
4. **Priority 4: Shape Interaction**
   - When `activeTool === CANVAS_TOOLS.SELECT`, clicking on an existing shape selects it.
5. **Priority 5: Empty Canvas Tools**
   - Governed by active tool: `marquee_selecting`, `lasso_selecting`, `drawing_shape`, `drawing_vector`, `drawing_freehand`, `text_editing`.

### 5.2 Escape Key Cancellation Ladder

When the user presses the `Escape` key, `evaluateEscape` resolves the cancellation hierarchy:
1. **`hasActiveCommentDraft`** $\rightarrow$ `"cancel_comment"` (Clears `draftPosition`, closes composer).
2. **`hasActiveDrawing` / vector / freehand** $\rightarrow$ `"cancel_drawing"`.
3. **`isSelecting`** $\rightarrow$ `"cancel_selection"`.
4. **`isPanning`** $\rightarrow$ `"cancel_pan"`.
5. **`hasTextCreation`** $\rightarrow$ `"discard_text"`.
6. **`editingGroupId`** $\rightarrow$ `"exit_group"`.
7. **`selectedCount > 0`** $\rightarrow$ `"clear_selection"`.
8. **`activeTool !== SELECT`** $\rightarrow$ `"reset_tool"`.

---

## 6. Marker & Composer UI Components

### 6.1 `CommentMarker`
* **Pin Visual:** Teardrop speech-bubble pin pointing directly at $(x_s, y_s)$ via CSS `translate(-50%, -100%)`.
* **Author Indicator:** Displays author avatar image or initial letter (or thread index).
* **State Highlights:**
  * Active: High-contrast blue background, ring-2 blue highlight, elevated z-index (`z-30`), and scale transform.
  * Resolved: Emerald check badge and resolved status chip.
* **Hover Tooltip:** Floating tooltip showing author name and a 2-line truncated preview of the comment body.
* **Event Isolation:** Calls `e.stopPropagation()` on both `onClick` and `onMouseDown` to ensure that clicking a marker never starts canvas dragging or mutates shape selection.
* **Accessibility:** Accessible `<button>` with ARIA labels, tooltip role, and keyboard activation (`Enter` / `Space`).

### 6.2 `FloatingCommentComposer`
* **In-Canvas Positioning:** Positioned directly at the draft pin coordinates $(x_s, y_s)$ with a pulsing pin indicator.
* **Form Controls:** Auto-focusing textarea, character limit indicator (`0/2000`), "Cancel" button, and "Post" button with loading spinner.
* **Keyboard Shortcuts:**
  * `⌘/Ctrl + Enter` $\rightarrow$ Submit comment.
  * `Escape` $\rightarrow$ Cancel and dismiss draft.
* **Focus Safety:** Calls `e.stopPropagation()` on key and mouse events, ensuring global canvas shortcuts (`Delete`, `V`, `Space`, etc.) do not fire while typing.

### 6.3 `CanvasCommentOverlay`
* High-performance HTML overlay container rendered directly over the Konva canvas.
* Subscribes to `useCommentStore` and maps canvas-anchored comments into `CommentMarker` elements.
* Computes screen coordinates reactively from the canvas `zoom` and `pan` store state without redundant re-renders.

---

## 7. Real-Time Synchronization

Slice 29 reuses the established Slice 28 Socket.IO event architecture:

| Socket Event | Direction | Payload | Client Action |
| :--- | :--- | :--- | :--- |
| `comment:create` | Client $\rightarrow$ Server | `{ boardId, canvasId, content, position, shapeId, parentCommentId }` | Emits new comment creation with world coordinates. |
| `comment:created` | Server $\rightarrow$ Room | `{ comment: CommentResponseDto, meta }` | Appends comment to `useCommentStore`, rendering marker immediately. |
| `comment:update` | Client $\rightarrow$ Server | `{ boardId, commentId, content, expectedVersion }` | Updates comment text with OCC version validation. |
| `comment:updated` | Server $\rightarrow$ Room | `{ comment: CommentResponseDto, meta }` | Updates comment in store, reflecting edits in real time. |
| `comment:resolve` | Client $\rightarrow$ Server | `{ boardId, commentId, isResolved, expectedVersion }` | Resolves or unresolves thread. |
| `comment:resolved` | Server $\rightarrow$ Room | `{ comment: CommentResponseDto, meta }` | Updates resolution state, updating marker styling. |
| `comment:delete` | Client $\rightarrow$ Server | `{ boardId, commentId, expectedVersion }` | Soft-deletes comment. |
| `comment:deleted` | Server $\rightarrow$ Room | `{ boardId, commentId, meta }` | Masks content and updates thread view. |

---

## 8. Verification & Test Coverage

### 8.1 Automated Test Execution Results

```text
✓ Client Test Suite: 41 test files, 444 tests passed (100% passing)
  - canvas.coordinates.test.ts (6 tests: roundtrip, zoom/pan stability, tolerance)
  - canvas-interaction.controller.test.ts (24 tests: COMMENT tool ownership, cursor, Escape ladder)
  - comment.store.test.ts (9 tests: draftPosition, optimistic updates, isolation from canvas undo/redo)
  - CommentMarker.test.ts (4 tests: screen positioning, truncation, click/mousedown event isolation)
  - FloatingCommentComposer.test.ts (3 tests: coordinate derivation, validation, keyboard shortcuts)
  - CanvasCommentIntegration.test.ts (3 tests: full coordinate flow, zoom/pan invariance, selection isolation)

✓ Server Test Suite:
  - comment.domain.test.ts (8 tests: positionSchema finite check, repository CRUD, soft delete)
  - comment.service.test.ts (6 tests: world coordinate anchor, RBAC, OCC conflict detection)
  - comment.api.test.ts (9 tests: REST authentication, canvas comment creation, patch, resolve, delete)

✓ TypeScript & Build Verification:
  - Frontend Build: tsc -b && vite build (0 errors)
  - Backend Build: tsc (0 errors)
```

---

## 9. Scope Control: Deferred Functionality

In accordance with the project roadmap, the following features are intentionally deferred to subsequent slices:
* **Slice 30:** Advanced multi-level nested reply structures and threaded conversation expansions.
* **Slice 31:** `@mentions` and user tag autocompletion.
* **Slice 32:** In-app notification badges and email collaboration alerts.
* **Slice 33:** Advanced offline synchronization and conflict recovery redesigns.
* **Slice 34:** Full WCAG AAA accessibility overhaul and advanced keyboard navigation polish.

---

## 10. Conclusion

Slice 29 completes the integration of **Canvas Comment Anchoring & UI** into CanvasFlow. By combining world-space coordinate persistence, seamless viewport transformations, an in-canvas floating composer, and complete separation between comments and canvas shapes, CanvasFlow provides a responsive and intuitive visual collaboration experience.
