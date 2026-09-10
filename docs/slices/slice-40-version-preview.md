# Slice 40 — Version History Preview

## 1. Purpose

Slice 40 delivers **Version History Preview** in CanvasFlow, allowing collaborators to inspect full historical checkpoints of a board in a dedicated, isolated, read-only preview viewport without mutating or altering the live authoritative document.

---

## 2. Existing Architecture Audit

Prior to Slice 40:
- **Slice 36 (Domain)**: Created Mongoose models, schemas, and monotonically numbered `BoardVersion` documents storing immutable snapshots.
- **Slice 37 (History Pipeline)**: Constructed deterministic snapshots via `SnapshotBuilder` and automatic checkpoints post-transaction.
- **Slice 38 (API)**: Implemented lightweight version listing (`GET /api/v1/boards/:boardId/versions`) and full snapshot retrieval (`GET /api/v1/boards/:boardId/versions/:versionId`).
- **Slice 39 (UI)**: Built the `VersionHistoryPanel` timeline listing version summaries, date groupings, and pagination. Action buttons for Preview and Restore were initially disabled.

---

## 3. Architecture

The Version Preview workflow follows a strict read-only projection pipeline:

```text
Version History Timeline
       │ (User clicks "Preview")
       ▼
history.store.ts (previewVersionId: string | null)
       │
       ▼
useVersionDetail (TanStack Query v5)
       │ (GET /api/v1/boards/:boardId/versions/:versionId)
       ▼
Historical VersionDetail
       │ (Contains VersionSnapshot with immutable canvases and shapes)
       ▼
history-shape.mapper.ts (mapVersionShapeSnapshotToShape)
       │ (Converts VersionShapeSnapshot[] to Shape[])
       ▼
VersionPreviewModal
       │
       ├── Multi-canvas tab switcher (if multiple canvases)
       │
       └── PreviewCanvas (Konva Stage + Layer)
             └── PreviewShapeRenderer (pure, read-only Konva renderers)
```

---

## 4. State Ownership

| Layer | Responsibility | State Owner |
|---|---|---|
| Historical Server State | Caching full snapshots by `[boards, boardId, versions, versionId]` | TanStack Query v5 (`staleTime: 5 min`) |
| Preview Selection UI | Tracking active preview version (`previewVersionId`) | `useHistoryStore` (Zustand) |
| Active Preview Canvas | Tracking selected canvas tab in multi-canvas snapshots | `VersionPreviewModal` (`useState`) |
| Preview Viewport | Local pan and zoom for inspection | `PreviewCanvas` (`useState`, `useRef`) |
| Live Document State | Authoritative live shapes and camera | `useCanvasStore` (**Completely Isolated**) |

---

## 5. Live Canvas Isolation

Historical snapshot data is strictly treated as a **read-only projection**.

**Guarantees:**
1. Snapshot shapes **never** enter `useCanvasStore.getState().shapes`.
2. Live selection (`selectedShapeIds`) is never altered during preview.
3. Live camera position (`zoom`, `pan`) is never changed when zooming or panning inside the preview modal.
4. Closing the preview modal leaves the live document in its exact previous state.

---

## 6. Rendering Strategy

`PreviewShapeRenderer` provides pure Konva nodes for all 13 supported shape types:
- **Basic Shapes**: `rectangle`, `circle`, `ellipse`, `triangle`, `polygon`, `star`
- **Vector & Freehand**: `line`, `arrow`, `freehand`
- **Typography**: `text`, `sticky_note`
- **Hierarchical & Connective**: `group`, `connector`

### Pure Read-Only Attributes
- `listening={false}` applied to all Konva shapes and stage layers.
- Zero transformer attachments.
- Zero event handlers (`onMouseDown`, `onDragStart`, `onTransform`).
- Zero connections to live mutation managers or Zustand store dispatchers.

### Connectors & Groups
- Connectors resolve world anchor points (`getShapeWorldAnchorPoint`) strictly against historical snapshot shapes.
- Group child hierarchies resolve recursively from historical parent IDs (`parentId`) without referencing live group state.

---

## 7. Viewport State & Mathematics

Preview panning and zooming reuse pure mathematical helpers from `@/features/canvas/utils/viewport.utils`:
- `clampZoom`: Clamps zoom between `0.1` and `5.0`.
- `calculateCenterPan`: Centers historical shapes inside the preview modal on initial open.
- `calculateWheelTransform`: Supports Ctrl/Cmd + wheel zoom and trackpad two-finger pan.
- `calculatePanDelta`: Smooth drag-to-pan within the preview viewport.
- Floating zoom controls: Zoom In, Zoom Out, Reset View, and formatted zoom percentage.

---

## 8. Multi-Canvas Snapshots

For boards with multiple canvas pages:
- `VersionPreviewModal` inspects `versionDetail.snapshot.canvases`.
- If `canvases.length > 1`, a tab bar is rendered in the header allowing instantaneous switching between historical canvas pages.
- Each page preserves its historical name, order, background color, and shape collection.

---

## 9. Persistence & Collaboration Invariants

During any preview interaction:
- **HTTP mutation requests**: `0`
- **Socket.IO events emitted**: `0`
- **MutationRecords generated**: `0`
- **collaborationRevision changes**: `0`
- **Shape.version changes**: `0`
- **Undo / Redo pollution**: `0`
- **Live canvas mutations**: `0`

---

## 10. Verification & Test Results

### Automated Tests
- `client/src/features/history/__tests__/history-shape.mapper.test.ts`: 6 tests verifying all 13 shape types, styles, geometry, and group/connector mapping.
- `client/src/features/history/__tests__/history.preview.store.test.ts`: 5 tests verifying open, close, and rapid switching in history store.
- `client/src/features/history/__tests__/history.preview.api.test.ts`: 2 tests verifying `historyApi.getVersionById` endpoint routing and error handling.
- `client/src/features/history/__tests__/history.preview.isolation.test.ts`: 3 tests verifying live canvas store isolation, connector anchor calculation isolation, and group hierarchy preservation.
- Full Client Test Suite: **59 test files passed, 538 tests passed**.
- Server Regressions:
  - `npm run test:history-api`: **PASS** (9 integration test cases)
  - `npm run test:history`: **PASS** (9 domain test cases)
  - `npm run test:history-pipeline`: **PASS** (10 pipeline & snapshot builder test cases)
- TypeScript & Build:
  - `tsc -b && vite build`: **PASS** (zero type errors)

### Manual Browser Verification
- Authenticated and created a board with shapes.
- Opened Version History panel and clicked `Preview`.
- Verified header with `v1`, author name, timestamp, shape count, and `Read-Only Preview` badge.
- Verified interactive zoom controls (Zoom in to 110%, Zoom out to 100%, Reset).
- Closed preview modal and confirmed the live canvas and toolbar remained completely intact.

---

## 11. Architectural Decisions

1. **Dedicated Preview Renderer vs Live Nodes**:
   - *Decision*: Created `PreviewShapeRenderer` rather than adding boolean conditional flags into live interactive node components (`RectangleNode`, `TextNode`, etc.).
   - *Rationale*: Live node components are tightly coupled with `useShapeTransform`, `useCanvasStore`, remote locks, and mutation managers. A dedicated pure renderer completely eliminates mutation leakage risks.

2. **Transient Viewport State**:
   - *Decision*: Maintained preview viewport state inside React component local state (`useState`) rather than a global store.
   - *Rationale*: Previews are ephemeral dialogs. Local state guarantees that opening or closing a preview leaves zero residue.

---

## 12. Future Work

- **Slice 41 — Version Restore**: Implement restore workflow allowing users to apply historical versions back to the live board canvas with OCC validation and mutation tracking.
- **Slice 42 — Compression & Retention**: Implement snapshot compression and archival policies.
