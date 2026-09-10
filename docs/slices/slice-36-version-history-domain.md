# Slice 36 — Version History Domain

## Master Architectural Documentation & Production Verification

### Executive Summary

Slice 36 establishes the persistent, immutable, production-grade **Version History Domain** in CanvasFlow (Phase 9: Version History). It introduces the foundational data models, repository abstractions, service layer, RBAC authorization, DTO contracts, Zod validation, and REST API endpoints for board-level version checkpoints and self-contained canvas snapshots.

This slice maintains strict architectural boundaries between:
1. **OCC Entity Versions** (`Shape.version`, `Comment.version`): Concurrency conflict detection on individual documents.
2. **Collaboration Revisions** (`Board.collaborationRevision`): Real-time Socket.IO synchronization, event ordering, and freshness recovery sequence numbers.
3. **Mutation Records** (`MutationRecord`): Ephemeral TTL-backed at-most-once idempotency deduplication.
4. **Client Undo/Redo** (`useCanvasStore.past / future`): Ephemeral in-memory UI interaction history isolated from remote collaborator events.
5. **Persistent Version History** (`BoardVersion`): Durable, immutable historical document snapshots that survive browser restarts, reloads, and cross-session collaboration.

---

## 1. Purpose: Why CanvasFlow Needs a Dedicated Version History Domain

Collaborative whiteboards require durable checkpoints that capture the evolution of designs over time:
1. **Milestone Preservation:** Users must be able to create named checkpoints (e.g. "Initial Wireframe", "Client Review v1", "Final Release") to document milestones.
2. **Disaster Recovery & Rollback:** Teams need guaranteed historical baselines that can be previewed (Slice 40) and restored (Slice 41) without losing historical context.
3. **Separation from Ephemeral Collaboration State:** Live drawing produces hundreds of microscopic real-time events. Version History provides coarse-grained, meaningful document milestones separate from high-frequency transport noise.
4. **Immutability & Auditability:** Historical versions must remain completely frozen even when active canvas shapes are moved, styled, grouped, or deleted by collaborators.

---

## 2. Architectural Distinction Matrix

CanvasFlow incorporates multiple distinct concepts involving versioning and state sequences. Slice 36 explicitly defines and enforces their separation:

| Concept | Scope | Storage Location | Lifetime | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **OCC Entity Version** | Individual `Shape` or `Comment` document | MongoDB document field (`version: number`) | Updated on write | Detects concurrent write collisions on the same entity (`expectedVersion`). |
| **Collaboration Revision** | `Board` document | MongoDB `boards.collaborationRevision` | Increments on every authoritative mutation | Monotonic sequence for Socket.IO event ordering, gap detection, and state recovery. |
| **Mutation Record** | User Mutation ID | MongoDB `mutation_records` collection | Ephemeral (TTL 24h / lease 30s) | At-most-once mutation idempotency deduplication across retries. |
| **Client Undo/Redo** | Browser Tab / Active Session | Client Zustand store (`useCanvasStore.past/future`) | Ephemeral (lost on page reload) | Local single-user UI interaction history (undoing drawing, dragging, nudging). |
| **Persistent Version History** | Entire `Board` (all canvases & shapes) | MongoDB `board_versions` collection | Permanent | Durable, immutable historical snapshots with author stamps and metadata. |

---

## 3. Definition of a Version

In CanvasFlow, a **Version** (`BoardVersion`) is defined as:

> A durable, board-level historical checkpoint containing an immutable, self-contained snapshot of all active canvas pages and their complete shape geometries, styles, connectors, and hierarchies at a specific point in time, accompanied by authenticated authorship, monotonic sequence numbering, and optional user metadata.

### Domain Schema (`BoardVersion`)

| Field | Type | Attributes | Description |
| :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Primary Key | Unique version identifier. |
| `boardId` | `ObjectId` | Required, Indexed | Parent board boundary. |
| `versionNumber` | `number` | Required, Monotonic ($\ge 1$) | Board-scoped incremental version number. |
| `name` | `string` | Trimmed, 0–100 chars | Optional user-assigned title (e.g. "Sprint 1 Final"). |
| `description` | `string` | Trimmed, 0–500 chars | Optional notes or changelog entry. |
| `trigger` | `"manual" \| "automatic"` | Default `"manual"` | Trigger source (user-created vs system snapshot). |
| `createdBy` | `ObjectId` | Required, Ref User | Authenticated User who created the checkpoint. |
| `collaborationRevision`| `number` | Required | Board collaboration revision at time of snapshot. |
| `snapshot` | `VersionSnapshot` | Embedded Document | Complete serialized canvas and shape state. |
| `snapshot.canvases` | `VersionCanvasSnapshot[]` | Array | Serialized canvas pages and embedded shapes. |
| `snapshot.shapeCount` | `number` | Integer $\ge 0$ | Total number of shapes captured in snapshot. |
| `changeSummary` | `VersionChangeSummary?` | Optional | Structured summary of modifications. |
| `isNamed` | `boolean` | Default `false` | Indicates if version has a custom user name. |
| `createdAt` | `Date` | Automatic | Creation timestamp. |
| `updatedAt` | `Date` | Automatic | Last metadata modification timestamp. |

---

## 4. Snapshot vs Delta Strategy

### 4.1 Evaluation

1. **Delta / Event-Sourcing Model:**
   - *Pros:* Small individual mutation records.
   - *Cons:* Reconstructing state at Version $N$ requires replaying all historical deltas from Version 0. Vulnerable to schema drift over time, computationally prohibitive for large boards, and makes visual preview (Slice 40) or one-click restore (Slice 41) high-latency and fragile.
2. **Complete Snapshot Model (Chosen):**
   - *Pros:* Self-contained, $O(1)$ instantaneous preview and restore, zero dependency on past mutation logs, immune to delta replay divergence, and guaranteed immutability.
   - *Storage Considerations:* Mitigated in Slice 42 via snapshot compression, deduplication, and retention policies.

### 4.2 Snapshot Shape Serialization

Each serialized shape in `snapshot.canvases[].shapes` preserves:
- Identity: `id`, `canvasId`, `createdBy`, `parentId`
- Type: `type` (`RECTANGLE`, `CIRCLE`, `GROUP`, `CONNECTOR`, `TEXT`, `STAR`, `FREEHAND`, etc.)
- Spatial Bounds: `x`, `y`, `width`, `height`, `rotation`, `zIndex`
- Content: `text`, `points`
- Relational Data: `connector` (`sourceShapeId`, `sourceAnchor`, `targetShapeId`, `targetAnchor`, `routing`)
- Configuration: `shapeConfig` (`sides`, `points`, `innerRadiusRatio`)
- Appearance: `style` (`fill`, `stroke`, `strokeWidth`, `strokeStyle`, `opacity`, `shadow`)
- OCC Counter: `version` (captured at snapshot time)

---

## 5. Version Immutability & Persistence Boundaries

### 5.1 Immutability Invariant
Once persisted, the `snapshot`, `versionNumber`, `boardId`, `createdBy`, `trigger`, `collaborationRevision`, and `createdAt` fields are strictly **IMMUTABLE**.

Subsequent operations on the active board (such as moving shapes, deleting shapes, pasting shapes, or changing board properties) have **zero effect** on existing historical versions.

Only explicit user metadata (`name`, `description`, `isNamed`) can be modified via `PATCH /api/v1/boards/:boardId/versions/:versionId`.

### 5.2 Persistence Boundary
Version creation is an explicit, authoritative server operation. The following ephemeral client actions **NEVER** create historical versions, write to `board_versions`, or mutate version state:
- Viewport Pan and Zoom
- Selection box dragging and multi-selection
- Cursor movement and pointer hover
- Presence heartbeat broadcasts
- Comment panel opening and sidebar navigation

Creating a version checkpoint does **NOT**:
- Increment `Board.collaborationRevision` (the revision field in the version is a snapshot reference)
- Create `MutationRecord` entries
- Modify `Shape.version` counters
- Create client undo/redo entries

---

## 6. Monotonic Version Numbering & Concurrency Safety

Version numbers are **board-scoped** ($1, 2, 3\dots$) and independent across boards.

### Concurrency Race Handling
To prevent duplicate key collisions when two collaborators trigger version creation concurrently:
1. `historyRepository.create` queries the latest `versionNumber` on the board (`highest + 1`).
2. Persists using MongoDB compound unique index `{ boardId: 1, versionNumber: -1 }`.
3. If an `E11000 duplicate key error` occurs due to a concurrent write race, the repository executes an exponential-jitter retry (up to 5 attempts), querying the newly committed highest version number and re-attempting insertion.
4. This guarantees that concurrent requests never crash or assign duplicate version numbers.

---

## 7. Role-Based Access Control (RBAC)

Version History integrates seamlessly with CanvasFlow workspace RBAC (`assertWorkspacePermission` with `WorkspacePermission.EDIT_CANVAS`):

| Operation | Required Role / Permission | Behavior |
| :--- | :--- | :--- |
| **Create Manual Version** (`POST /versions`) | `OWNER`, `ADMIN`, `EDITOR` (`EDIT_CANVAS`) | `201 CREATED` with full snapshot DTO. |
| **Update Metadata** (`PATCH /versions/:id`) | `OWNER`, `ADMIN`, `EDITOR` (`EDIT_CANVAS`) | `200 OK` with updated metadata DTO. |
| **List Versions** (`GET /versions`) | `OWNER`, `ADMIN`, `EDITOR`, `VIEWER` (Board Access) | `200 OK` with paginated summary DTOs. |
| **Get Version Details** (`GET /versions/:id`)| `OWNER`, `ADMIN`, `EDITOR`, `VIEWER` (Board Access) | `200 OK` with full snapshot DTO. |
| **Unauthorized / Outsider Access** | Non-member / Private board | `403 FORBIDDEN` |
| **Cross-Board Access (IDOR)** | Requesting Version of Board A with Board B ID | `404 NOT_FOUND` |

---

## 8. REST API Endpoints

### 8.1 Create Manual Version
`POST /api/v1/boards/:boardId/versions`
- **Auth:** Bearer JWT (Owner, Admin, Editor)
- **Body:** `{ name?: string, description?: string }`
- **Response:** `201 CREATED` -> `VersionResponseDto`

### 8.2 List Version History Timeline
`GET /api/v1/boards/:boardId/versions?limit=20&cursor=15&trigger=manual&isNamed=true`
- **Auth:** Bearer JWT (All board members)
- **Query Params:** `limit` (1-100, default 20), `cursor` (integer `versionNumber`), `trigger` (`manual` | `automatic`), `isNamed` (`true` | `false`)
- **Response:** `200 OK` -> `{ success: true, data: VersionSummaryResponseDto[], pagination: { nextCursor, hasMore, totalCount } }`

### 8.3 Get Version by ID
`GET /api/v1/boards/:boardId/versions/:versionId`
- **Auth:** Bearer JWT (All board members)
- **Response:** `200 OK` -> `{ success: true, data: VersionResponseDto }` (contains full `snapshot`)

### 8.4 Update Version Metadata
`PATCH /api/v1/boards/:boardId/versions/:versionId`
- **Auth:** Bearer JWT (Owner, Admin, Editor)
- **Body:** `{ name?: string, description?: string }`
- **Response:** `200 OK` -> `VersionResponseDto`

---

## 9. Deferred Phase 9 Slices

The following capabilities are intentionally deferred to subsequent Phase 9 slices:
- **Slice 37 — Snapshot & History Pipeline:** Automated debounced background snapshot generators and mutation diff summaries.
- **Slice 38 — Version History API:** Advanced search, date range filtering, and bulk operations.
- **Slice 39 — Version History UI:** Timeline sidebar, version card components, and author avatars.
- **Slice 40 — Version Preview:** Read-only Konva canvas stage for previewing historical snapshots.
- **Slice 41 — Version Restore:** Rollback engine applying historical snapshots to active canvas with new OCC revisions.
- **Slice 42 — Reliability & Performance:** Snapshot compression, delta deduplication, and retention pruning.

---

## 10. Production Verification & Test Results

### 10.1 Automated Test Execution Summary

| Suite | Command | Tests Run | Result |
| :--- | :--- | :--- | :--- |
| **Version History Domain** | `npm run test:history` | 9 Integration Test Scenarios | **PASS (100%)** |
| **Workspace & Board RBAC** | `npm run test:rbac` | 9 Comprehensive Scenarios | **PASS (100%)** |
| **Comments Domain & API** | `npm run test:comments` | 4 Test Suites | **PASS (100%)** |
| **Notifications Domain & API**| `npm run test:notifications` | 3 Test Suites | **PASS (100%)** |
| **Client Vitest Suite** | `npm run test:run` (client) | 51 Test Files / 506 Tests | **PASS (100%)** |
| **Server TypeScript Compilation** | `npm run build` (`tsc`) | Full Typecheck & Build | **PASS (0 errors)** |
| **Git Diff Check** | `git diff --check` | Whitespace & Formatting | **PASS (0 issues)** |
