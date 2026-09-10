# Slice 37 — Snapshot & History Pipeline

## Executive Overview

Slice 37 implements the **Snapshot & History Pipeline** in CanvasFlow (Phase 9: Version History). It connects the authoritative document mutation execution pipeline with the Slice 36 Version History domain, establishing a pure history policy engine, a unified deterministic snapshot builder, and a post-commit auxiliary history pipeline that turns historically meaningful mutations into immutable, board-scoped version checkpoints.

---

## 1. Architecture Audit

Before Slice 37, CanvasFlow possessed:
1. **Version History Domain (Slice 36):**
   - `BoardVersion` Mongoose model in `board_versions` collection with compound unique index `{ boardId: 1, versionNumber: -1 }`.
   - `historyRepository`: atomic board-scoped version allocation with retry logic, cursor pagination, and immutable metadata updates.
   - `historyService`: RBAC authorization (`EDIT_CANVAS`), version retrieval, and manual version creation.
2. **Mutation Pipeline:**
   - `collaborationVersionService.executeWithRevision`: central atomic transaction coordinator for Socket.IO mutations, managing idempotency reservations, MongoDB transactions, and `board.collaborationRevision` increments.
   - `shapeService`: domain business logic for shape mutations.
   - `shapeRepository`: atomic Mongoose CRUD operations and OCC checks (`updateWithExpectedVersion`, `deleteWithExpectedVersion`).
   - `mutationService` & `mutationRepository`: idempotency reservations and completion in `mutation_records` with TTL index.
3. **Client Mutation Flow:**
   - Konva node interactions (dragging, resizing, rotating) emit ephemeral `shape:transform-frame` events over Socket.IO via RAF (ghost frames for collaborators, never persisted to DB).
   - The authoritative mutation `shape:update` with `expectedVersion` is emitted strictly on `onDragEnd` / `onTransformEnd`.

---

## 2. Authoritative Mutation Boundary

The authoritative mutation boundary is:
> **Immediately following successful OCC validation, MongoDB shape persistence, board collaboration revision increment, and transaction commit within `executeWithRevision`.**

At this exact boundary:
1. OCC validation has passed.
2. MongoDB documents are authoritatively committed.
3. The new `collaborationRevision` is established.
4. Mutation idempotency is finalized.

The automatic history pipeline attaches directly to this boundary as a post-commit auxiliary consumer.

---

## 3. Transaction & Consistency Model

**Post-Commit Auxiliary Consistency Model:**
- **Primary vs Auxiliary:** Live shape mutation is the primary operation; automatic historical snapshotting is an auxiliary persistence layer.
- **Committed State Guarantee:** `SnapshotBuilder` executes post-commit, ensuring that snapshot queries read the newly committed state (e.g. `Shape.x = 500`).
- **Failure Isolation:** If automatic snapshot creation encounters an unexpected failure, the error is logged diagnostically with full context (`boardId`, `operation`, `mutationId`), but **does not abort or rollback the user's already-committed live canvas edit**.
- **Manual Checkpoints:** Explicit user checkpoint requests (`POST /boards/:boardId/versions`) return HTTP 500 on failure to notify the user.

---

## 4. History Policy Engine

`HistoryPolicy` is implemented as a **pure, deterministic rules engine** without process-local state, guaranteeing consistent behavior across horizontally scaled backend instances:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│                        MUTATION CLASSIFICATION                          │
├─────────────────────────┬──────────────────────────┬────────────────────┤
│ Category                │ Operations               │ Version Policy     │
├─────────────────────────┼──────────────────────────┼────────────────────┤
│ 1. Manual Checkpoint    │ POST /versions           │ ALWAYS CREATE      │
│                         │ (Explicit user save)     │ (trigger: manual)  │
├─────────────────────────┼──────────────────────────┼────────────────────┤
│ 2. Structural Mutation  │ shape:create             │ CREATE CHECKPOINT  │
│                         │ shape:delete             │ (trigger: automatic│
│                         │ shape:group              │  significant)      │
│                         │ shape:ungroup            │                    │
│                         │ shape:paste              │                    │
│                         │ shape:align              │                    │
│                         │ shape:distribute         │                    │
│                         │ batch:operation          │                    │
├─────────────────────────┼──────────────────────────┼────────────────────┤
│ 3. Granular Updates     │ shape:update             │ NON-CHECKPOINT /   │
│                         │ (individual property     │ DEFERRED           │
│                         │  edits, styles, text)    │ (trigger: none,    │
│                         │                          │  captured at next  │
│                         │                          │  milestone/save)   │
├─────────────────────────┼──────────────────────────┼────────────────────┤
│ 4. Ephemeral Actions    │ pointermove, pan, zoom,  │ NEVER CREATE       │
│                         │ selection, cursor,       │ (0 DB writes,      │
│                         │ presence, comments       │  0 versions)       │
└─────────────────────────┴──────────────────────────┴────────────────────┘
```

---

## 5. Three Independent Version Concepts

CanvasFlow maintains a strict architectural boundary across three distinct version concepts:

1. `Shape.version`: Document-level optimistic concurrency control (OCC) conflict version.
2. `Board.collaborationRevision`: Ephemeral real-time Socket.IO sequence for ordering, gap detection, and client recovery.
3. `BoardVersion.versionNumber`: Board-scoped monotonic historical checkpoint sequence ($1, 2, 3\dots$).

**Invariants:**
- Creating a `BoardVersion` increments `BoardVersion.versionNumber`.
- Creating a `BoardVersion` **never increments** `Board.collaborationRevision`.
- Creating a `BoardVersion` **never modifies** `Shape.version`.
- Creating a `BoardVersion` **never inserts** a `MutationRecord`.

---

## 6. Snapshot Architecture & Immutability

The unified `SnapshotBuilder`:
- Serializes all active canvas pages and shapes for the board into a self-contained `VersionSnapshot`.
- Performs plain object conversion (`.toObject()`), stringifies `_id` and foreign keys (`canvasId`, `parentId`, `createdBy`, `sourceShapeId`, `targetShapeId`), and converts timestamps to ISO strings.
- Deeply copies arrays (`points: [...s.points]`) and nested objects (`style`, `shapeConfig`, `connector`).
- Preserves all 14 shape types (`RECTANGLE`, `CIRCLE`, `ELLIPSE`, `TRIANGLE`, `POLYGON`, `STAR`, `TEXT`, `LINE`, `ARROW`, `IMAGE`, `STICKY_NOTE`, `FREEHAND`, `CONNECTOR`, `GROUP`).
- Preserves grouping hierarchy (`parentId` and local coordinates) without flattening.
- Guarantees complete snapshot immutability: subsequent edits or deletions to live canvas shapes leave historical snapshots completely unaffected.

---

## 7. Idempotency & Replay Protection

- Socket.IO network retries re-delivering already-completed mutations return canonical results with `meta.isIdempotentReplay: true`.
- `HistoryPipeline` inspects this flag before policy evaluation and skips immediately.
- Result: **0 duplicate historical versions** created on network reconnection or duplicate event delivery.

---

## 8. Concurrency & Monotonic Numbering

- Version numbers are allocated independently per board ($1, 2, 3\dots$).
- Reuses `historyRepository.create` retry loop against compound unique index `{ boardId: 1, versionNumber: -1 }` with exponential jitter backoff.
- Concurrent mutations successfully obtain unique, monotonic version numbers without collisions or dropped checkpoints.

---

## 9. Verification & Test Results

### Automated Test Suites

1. **Pipeline & Policy Integration Suite (`npm run test:history-pipeline`):**
   - Test 1: Pure History Policy rules (manual, structural, granular, ephemeral, idempotent) $\to$ **PASS**
   - Test 2: SnapshotBuilder multi-canvas & 14 shape types structural coverage $\to$ **PASS**
   - Test 3: Snapshot immutability against live DB modifications & deletions $\to$ **PASS**
   - Test 4: Committed state guarantee ($x = 500$ captured post-commit) $\to$ **PASS**
   - Test 5: HistoryPipeline automatic checkpoint creation $\to$ **PASS**
   - Test 6: Non-checkpoint and ephemeral actions produce 0 versions $\to$ **PASS**
   - Test 7: OCC failure safety & auxiliary error isolation $\to$ **PASS**
   - Test 8: Idempotent replay duplicate prevention $\to$ **PASS**
   - Test 9: Concurrent version creation monotonic allocation $\to$ **PASS**
   - Test 10: Strict persistence invariants verification $\to$ **PASS**
   - **Result: 10 / 10 passed.**

2. **Slice 36 History Domain Suite (`npm run test:history`):**
   - 9 / 9 passed.

3. **Server RBAC Suite (`npm run test:rbac`):**
   - 9 / 9 passed.

4. **Comments Suite (`npm run test:comments`):**
   - 31 / 31 passed across 4 test files.

5. **Notifications Suite (`npm run test:notifications`):**
   - 18 / 18 passed across 3 test files.

6. **Server TypeScript Compilation (`npm run build`):**
   - `tsc` compilation passed with 0 errors.

7. **Client Vitest Suite (`npm run test:run`):**
   - 51 / 51 test files passed (506 tests passed).

8. **Git Cleanliness (`git diff --check`):**
   - Passed with 0 whitespace or formatting issues.

---

## 10. Future Scalability Improvements (Deferred to Slice 42)

- Snapshot delta/event-sourcing storage.
- Snappy/Gzip snapshot compression.
- Distributed background checkpoint schedulers (Redis/BullMQ).
- Retention policies and automatic snapshot pruning.
