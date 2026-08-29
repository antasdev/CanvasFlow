# Slice 28 — Comment Domain & Thread Infrastructure

## Master Architectural Documentation & Production Verification

### Executive Summary

Slice 28 establishes the persistent, production-grade **Comment Domain & Thread Infrastructure** in CanvasFlow (Phase 8: Comments & Collaboration). It provides the complete foundation for collaborative discussions, threaded replies, spatial canvas anchoring, shape attachment, author-only editing, soft deletion, and thread resolution.

This slice maintains a strict boundary between **Canvas Geometry** (`Shape`: Konva nodes, coordinate math, clipboard, and undo/redo stacks) and **Collaboration Metadata** (`Comment`: discussion threads, author stamps, timestamps, resolution states, and audit trails).

---

## 1. Purpose: Why CanvasFlow Needs a Dedicated Comment Domain

Whiteboard platforms like Figma, Miro, and FigJam distinguish between drawing canvas geometry and annotating discussions:
1. **Separation of Concerns:** Comments are contextual collaboration metadata. Treating comments as canvas shapes pollutes vector pipelines with conversational state and causes undo actions (`Ctrl+Z`) to accidentally erase comments or replies.
2. **Persistence & Auditing:** Comments must persist even when the shapes they reference are deleted or moved.
3. **Collaboration Lifecycle:** Threads have resolution lifecycles (`isResolved`, `resolvedAt`, `resolvedBy`) and reply hierarchies that are foreign to graphical shapes.

---

## 2. Architecture & Data Model

CanvasFlow uses a single MongoDB `Comment` collection with an adjacency list for threading.

```text
Board
  └── Canvas (Page 1)
        ├── Shape (Rectangle) <─── Attached Comment (shapeId, position)
        │                               └── Reply (parentCommentId: rootId)
        └── Canvas Coordinate <─── Freeform Comment (position: { x, y })
                                        ├── Reply (parentCommentId: rootId)
                                        └── Reply (parentCommentId: rootId)
```

### 2.1 Domain Schema Fields

| Field | Type | Attributes | Description |
| :--- | :--- | :--- | :--- |
| `_id` | `ObjectId` | Primary Key | Unique comment identifier. |
| `boardId` | `ObjectId` | Required, Indexed | Parent board boundary. |
| `canvasId` | `ObjectId` | Required, Indexed | Canvas page boundary. |
| `authorId` | `ObjectId` | Required, Indexed | Creator User reference. |
| `shapeId` | `ObjectId \| null` | Optional, Indexed | Attached Shape reference if pinned to a shape. |
| `parentCommentId` | `ObjectId \| null` | Optional, Indexed | Reference to root comment for replies (`null` for roots). |
| `position` | `{ x, y } \| null` | Optional | World-space 2D coordinates on canvas. |
| `content` | `string` | Trimmed, 1–2000 chars | Comment body text. Masked to `""` upon soft deletion. |
| `isResolved` | `boolean` | Default `false` | Thread resolution status. |
| `resolvedAt` | `Date \| null` | Optional | Timestamp when thread was marked resolved. |
| `resolvedBy` | `ObjectId \| null` | Optional, Ref User | User who marked the thread resolved. |
| `isEdited` | `boolean` | Default `false` | Flag set when author edits comment content. |
| `deletedAt` | `Date \| null` | Default `null` | Soft deletion timestamp. |
| `version` | `number` | Required, Default 1 | OCC revision counter. |
| `createdAt` | `Date` | Automatic | Creation timestamp. |
| `updatedAt` | `Date` | Automatic | Last modification timestamp. |

---

## 3. Thread Architecture: Adjacency List with 1-Level Depth

### 3.1 Design Choice
We selected a **Single Collection Adjacency List with a Strict 1-Level Depth Limit**:
- **Root Comments:** Have `parentCommentId === null`. Carry spatial anchoring (`canvasId`, `shapeId?`, `position?`), resolution flags, and author stamps.
- **Replies:** Have `parentCommentId === rootComment._id`. Inherit spatial anchoring and canvas context from the root comment.
- **Depth Invariant:** Attempting to reply to a reply is rejected with `400 BAD_REQUEST`.

### 3.2 Comparison with Alternatives
1. **Embedded Arrays (`CommentThread.comments = []`):**
   - *Rejected:* Subject to MongoDB 16MB document size limits; concurrent writes by two collaborators replying simultaneously cause write lock contention and false OCC conflicts on the parent document.
2. **Two Separate Collections (`CommentThread` + `Comment`):**
   - *Rejected:* Adds relational join overhead, necessitates multi-document transactions for simple queries, and duplicates indexes.
3. **Adjacency List (Chosen):**
   - *Adopted:* Enables atomic inserts, independent document versioning, index-backed chronological sorting (`{ parentCommentId: 1, createdAt: 1 }`), and soft deletion that preserves child replies.

---

## 4. Canvas Anchoring: Hybrid World Coordinates & Shape References

Slice 28 implements **Option C: Hybrid Canvas Anchoring**:
1. **Canvas-Level Root Comments:**
   - Require `canvasId` and world coordinates `position: { x: number, y: number }`.
   - `shapeId` is `null`.
2. **Shape-Attached Comments:**
   - Reference `shapeId` and optionally record the initial click `position: { x, y }`.
   - In the frontend canvas view, comment badges follow shape movement automatically.
3. **Shape Deletion Decoupling:**
   - When a shape is deleted, `commentService.handleShapeDeleted(shapeId)` decouples all attached comments by setting `shapeId = null`.
   - The comments survive at their world-space `position`, preventing loss of user discussions.
4. **Reply Anchoring:**
   - Replies inherit the root comment's `canvasId`, `shapeId`, and `position`.

---

## 5. Concurrency & Optimistic Concurrency Control (OCC)

Collaborative comments require version validation to prevent lost updates:
- Every comment document contains an integer `version` field starting at `1`.
- Update, resolve, and soft-delete operations execute:
  ```javascript
  CommentModel.findOneAndUpdate(
    { _id: id, version: expectedVersion, deletedAt: null },
    { $set: data, $inc: { version: 1 } },
    { returnDocument: "after" }
  );
  ```
- If a client supplies a stale `expectedVersion`, a `ConflictError` (HTTP 409) is raised, preventing race conditions during simultaneous edits or resolve toggles.

---

## 6. Runtime RBAC & Authorization Rules

CanvasFlow uses server-side RBAC enforced via `WorkspacePermission.ADD_COMMENT` and `boardService.authorizeBoardAccess`:

| Role | Create Root / Reply | Edit Content | Resolve / Unresolve | Soft Delete |
| :--- | :--- | :--- | :--- | :--- |
| **OWNER** | Allowed | Author only | Allowed | Allowed (Moderator) |
| **ADMIN** | Allowed | Author only | Allowed | Allowed (Moderator) |
| **EDITOR** | Allowed | Author only | Allowed | Author only |
| **VIEWER** | Allowed | Author only | Author only | Author only |
| **Outsider** | **Forbidden (403)**| **Forbidden (403)**| **Forbidden (403)** | **Forbidden (403)** |

- **Viewers:** Have `ADD_COMMENT` permission. They can participate in discussions, edit their own comments, and resolve threads they initiated.
- **Authorship Check:** Enforced strictly on the server by comparing `comment.authorId` with `req.user.userId`.
- **Moderation:** Workspace Owners, Admins, and the Board Creator have moderator privileges to delete abusive comments.

---

## 7. Real-Time Collaboration & Socket.IO Architecture

Socket handlers integrate directly with the authoritative collaboration revision pipeline:
1. **`comment:create`**:
   - Validates socket room membership (`board:{boardId}`).
   - Executes inside `collaborationVersionService.executeWithRevision`.
   - Atomically increments board `collaborationRevision`.
   - Stores an idempotency record in `mutationService` if `mutationId` is provided.
   - Broadcasts `comment:created` to all other collaborators in the room.
   - Returns acknowledgement with canonical `CommentResponseDto` and `mutationId` to sender.
2. **`comment:update`**, **`comment:resolve`**, **`comment:delete`**:
   - Enforce author checks, moderation rules, and OCC `expectedVersion`.
   - Broadcast `comment:updated`, `comment:resolved`, `comment:deleted` with metadata envelope (`revision`, `actorId`, `occurredAt`).

---

## 8. Authoritative State & Recovery Compatibility

- **MongoDB as Source of Truth:** Comments are stored in MongoDB. Socket events are real-time delivery notifications, never the authoritative persistence store.
- **Reconnection Recovery:** When a client reconnects or wakes up from background sleep, [useBoardRecovery](file:///d:/workspace/canvasflow/client/src/features/canvas/hooks/useBoardRecovery.ts) performs authoritative REST hydration (`GET /api/v1/boards/:boardId/canvases/:canvasId/comments`).
- **No Event Replay:** Missed socket events are not buffered or replayed; fresh state is fetched directly from the database.

---

## 9. Performance & Database Optimization

### 9.1 Compound Indexes
1. `{ boardId: 1, canvasId: 1, createdAt: 1 }`: Supports fast, index-backed retrieval of all canvas comments in chronological order.
2. `{ boardId: 1, shapeId: 1, createdAt: 1 }`: Enables fast lookup of comments attached to specific shapes.
3. `{ parentCommentId: 1, createdAt: 1 }`: Allows quick resolution of child replies for active threads.
4. `{ authorId: 1, createdAt: -1 }`: Optimizes user activity feeds and audit queries.

### 9.2 Shape Comment Counts Aggregation
`countUnresolvedByShape` uses a MongoDB `$match` + `$group` aggregation pipeline, returning `{ [shapeId]: count }` without loading full comment documents into Node.js application memory.

---

## 10. Security & Input Sanitization

- **Authentication:** All REST endpoints and Socket.IO connections require valid JWT tokens.
- **Identity Derivation:** `authorId` is always extracted from the authenticated token (`req.user.userId` or `socket.data.user.userId`), never trusted from client request bodies.
- **IDOR Protection:** Cross-board and cross-canvas injections are strictly blocked (e.g. verifying `canvasId` belongs to `boardId`, and `shapeId` belongs to `canvasId`).
- **Content Limits:** Zod enforces `1..2000` characters, trimmed.
- **Coordinate Bounds:** `positionSchema` validates finite numbers, rejecting `NaN`, `Infinity`, and `-Infinity`.

---

## 11. Testing & Verification Matrix

### 11.1 Backend Test Execution

#### Comment Domain & Repository Unit Tests
```powershell
npx tsx -r tsconfig-paths/register src/modules/comment/tests/comment.domain.test.ts
```
- **Result:** **8 / 8 tests passed** (schema constraints, finite coordinates, 2000 char limit, soft-delete masking, shape decoupling, aggregation).

#### Comment Service Integration Tests
```powershell
npx tsx -r tsconfig-paths/register src/modules/comment/tests/comment.service.test.ts
```
- **Result:** **6 / 6 test suites passed** (world anchors, shape anchors, 1-level limit, cross-board rejections, RBAC across 5 roles, OCC conflicts, shape deletion survival).

#### Comment REST API Integration Tests
```powershell
npx tsx -r tsconfig-paths/register src/modules/comment/tests/comment.api.test.ts
```
- **Result:** **9 / 9 REST test suites passed** (401 unauth, 403 outsider, POST canvas comment, POST reply, GET canvas comments, GET single comment, PATCH author-only OCC, PATCH resolve, DELETE soft-delete).

#### Full Server Integration & RBAC Regression
```powershell
npm run test:run
```
- **Result:** **21 / 21 integration tests passed** (0 failures).

#### Full Real-Time Socket Comment Collaboration
```powershell
npx tsx -r tsconfig-paths/register src/socket/tests/socket-comment-sync.test.ts
```
- **Result:** **30 / 30 scenarios passed** (real-time creation, ack, broadcast, reply hierarchy, soft deletion, resolution, decoupling).

### 11.2 Frontend Test Execution

#### Comment Feature Tests
```powershell
npx vitest run src/features/comments
```
- **Result:** **3 / 3 test files passed, 20 / 20 tests passed** (`comment.mapper.test.ts`, `comment.api.test.ts`, `comment.store.test.ts`).

#### Full Client Test Suite
```powershell
npm run test:run
```
- **Result:** **38 / 38 test files passed, 429 / 429 tests passed** (0 failures).

### 11.3 Production Builds
- **Server:** `npm run build` (`tsc`) compiled with **0 errors**.
- **Client:** `npm run build` (`tsc -b && vite build`) bundled in **2.19s** with **0 errors**.

### 11.4 Git Cleanliness
- `git diff --check`: 0 whitespace errors, 0 syntax markers.

---

## 12. Architectural Decision Records (ADRs)

### ADR-1: Separation of Comments from Canvas Shapes
- **Decision:** Keep comments as independent collaboration entities outside the shape geometry store and Konva scene graph.
- **Rationale:** Prevents undo/redo pollution, eliminates vector transformation interference, and allows distinct RBAC rules for viewers.

### ADR-2: 1-Level Threading with Adjacency List
- **Decision:** Use `parentCommentId` with strict 1-level depth instead of nested document arrays or multi-collection architectures.
- **Rationale:** Minimizes concurrency write conflicts, avoids 16MB document bloat, and provides index-backed reply loading.

### ADR-3: Hybrid Canvas Anchoring (`shapeId?` + `position?`)
- **Decision:** Allow comments to pin either to empty canvas coordinates or shape references with fallback spatial coordinates.
- **Rationale:** Ensures comments stay attached to shapes during moves, while guaranteeing discussions survive shape deletion.

### ADR-4: Truthful Soft Deletion with Content Masking
- **Decision:** Mark deleted comments with `deletedAt: new Date()` and mask `content: ""` in the mapper rather than physically deleting rows.
- **Rationale:** Prevents orphaning child replies while clearly indicating to users that the comment was removed.

---

## 13. Senior Engineering Interview Questions & Answers

### Q1: Why should comments never be modeled as canvas Shapes?
**Answer:** In a production whiteboard architecture (like Figma or Miro), Shapes are vector graphical nodes that live in the spatial rendering tree (Konva layer hierarchy). They participate in geometric affine transformations, grouping, alignment, z-ordering, and local undo/redo history stacks. Comments, by contrast, are collaboration metadata containing user discussions, threaded replies, timestamps, and resolution states. If comments were shapes, pressing `Ctrl+Z` to undo a rectangle resize would inadvertently undo another collaborator's comment or reply. Furthermore, viewers who lack canvas draw permissions still need permission to participate in discussions. Maintaining strict architectural separation between Canvas Geometry and Collaboration Metadata prevents domain pollution and preserves clean undo/redo semantics.

### Q2: Why use a single MongoDB `Comment` collection with `parentCommentId` instead of an embedded `comments: []` array inside a `Thread` document?
**Answer:** Embedded arrays suffer from high concurrency write contention and MongoDB document size limits (16MB BSON limit). When multiple collaborators reply to a thread concurrently, writing to an embedded array requires updating the same parent document, triggering high OCC conflict rates and serializing writes. Furthermore, updating individual comments (like editing or soft deleting a reply) requires complex array positional operators (`$`, `$[elem]`). With an adjacency list in a single collection, each comment and reply is an autonomous document. Adding a reply is an atomic insert with zero write lock contention on the root comment, each comment has its own revision counter for OCC, and thread replies are fetched efficiently via `{ parentCommentId: 1, createdAt: 1 }`.

### Q3: Why enforce a strict 1-level reply limit rather than arbitrary N-level nested trees?
**Answer:** Collaborative whiteboards are designed for rapid, clear visual communication. Arbitrarily deep reply nesting (like Reddit or Hacker News) creates horizontal layout distortion, degrades readability on mobile or compact panels, and significantly complicates real-time cache invalidation and notification fan-out. Industry leaders (Figma, Miro, Slack, Linear) constrain threads to a single root comment and flat replies. This guarantees $O(1)$ thread depth resolution, predictable UI layouts, and simple linear sorting (`createdAt: 1`).

### Q4: How does hybrid canvas anchoring (`canvasId`, `shapeId?`, `position?`) handle shape movement and shape deletion?
**Answer:** When a comment is pinned to a shape, it stores `shapeId` and the initial click `position: { x, y }`. While the shape is active, the frontend computes the badge's screen coordinates relative to the shape's bounding box (`shape.x + shape.width, shape.y`), so the comment follows the shape during moves, rotations, and group operations. If the shape is deleted, `commentService.handleShapeDeleted(shapeId)` decouples the comment by setting `shapeId = null`. Because the comment retains its world-space `position`, it smoothly transitions to a canvas-level pin rather than being destroyed.

### Q5: Why should comments survive shape deletion instead of cascading deletes?
**Answer:** Comments frequently contain critical business context, architectural justifications, review sign-offs, and stakeholder feedback. If deleting a shape triggered a cascade delete on attached comments, a collaborator casually clearing a temporary mockup would destroy important audit trails and decision records. Decoupling preserves conversational integrity while reflecting that the graphical asset was removed.

### Q6: How does Optimistic Concurrency Control (OCC) prevent lost updates during concurrent comment edits?
**Answer:** When a client initiates an edit or resolution toggle, it transmits the comment's current `expectedVersion`. The server performs an atomic MongoDB `findOneAndUpdate({ _id, version: expectedVersion, deletedAt: null }, { $set: data, $inc: { version: 1 } })`. If two users simultaneously edit or resolve the comment, the first query matches, increments `version` to 2, and succeeds. The second query fails to match `version: 1` and returns `null`. The server detects this mismatch and throws a `ConflictError` (HTTP 409) containing the current server version, preventing last-write-wins overwrites.

### Q7: How does runtime RBAC safely allow Viewers to comment while restricting mutations?
**Answer:** CanvasFlow defines granular permissions in `workspace.authorization.ts`. `WorkspacePermission.ADD_COMMENT` is granted to all four workspace roles (`OWNER`, `ADMIN`, `EDITOR`, and `VIEWER`), allowing viewers to read, create root comments, and post replies. However, mutation operations (`updateComment`, `deleteComment`) perform secondary ownership checks: content editing is strictly restricted to `comment.authorId === req.user.userId`. Viewers cannot edit or resolve other users' comments. Moderation deletion is reserved for the comment author, workspace owners/admins, and the board creator.

### Q8: How does Socket.IO synchronize comment state across collaborators?
**Answer:** When a client emits `comment:create`, the socket server validates authentication, room membership, and RBAC permissions. It routes execution through `collaborationVersionService.executeWithRevision`, which executes the database write inside a transaction, increments the board's monotonic `collaborationRevision`, and records a `MutationRecord` for idempotency. The server then emits `comment:created` with the canonical DTO and collaboration metadata envelope (`{ revision, actorId, occurredAt }`) to all other sockets in room `board:{boardId}`, and acknowledges the sender with the persisted comment and `mutationId`.

### Q9: Why is MongoDB still the authoritative source of truth instead of Socket.IO event streams?
**Answer:** In-memory or streaming events are transient and vulnerable to network drops, socket reconnections, and server restarts. Treating Socket.IO as authoritative leads to split-brain scenarios and state drift. In CanvasFlow, mutations are committed to MongoDB before any socket broadcast occurs. When a client reconnects after network loss or browser sleep, [useBoardRecovery](file:///d:/workspace/canvasflow/client/src/features/canvas/hooks/useBoardRecovery.ts) re-hydrates authoritative state via REST from MongoDB. Socket events merely act as real-time transport notifications.

### Q10: How do compound indexes optimize comment retrieval for large boards with thousands of comments?
**Answer:** CanvasFlow utilizes compound indexes aligned with query access patterns:
1. `{ boardId: 1, canvasId: 1, createdAt: 1 }` enables MongoDB to satisfy canvas comment queries and chronological sorting via an index scan without an in-memory sort stage.
2. `{ parentCommentId: 1, createdAt: 1 }` allows instant retrieval of thread replies.
3. `{ boardId: 1, shapeId: 1, createdAt: 1 }` powers shape comment badge queries.
Without these compound indexes, queries would require expensive collection scans ($O(N)$) and in-memory sorting that would choke database performance on boards with 10,000+ comments.

### Q11: How does `countUnresolvedByShape` avoid N+1 queries and memory bloat?
**Answer:** Rather than executing separate queries per shape or loading all board comments into Node.js application memory to compute counts with JavaScript `.filter()`, `commentRepository.countUnresolvedByShape` uses MongoDB's aggregation pipeline (`$match` filtering by `boardId`, `canvasId`, `shapeId: { $in: shapeIds }`, `isResolved: false`, followed by `$group` on `shapeId` with `$sum: 1`). The database processes counts in C++ using index lookups and returns a compact array of `{ _id, count }`, minimizing network transfer and eliminating Node.js memory overhead.

### Q12: How does soft deletion maintain thread integrity when a root comment is deleted?
**Answer:** When a root comment is deleted, physically removing the document from MongoDB would orphan child replies or require complex cascading deletes. CanvasFlow sets `deletedAt: new Date()` and masks `content: ""` in the `CommentMapper`. In the client UI, the root comment renders as "This comment was deleted" while preserving the conversation thread and child replies beneath it.

### Q13: How does idempotency handling prevent duplicate comments on network retries?
**Answer:** When a client posts a comment over Socket.IO or REST, it generates a client-side UUID `mutationId`. `collaborationVersionService` verifies whether a `MutationRecord` already exists for this `(actorId, mutationId)`. If an identical request arrives while the first is in progress or completed (due to client timeouts or network retries), the server returns the cached result without creating a duplicate database document.

### Q14: How does the system prevent cross-board or cross-canvas injection attacks?
**Answer:** The service layer enforces strict relational validation before persisting comments:
1. `boardService.authorizeBoardAccess(boardId, userId)` verifies the user has access to the board.
2. `canvasRepository.findById(canvasId)` verifies the canvas exists and `canvas.boardId.equals(boardId)`.
3. If `shapeId` is specified, `ShapeModel.findById(shapeId)` verifies the shape exists, belongs to `canvasId`, and belongs to `boardId`.
4. If `parentCommentId` is specified, the service verifies the parent exists, is not deleted, belongs to the same `boardId`, and is a root comment (`parentCommentId === null`).

### Q15: How would this architecture scale to millions of comments?
**Answer:**
1. **Sharding:** The `Comment` collection can be sharded on `{ boardId: "hashed" }` or `{ workspaceId: 1, boardId: 1 }`, distributing boards evenly across database shards.
2. **Pagination:** Cursor-based pagination (`createdAt < cursorDate` or `_id < cursorId`) can be layered onto `{ boardId: 1, canvasId: 1, _id: -1 }` to stream comment history without deep-offset skipping.
3. **Read Replicas:** Board comment reads during canvas loading can be directed to MongoDB secondary read replicas using `ReadPreference.SECONDARY_PREFERRED`.
4. **Redis Caching:** Active thread reply counts and unresolved shape count maps can be cached in Redis with board-scoped invalidation tags.

---

## 14. Future Improvements (Scheduled for Later Slices)

The following features are intentionally out of scope for Slice 28 and scheduled for subsequent slices:
- **Slice 29:** Comment Pins UI, interactive comment composer popovers, and draggable canvas pins.
- **Slice 30:** `@mention` parsing, user mention autocomplete popovers, and mention notification triggers.
- **Slice 31:** In-app Notification Center, activity feeds, and email delivery.
- **Future:** Rich text formatting, file attachments, and emoji reactions.
