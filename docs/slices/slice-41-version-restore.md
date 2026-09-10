# Slice 41 — Version Restore

## 1. Purpose

Slice 41 implements **server-authoritative, transactional, concurrency-safe Version Restore** in CanvasFlow. It enables collaborators to safely restore a board's document state to any historical version checkpoint without mutating historical records, without breaking collaborative OCC semantics, and without creating dangling references or corrupting live multi-canvas group and connector graphs.

---

## 2. Architecture Audit

Prior to Slice 41:
- **Slice 36 (Version History Domain)**: Introduced the immutable `BoardVersion` model with monotonic version numbering, author metadata, and `VersionSnapshot` schemas.
- **Slice 37 (Snapshot & History Pipeline)**: Created `SnapshotBuilder` and post-transaction checkpoint creation via `HistoryPipeline`.
- **Slice 38 (Version History API)**: Built endpoints for listing versions (`GET /api/v1/boards/:boardId/versions`) and fetching full snapshots (`GET /api/v1/boards/:boardId/versions/:versionId`).
- **Slice 39 (Version History UI)**: Created `VersionHistoryPanel` with grouped timeline, author tags, and pagination.
- **Slice 40 (Version History Preview)**: Built `VersionPreviewModal` with Konva-based read-only rendering of historical shapes, multi-canvas tabs, and isolated panning/zooming.
- **Collaboration & OCC System**: Provided `collaborationVersionService.executeWithRevision`, which executes mutations inside a MongoDB transaction session, advances `Board.collaborationRevision` monotonically, records a `MutationRecord`, and detects idempotent replays using `mutationId`.
- **Live Canvas & Synchronization**: Handled live shape state in `useCanvasStore`, real-time synchronizations via `SocketEvents.CANVAS_SYNC`, and optimistic tracking in `useCollaborationStore`.

---

## 3. Restore Strategy

### Evaluated Approaches

1. **Delete + Insert Everything (Naive)**:
   - *Risk*: Deleting all shapes and regenerating new IDs breaks parent-child relationships, connector references, remote selection pointers, and violates monotonic OCC rules.
2. **Diff-based Patching**:
   - *Risk*: Highly complex tree diffing for arbitrary group graphs and connectors with excessive query overhead and potential edge-case drift.
3. **Dedicated Transactional Authoritative Restore (Chosen Strategy)**:
   - Retains stable historical Shape IDs and Canvas IDs as captured in the snapshot.
   - Executes inside `collaborationVersionService.executeWithRevision` in a single MongoDB transaction session.
   - Clears existing canvas/shape records for the board and inserts historical canvas and shape documents within the atomic session.
   - Assigns fresh, valid OCC generation (`Shape.version = 1`) to all live shapes so subsequent collaborative mutations continue with clean, monotonic OCC counters.
   - Reconstructs nested groups (`parentId`) and connector references (`sourceShapeId`, `targetShapeId`) with zero dangling pointers.

---

## 4. Restore Flow

```text
User selects historical Version X (History Panel or Preview Modal)
        │
        ▼
Restore Confirmation Modal (Explains replacement, immutability, new version)
        │ User confirms
        ▼
historyApi.restoreVersion(boardId, versionId, payload)
        │
        ├── Authentication (verifyAccessToken)
        ├── RBAC Authorization (authorizeCanvasMutation - rejects VIEWER with 403)
        ├── IDOR Validation (boardId + versionId scoped lookup)
        ├── Snapshot Validation (validates canvases, shapes, groups, connectors)
        │
        ▼
collaborationVersionService.executeWithRevision
        │
        ├── Idempotency Check (mutationId reservation/replay return)
        ├── Atomic OCC Verification (board.collaborationRevision === expectedCollaborationRevision)
        ├── MongoDB Transaction Session:
        │     ├── Replace live canvases with historical canvases
        │     ├── Replace live shapes with historical shapes (fresh Shape.version: 1)
        │     ├── Monotonically increment Board.collaborationRevision (+1)
        │     └── Insert MutationRecord (operation: "version:restore")
        ├── Commit Transaction
        │
        ▼
Post-Commit Actions:
        ├── SnapshotBuilder.buildBoardSnapshot(boardId)
        ├── Create NEW BoardVersion (trigger: "restore", "Restored from Version X")
        ├── Broadcast SocketEvents.CANVAS_SYNC to board room
        └── Cache Idempotency Result
        │
        ▼
Connected Clients Reconcile:
        ├── Receive CANVAS_SYNC -> Update useCanvasStore with restored shapes/canvases
        ├── Advance useCollaborationStore revision
        ├── Invalidate TanStack Query cache ["boards", boardId, "versions"]
        └── Clear transient interaction state (selections, transformers)
```

---

## 5. OCC (Optimistic Concurrency Control)

Restore mutations require `expectedCollaborationRevision` in the request payload.

- When client triggers restore, it reads the current revision from `useCollaborationStore.getState().getRevision(boardId)`.
- Inside the atomic MongoDB transaction, `executeWithRevision` compares the stored board revision with `expectedCollaborationRevision`.
- If the board was updated by another collaborator concurrently (`board.collaborationRevision !== expectedCollaborationRevision`):
  - The transaction aborts immediately.
  - Server returns `HTTP 409 Conflict` with error code `OCC_CONFLICT`.
  - **Zero** document mutations occur.
  - **Zero** revision advancement occurs.
  - **Zero** `MutationRecord` documents are created.
  - **Zero** `BoardVersion` checkpoints are created.
  - **Zero** Socket.IO broadcasts are emitted.
- The UI catches the `409 Conflict` and presents a clear, non-retrying warning: *"This board changed while you were viewing this version. Your restore was not applied. Refresh the board and try again."*

---

## 6. Transaction Boundary

The restore mutation guarantees full atomicity:
- Live canvas documents, live shape documents, board revision advancement, and the `MutationRecord` are committed together in one MongoDB transaction session.
- If any database error occurs during shape insertion or revision increment, the session is aborted and rolled back.
- Creation of the new `BoardVersion` occurs strictly **post-commit**, adhering to the Slice 37 architectural invariant: a history snapshot must strictly represent committed authoritative state.
- If the post-commit history checkpoint creation experiences a transient error, the committed live restore mutation remains valid and is not retroactively invalidated.

---

## 7. Shape Versioning vs Revision vs Version Number

| Concept | Scope | Generation Mechanism | Purpose |
|---|---|---|---|
| `BoardVersion.versionNumber` | Board | Monotonic sequence (`findLatestVersionNumber + 1` with retry) | User-facing history timeline checkpoints |
| `Board.collaborationRevision` | Board | Monotonic sequence incremented by `executeWithRevision` | Concurrency & sync control across all collaborative mutations |
| `Shape.version` | Shape | Monotonic per-shape counter; reset to `1` on restore | Per-shape OCC during live editing & transformation |

Live shapes created by restore receive fresh `version = 1`. Historical `Shape.version` values are intentionally not copied directly into live documents to prevent OCC desynchronization with live client state machines.

---

## 8. ID Handling

- **Stable Historical IDs**: Historical `Shape.id` and `Canvas.id` values captured in the version snapshot are preserved during restore.
- **Benefits**:
  - Preserves hierarchical `parentId` references without complex ID translation tables.
  - Preserves connector `sourceShapeId` and `targetShapeId` references.
  - Avoids orphaned references across related collections.

---

## 9. Groups & Hierarchy Restoration

- Group shapes (`type: "group"`) and their descendants are restored exactly according to the snapshot model.
- Every child shape maintains its original `parentId`.
- Child local coordinates and transforms remain intact, ensuring nested groups render in their exact historical positions without flattening.

---

## 10. Connector Restoration

- Connectors (`type: "connector"`) are restored with all source and target bindings:
  - `sourceShapeId`, `sourceAnchor`
  - `targetShapeId`, `targetAnchor`
  - `routing`, `style`, and geometry
- Snapshot validation verifies that connector source and target references resolve to valid shapes within the snapshot before any mutation is applied.

---

## 11. Multi-Canvas Restoration

- Restore applies across all versioned canvases on the board, not just the currently active canvas.
- Canvases added after the historical version are removed.
- Canvases present in the historical snapshot are restored with their original identifiers, ordering index, and background properties.
- Shapes are assigned to their respective historical canvas IDs.

---

## 12. MutationRecord Integration

Every successful restore operation logs an authoritative `MutationRecord`:
- `operation`: `"version:restore"`
- `collaborationRevision`: Advanced board revision
- `mutationId`: Client-supplied idempotency key
- `userId`: Restoring collaborator ID
- `timestamp`: Mutation creation timestamp

---

## 13. Idempotency & Replay Handling

- Restore requests include a client-generated UUID `mutationId`.
- `collaborationVersionService.executeWithRevision` reserves the `mutationId` before executing the mutation.
- If an identical restore request is replayed (e.g. network timeout or double-click):
  - The service returns the cached canonical restore result.
  - **Zero** additional document mutations occur.
  - **Zero** duplicate `BoardVersion` checkpoints are created.
  - **Zero** duplicate revision increments occur.

---

## 14. New Version Creation

Restoring Version X **never** modifies or overwrites Version X:
- Version X remains 100% immutable in the historical timeline.
- A **new** `BoardVersion` (e.g. Version N+1) is created with:
  - `trigger`: `"restore"`
  - `changeSummary`: `"Restored from Version X"`
  - `snapshot`: Complete committed state resulting from the restore.

---

## 15. Collaboration & Broadcasting

- Successful restores emit `SocketEvents.CANVAS_SYNC` to the board room via the Socket.IO server.
- The payload includes the restored canvas list, all restored shapes, and the new `collaborationRevision`.
- Connected collaborators automatically reconcile their local `useCanvasStore` with the authoritative state.

---

## 16. Client Reconciliation & UI

- **Confirmation Dialog (`RestoreConfirmationModal`)**:
  - Highlights that live board state will be replaced.
  - Clarifies that the historical version remains unchanged in history.
  - Notes that a new version checkpoint will be generated.
  - Warns about OCC conflict handling if collaborators edit concurrently.
- **Actions in UI**:
  - Accessible via the **Restore** button on any `VersionHistoryItem`.
  - Accessible via the **Restore this Version** button in the `VersionPreviewModal` header.
- **Cache Invalidation**:
  - Invalidates `["boards", boardId, "versions"]` so the new checkpoint appears immediately.
- **Transient State Cleansing**:
  - Restoring invokes `useCanvasStore.getState().clearSelection()` to eliminate stale transformer handles and lingering selection bounding boxes.
  - Local viewport (zoom, pan, camera position) is intentionally **not** overwritten.

---

## 17. Security & IDOR Protection

- **Authentication**: Endpoint requires valid Bearer access token (`401 Unauthorized` when unauthenticated).
- **RBAC**: Enforces `boardService.authorizeCanvasMutation`. Users with `VIEWER` role receive `403 Forbidden`.
- **IDOR Protection**: Scoped database query `historyRepository.findById(boardId, versionId)` ensures cross-board version restores are safely rejected with `404 Not Found`.

---

## 18. Verification & Test Results

### Automated Backend Tests
`npm run test:history-restore`: **10 / 10 passed**
- `401 Unauthorized` for unauthenticated requests.
- `403 Forbidden` for viewer role (RBAC).
- `404 Not Found` for cross-board IDOR attack attempts.
- `404 Not Found` for non-existent version IDs.
- Concurrency-safe OCC: Success when revisions match, `409 Conflict` when stale.
- Complete shape restoration: newly created shapes removed, deleted shapes restored, modified shape properties restored.
- Group hierarchies and local coordinates restored with intact `parentId`.
- Connectors restored with valid source and target bindings.
- Source version remains immutable and identical.
- New version checkpoint created with `trigger: "restore"` and `"Restored from Version X"`.
- Monotonic revision increment and single `MutationRecord` insertion.
- Idempotent replay: exact same `mutationId` produces zero duplicate effects.

### Regression Test Suites
- `npm run test:history`: **PASS** (9 domain tests)
- `npm run test:history-pipeline`: **PASS** (10 pipeline tests)
- `npm run test:history-api`: **PASS** (9 API integration tests)
- Client Vitest Suite (`npm run test:run`): **PASS** (60 / 60 test files, 544 / 544 tests passed)

### Build & Type Safety
- Server TypeScript (`tsc`): **PASS** (0 errors)
- Client TypeScript & Vite Build (`tsc -b && vite build`): **PASS** (0 errors)
- Strict TypeScript: `any: 0`, `unknown: 0`, `@ts-ignore: 0`, explicit return types on all functions.

### Manual Browser Verification
- Tested in Chrome browser:
  1. Created distinct version checkpoints (v1 with 1 shape, v2 with 2 shapes).
  2. Opened Version History panel and clicked `Restore` on Version 1.
  3. Verified `RestoreConfirmationModal` displays clear guidance and OCC safeguards.
  4. Confirmed restore: canvas immediately reflected Version 1 state (1 rectangle).
  5. Verified new version checkpoint **Version 3 ("Restored from Version 1")** appeared in the history list.
  6. Verified Version 1 remained completely intact and previewable.
  7. Tested read-only preview mode on Version 2 and confirmed header restore button opens the confirmation dialog.
  8. Verified OCC conflict handling returned `HTTP 409 Conflict` when tested against stale revision states.
