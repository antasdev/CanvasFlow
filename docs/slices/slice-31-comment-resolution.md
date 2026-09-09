# Slice 31 — Comment Resolution Workflow

## 1. Purpose

Slice 31 implements the comprehensive **Comment Resolution Workflow** in CanvasFlow, building on the basic resolve/unresolve mutations established in Slice 30. It provides a complete, deterministic discussion lifecycle for active and resolved whiteboarding threads, non-destructive view-layer filtering (`All`, `Open`, `Resolved`), derived filter counts, contextual empty states, visual resolution indicators, optimistic state rollbacks, and server-authoritative Optimistic Concurrency Control (OCC) and runtime RBAC.

---

## 2. Architecture & Design Principles

Slice 31 extends the existing CanvasFlow comment architecture without introducing duplicate repositories, services, or competing stores:

```
[ Frontend: React / Zustand / TanStack Query ]
  Pages (CanvasPage)
    ↓
  Features (CanvasCommentOverlay, CommentPanel)
    ↓
  Components (CommentThread, CommentItem, CommentMarker, CommentResolveButton)
    ↓
  Hooks (useCommentMutations, useCommentSocket, useComments)
    ↓
  Store (useCommentStore — Centralized Canonical Dictionary)
    ↓
  API (commentApi / socketClientService)
        │
        ▼ (Socket.IO / REST HTTP)
[ Backend: Node.js / Express / Socket.IO / MongoDB ]
  Route / Socket Handler (comment.routes.ts, comment.handler.ts)
    ↓
  Controller (comment.controller.ts)
    ↓
  Service (comment.service.ts — runtime RBAC, OCC, 1-level validation)
    ↓
  Repository (comment.repository.ts)
    ↓
  MongoDB (comments collection)
        │
        ▼
[ Socket.IO Broadcast ]
  Emits canonical envelope { meta, comment }
    ↓
  Peer Clients (Deduplicated via monotonic revision & Store ID map)
```

---

## 3. Resolution Domain Model & Lifecycle

### Deterministic Lifecycle States

The resolution lifecycle transitions cleanly between Open and Resolved states:

```
        ┌─────────────┐
        │    OPEN     │ ◄─── Reopen (resolvedAt = null, resolvedBy = null)
        └──────┬──────┘
               │
               │ Resolve (resolvedAt = timestamp, resolvedBy = user)
               ▼
        ┌─────────────┐
        │  RESOLVED   │
        └─────────────┘
```

### Authoritative Representation
Resolution state is represented deterministically in the comment document:
* **Open Comment**: `isResolved: false`, `resolvedAt: null`, `resolvedBy: null`.
* **Resolved Comment**: `isResolved: true`, `resolvedAt: Date`, `resolvedBy: ObjectId`.
* **Reopened Comment**: `isResolved: false`, `resolvedAt: null`, `resolvedBy: null`.

### Identity and Spatial Anchor Preservation
When a comment is resolved or reopened:
* `_id`, `authorId`, `boardId`, `canvasId`, and `createdAt` remain unmodified.
* World coordinates (`position: { x, y }`) and shape attachments (`shapeId`) remain strictly intact.
* Thread hierarchy (`parentCommentId`) is preserved; replies attached to a root comment remain intact.
* Version (`version`) is incremented atomically.
* Soft-deleted comments (`deletedAt !== null`) **cannot** be resolved or reopened (rejected server-side with `400 Bad Request`).

---

## 4. Frontend View Filtering & Count Derivation

### Non-Destructive Filtering
Filtering is strictly a **view concern**. Selecting a filter tab never mutates or removes comments from the canonical Zustand store (`useCommentStore`).

```
Canonical Zustand Store (`comments: Record<string, Comment>`)
                   │
                   ▼
Derived Selectors (`useMemo`)
  ├── allCount: non-deleted root threads matching active shape
  ├── openCount: open non-deleted root threads (!root.isResolved)
  └── resolvedCount: resolved non-deleted root threads (root.isResolved)
                   │
                   ▼
Filtered Thread View (`filteredThreads`)
  ├── "all"      → open + resolved threads
  ├── "open"     → only open threads
  └── "resolved" → only resolved threads
```

### Contextual Empty States
`CommentPanel` renders clear, actionable empty states tailored to both the active status filter and any selected canvas shape:
* **All (No Comments)**: `"No comments yet. Start a discussion by adding a comment above."`
* **Open (All Resolved)**: `"No open comments. All comments on this board are resolved."`
* **Resolved (None Resolved)**: `"No resolved comments. Resolved threads will appear here."`
* **Shape Filtered**: Custom guidance indicating whether the shape has no comments, no open comments, or no resolved comments.

---

## 5. Optimistic Concurrency Control (OCC) & Rollback

1. **Optimistic Updates**: When a user clicks Resolve or Reopen, the UI immediately updates `isResolved` in `useCommentStore`.
2. **Version Payload**: The mutation sends `expectedVersion: previousComment.version` over Socket.IO or HTTP REST.
3. **Atomic Backend Check**: The repository executes `findOneAndUpdate({ _id, version: expectedVersion, deletedAt: null }, { $set: updateData, $inc: { version: 1 } })`.
4. **409 Conflict Rollback**: If another collaborator updated or resolved the thread concurrently, the backend returns `409 Conflict`. The client rolls back to `previousComment` using `updateStoreComment(previousComment)` and alerts the user with: `"Comment was modified by another collaborator. Please refresh."`.

---

## 6. Runtime RBAC Matrix

Server-side authorization is strictly enforced on both HTTP REST and Socket.IO channels:

| Action | Allowed Roles | Authorization Enforcement |
| :--- | :--- | :--- |
| **Resolve Thread** | Thread Author, `OWNER`, `ADMIN`, `EDITOR` | Verified in `commentService.resolveComment` via `resolveUserWorkspaceRole`. Non-author `VIEWER` and outsiders rejected with `403 Forbidden`. |
| **Reopen Thread** | Thread Author, `OWNER`, `ADMIN`, `EDITOR` | Verified in `commentService.resolveComment`. |
| **Resolve Soft-Deleted Comment** | None | Prohibited. Throws `400 Bad Request`. |

---

## 7. Real-Time Synchronization & Deduplication

### Socket.IO Event Contracts
* `comment:resolve` $\rightarrow$ Client mutation payload: `{ boardId, commentId, isResolved, expectedVersion?, mutationId? }`.
* `comment:resolved` $\rightarrow$ Server broadcast payload: `{ meta: CollaborationEventMeta, comment: CommentResponseDto }`.

### Deduplication & Monotonic Revisions
* The server increments the monotonic board revision inside `collaborationVersionService.executeWithRevision`.
* Peer clients validate event freshness via `checkEventFreshness(boardId, meta.revision)` to prevent stale replays.
* Keyed dictionary storage (`comments[comment.id]`) guarantees in-place reconciliation without duplicating comments.

---

## 8. Canvas Comment Marker Behavior

* **Canvas Anchors**: Markers positioned at world coordinates via `worldToScreen(position, { zoom, pan })`.
* **Marker Appearance**:
  - Open comments display standard marker styling.
  - Resolved comments display emerald green background with a checkmark icon (`<Check className="h-4 w-4 stroke-[3]" />`).
* **Accessibility**:
  - `aria-label`: `"Resolved comment by {authorName}: {snippet}"` for resolved pins; `"Comment by {authorName}: {snippet}"` for open pins.
  - Keyboard activation supported via `Enter` and `Space`.
* **Overlay Filter Synchronization**:
  - When filter is `open`, only unresolved markers appear on canvas.
  - When filter is `resolved`, only resolved markers appear on canvas.
  - When filter is `all`, both open and resolved markers remain discoverable.

---

## 9. Verification & Test Suite

### Automated Backend Tests
* `server/src/modules/comment/tests/comment.domain.test.ts` (8 tests):
  - Finite coordinate schema validation, content length limits, repository creation, reply parent linking, shape unresolved counts, resolution lifecycle (open $\rightarrow$ resolve $\rightarrow$ reopen), soft deletion masking, shape deletion decoupling.
* `server/src/modules/comment/tests/comment.service.test.ts` (6 tests):
  - Root comment anchors, invalid canvas rejection, 1-level thread limit enforcement, 5-role RBAC permissions, resolution and reopen authorization, soft-deleted comment resolve rejection, OCC conflict detection, shape decoupling.
* `server/src/modules/comment/tests/comment.api.test.ts` (9 tests):
  - Auth checks (401/403), POST canvas comment (201), POST reply (201), GET canvas comments (200), GET single comment (200), PATCH update with author & OCC checks (403/409/200), PATCH resolve & reopen with OCC and status filtering (`?resolved=true`) (409/200), DELETE soft-delete (200).

### Automated Frontend Tests
* 46 client test files / 466 tests passing in Vitest:
  - `CommentPanel.test.ts`: Filter tabs ("All", "Open", "Resolved"), derived counts calculation, shape-scoped filtering, non-destructive store state preservation, contextual empty states.
  - `CommentThread.test.ts`: Deterministic chronological reply sorting, soft-deleted root thread preservation, reply and resolve/reopen submission, reply hierarchy preservation under resolved root.
  - `CommentItem.test.ts`: Inline edit save/cancel keyboard events, validation, delete execution, soft-deleted placeholder and menu suppression, edited badge.
  - `CommentMarker.test.ts`: World-to-screen coordinate transformation, snippet truncation, click isolation, keyboard navigation, accessible labels.
  - `useCommentMutations.test.ts`: Optimistic reply lifecycle, canonical replacement, resolution full lifecycle, OCC 409 conflict rollback, network error rollback.
  - `comment.store.test.ts`: Normalization by ID, soft deletion, optimistic replacement, resolution state transitions with `resolvedAt` timestamps, canvas history isolation.

### Build Verification
* `client`: `npm run build` $\rightarrow$ PASS (0 errors)
* `server`: `npm run build` $\rightarrow$ PASS (0 errors)
* `git diff --check` $\rightarrow$ PASS (clean formatting)

---

## 10. Future Improvements (Strictly Deferred)

* **Slice 32**: User `@mentions` and autocomplete in comments and replies.
* **Slice 33**: User notification center and email notification dispatch.
* **Slice 34**: Resolution audit history and activity timeline.
