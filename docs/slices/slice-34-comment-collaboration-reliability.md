# Slice 34 — Comment Collaboration Reliability

## Purpose

The purpose of **Slice 34 — Comment Collaboration Reliability** is to harden the existing CanvasFlow comment collaboration subsystem against distributed-system failures. In collaborative real-time whiteboards, network drops, server restarts, socket reconnections, out-of-order socket packet delivery, concurrent edits, and permission changes can lead to split-brain states, phantom comments, duplicate notifications, or corrupted thread hierarchies if not systematically protected.

Slice 34 establishes strict distributed-systems guarantees across the entire comment lifecycle without introducing duplicate services or stores, reinforcing the invariant that **the server and MongoDB remain the sole authoritative source of truth**.

---

## Architecture

CanvasFlow maintains three distinct state categories:

```text
AUTHORITATIVE STATE
MongoDB
    ↓
Comments / Replies / Mentions / Resolution / Versions / Collaboration Revision
```

```text
EPHEMERAL COLLABORATION STATE
Socket.IO
    ↓
Connection / Presence / Transient Events
```

```text
PENDING CLIENT MUTATIONS
Mutation Journal (useMutationStore)
    ↓
Optimistic State / Retry / Reconciliation
```

### Complete Mutation & Collaboration Lifecycle

```text
User Action
    ↓
Optimistic Comment Creation / Edit / Resolve / Delete (CommentStore)
    ↓
Mutation Journal Registration (useMutationStore via mutationManager)
    ↓
REST / Socket Delivery (SocketClientService / CommentApi)
    ↓
Authentication & Runtime RBAC Verification (BoardService & WorkspaceMemberModel)
    ↓
Validation & Structured Mention Verification
    ↓
Optimistic Concurrency Control (OCC) check against expectedVersion
    ↓
MongoDB Atomic Update / Soft Delete
    ↓
Collaboration Revision Incremented (collaborationVersionService)
    ↓
Canonical Socket Event Broadcasted (`comment:created`, `comment:updated`, `comment:resolved`)
    ↓
Client Event Freshness Check & Bounded Cache Deduplication
    ↓
Temporary ID Atomic Replacement (`temp-*` -> canonical `ObjectId`)
    ↓
Mutation Journal Confirmation & Removal
```

---

## Mutation Lifecycle

Every comment mutation is assigned a stable `mutationId` upon user initiation. If an operation fails due to network transport and is retried, the same `mutationId` is reused across all retry attempts.

### Lifecycle States in `useMutationStore`:

1. **`pending`**: Mutation has been applied optimistically to the local `CommentStore` and dispatched over Socket.IO / REST.
2. **`confirmed`**: Authoritative acknowledgment or socket event received with matching `mutationId`. The mutation is confirmed and removed from the active journal to prevent memory leaks.
3. **`failed`**: Mutation rejected due to a non-retryable error (e.g., `403 Forbidden`, `400 Bad Request`, `404 Not Found`). Optimistic changes are rolled back, and an error notification is displayed.
4. **`conflicted`**: Mutation rejected due to `409 Conflict` (OCC version mismatch). Mutation is marked conflicted, optimistic changes are rolled back, the latest server state is restored, and the user is alerted.
5. **`uncertain`**: The mutation was dispatched, but transport disconnected before acknowledgment. On reconnect recovery, the client checks if the mutation was committed by the server before deciding to confirm or retry.

---

## Authoritative Recovery & Reconnect

When a Socket.IO disconnection occurs or a revision gap is detected, the client enters the **`recovering`** state.

```text
Socket Disconnect / Gap Detected
       ↓
Connection State = Recovering
       ↓
Reconnect & Authenticate
       ↓
Join Board Room
       ↓
Fetch Authoritative Comments (GET /boards/:boardId/comments)
       ↓
reconcileAuthoritativeComments()
  - Reconciles entity versions
  - Preserves valid in-flight optimistic comments (isOptimistic: true)
  - Removes stale / rejected temporary comments
  - Preserves soft-deleted masking
       ↓
Reconcile Pending Mutations in Journal
       ↓
Connection State = Connected (Synchronized)
```

Recovery is strictly **idempotent**: running recovery multiple times produces identical store states without duplicating comments or wiping in-flight drafts.

---

## Event Ordering: Entity Version vs Collaboration Revision

CanvasFlow separates entity freshness from event stream continuity:

| Concept | Identifier | Purpose | Rule |
| :--- | :--- | :--- | :--- |
| **Entity Version** | `comment.version` | Concurrency control per comment entity in MongoDB. | If incoming `comment.version < stored.version`, the stale update is discarded. |
| **Collaboration Revision** | `meta.revision` | Monotonic board-wide event stream sequence. | Checked via `checkEventFreshness(boardId, revision)`. If `revision <= currentRevision`, event is ignored. If `revision > currentRevision + 1`, recovery is triggered for missing gap. |

This dual-layer mechanism guarantees that out-of-order network arrival cannot overwrite newer state with stale data, and stream gaps trigger recovery automatically.

---

## Duplicate Event Protection

The client implements dual-defense duplicate protection:
1. **Bounded In-Memory Cache**: `useCommentSocket` tracks the last 200 processed `eventId`s in `seenEventIdsRef`.
2. **Deterministic Invariant Freshness**: Even if an event falls out of the cache, `checkEventFreshness` (revision check) and `comment.version` comparison guarantee that applying the same event a second time is completely harmless and idempotent.

---

## Create Comment Reconciliation & Temporary IDs

When a comment is created locally:
1. Client generates a temporary ID (e.g. `temp-1741523456789-abc`).
2. Optimistic comment is inserted into `CommentStore` with `isOptimistic: true`.
3. Server returns canonical MongoDB `_id` in response DTO.
4. `CommentStore.replaceOptimisticComment(tempId, canonicalComment)` atomically replaces the temporary comment in the dictionary and index lists (`canvasIndex`, `shapeIndex`, `rootCommentIds`).
5. Child replies referencing `tempId` are migrated to reference the canonical `_id`.

No ghost duplicates (`temp-*` alongside `mongo-id`) can persist in state.

---

## Optimistic Concurrency Control (OCC)

Mutable operations (`updateComment`, `resolveComment`, `deleteComment`) include `expectedVersion`:

```typescript
// Server OCC Guard
if (expectedVersion !== undefined) {
  updated = await commentRepository.updateWithExpectedVersion(
    commentId,
    expectedVersion,
    updateData,
    session
  );
  if (!updated) {
    throw new ConflictError("comment", commentId.toString(), existing.version);
  }
}
```

If another user modified the comment concurrently:
- Server responds with `409 Conflict`.
- Client catches `409`, rolls back optimistic updates via original snapshot, marks mutation `conflicted`, fetches authoritative comment, and notifies the user.

---

## Runtime RBAC & Permission Downgrade

Permissions are evaluated dynamically on every request and mutation against MongoDB `WorkspaceMemberModel` and board ownership:
- Even if the client cached an `EDITOR` role, if the workspace admin downgrades the user to `VIEWER`, the server rejects subsequent updates/deletions with `403 Forbidden`.
- Client catches `403`, rolls back optimistic state, marks mutation `failed`, suppresses automatic retry, and displays an authorization error.

---

## Socket Event vs Recovery Races

Regardless of network packet arrival order, final state is deterministic:

### Race A (Recovery Request -> Socket Event -> Recovery Response)
1. Socket event arrives and applies newer version (e.g. `version: 3`).
2. Recovery response arrives with older snapshot (e.g. `version: 2`).
3. `reconcileAuthoritativeComments` ignores stale `version: 2` because `version: 3` is already stored with higher entity version.

### Race B (Recovery Request -> Recovery Response -> Socket Event)
1. Recovery response applies `version: 2`.
2. Socket event arrives with `version: 3`.
3. Entity version check and revision freshness accept `version: 3` and advance store.

---

## Notification Subsystem Idempotency

Slice 34 verifies that retrying a comment mutation with the same `mutationId` or receiving duplicate socket events does not generate duplicate notification records in MongoDB:
- `dispatchMentionNotifications` checks previously notified user IDs during comment edits.
- Replayed socket events do not trigger backend notification pipelines because notifications are emitted strictly upon authoritative MongoDB mutation execution.

---

## Verification & Test Results

### 1. Backend Test Suites (`server`)

- **Comment Domain Tests**: `src/modules/comment/tests/comment.domain.test.ts` (9 tests passed)
- **Comment Service Tests**: `src/modules/comment/tests/comment.service.test.ts` (7 tests passed)
- **Comment REST API Tests**: `src/modules/comment/tests/comment.api.test.ts` (10 tests passed)
- **Comment Collaboration Reliability Tests**: `src/modules/comment/tests/comment.reliability.test.ts` (5 tests passed):
  - Test 1: OCC Conflict protection against stale versions (409).
  - Test 2: Idempotency and duplicate side-effect protection.
  - Test 3: Runtime RBAC downgrade protection (403).
  - Test 4: Authoritative recovery consistency & soft-delete masking.
  - Test 5: Monotonic thread depth & reply hierarchy.
- **Notification Test Suites**: `src/modules/notification/tests/*.ts` (18 tests passed across domain, service, and API).

### 2. Frontend Test Suites (`client`)

- **Vitest Run**: 51 test files, **496 tests passed (100% pass rate)**.
- **Comment Reliability Suite**: `src/features/comments/__tests__/comment.reliability.test.ts` (7 tests passed):
  - 1. OCC 409 Conflict Rollback.
  - 2. RBAC 403 Downgrade Rollback.
  - 3. Version-Aware Entity Freshness.
  - 4. Recovery Reconciliation preserving active in-flight optimistic comments.
  - 5. Temporary ID Atomic Replacement.
  - 6. Mutation Journal Tracking & confirmation cleanup.
  - 7. Monotonic Collaboration Revision Freshness via `checkEventFreshness`.

### 3. Production Builds & Formatting
- Server TypeScript compilation (`tsc`): **PASS**
- Client production bundle (`tsc -b && vite build`): **PASS**
- Git diff whitespace & format check (`git diff --check`): **PASS**

---

## Future Improvements

1. **Redis-Backed Distributed Socket Fanout**: Adapter for horizontal multi-node socket cluster.
2. **Durable IndexedDB Offline Queue**: Client-side IndexedDB persistence for offline drafts across browser restarts.
3. **Automated End-to-End Playwright Multi-Tab Tests**: Headless browser multi-tab concurrent interaction tests.
