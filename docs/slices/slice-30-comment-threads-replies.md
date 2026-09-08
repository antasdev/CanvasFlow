# Slice 30 — Comment Threads & Replies

## 1. Purpose

Slice 30 upgrades CanvasFlow's comment infrastructure into a production-grade threaded collaboration system. It enables multi-user threaded conversations with deterministic reply ordering, inline editing, soft deletion, thread resolution toggles, runtime RBAC enforcement, optimistic UI updates with safe error rollbacks, and real-time Socket.IO synchronization protected by atomic monotonic board revisions and mutation idempotency.

---

## 2. Architecture

CanvasFlow maintains a clean separation of concerns across frontend and backend layers:

```
[ Frontend: React / Zustand / TanStack Query ]
  Pages (CanvasPage)
    ↓
  Features (CanvasCommentOverlay, CommentPanel)
    ↓
  Components (CommentThread, CommentItem, CommentReplyComposer, CommentMarker)
    ↓
  Hooks (useCommentMutations, useCommentSocket, useComments)
    ↓
  Services / Store (SocketClientService, CommentStore)
    ↓
  API (commentApi)
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
  Emits canonical envelope { meta, comment, boardId, commentId }
    ↓
  Peer Clients (Deduplicated via revision & Store ID map)
```

---

## 3. Thread Model

CanvasFlow implements a **strict 1-level thread hierarchy**:

* **Root Comment**: `parentCommentId = null`. Anchored to canvas coordinates (`position: { x, y }`) or attached to shapes (`shapeId`).
* **Thread Reply**: `parentCommentId = rootCommentId`. Inherits spatial anchoring and canvas context from the root comment.
* **Nested Replies (Prohibited)**: Attempting to reply to a reply (`parent.parentCommentId !== null`) is rejected server-side with `400 Bad Request`.

```
Root Comment (parentCommentId: null)
 ├── Reply 1 (parentCommentId: rootId)
 ├── Reply 2 (parentCommentId: rootId)
 └── Reply 3 (parentCommentId: rootId)
```

### Deterministic Reply Ordering
To ensure that all collaborators view the conversation in identical order across reconnects and asynchronous Socket.IO broadcasts, replies are deterministically sorted by:

$$\text{createdAt Ascending (Chronological)}$$

The UI explicitly applies `[...replies].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())`.

---

## 4. Concurrency & Optimistic Concurrency Control (OCC)

To prevent lost updates in concurrent multi-user environments:

1. **Entity Versioning**: Every comment document tracks an integer `version`.
2. **OCC Checks**: When updating or resolving with an `expectedVersion`, the backend atomically performs `findOneAndUpdate({ _id, version: expectedVersion }, { ... , $inc: { version: 1 } })`.
3. **Conflict Handling (`409 Conflict`)**: If the version is stale (e.g., another user edited the comment concurrently), the backend returns `409 Conflict` (`ConflictError`).
4. **Frontend Rollback**: The frontend preserves the canonical server state and rolls back the optimistic update while notifying the user with an actionable toast error.

---

## 5. Permissions & Runtime RBAC

Authorization is enforced dynamically on the server at mutation time for both HTTP REST and Socket.IO channels:

| Action | Allowed Roles | Authorization Rules |
| :--- | :--- | :--- |
| **Create Root / Reply** | `OWNER`, `ADMIN`, `EDITOR`, `VIEWER` | Verified via `assertWorkspacePermission(role, ADD_COMMENT)` |
| **Edit Content** | Author only | `userId.equals(comment.authorId)`. Cannot edit soft-deleted comments. |
| **Soft Delete** | Author, Board Creator, `OWNER`, `ADMIN` | Author or workspace/board moderation privileges |
| **Resolve / Unresolve** | Author, `OWNER`, `ADMIN`, `EDITOR` | Author or privileged editor/admin |

---

## 6. Soft Deletion & Thread Relationship Preservation

When a comment is deleted:
1. `deletedAt` is populated with the current timestamp and version is incremented.
2. The document is **not** removed from MongoDB, preserving the parent-child relationship for existing replies.
3. In `CommentMapper.toResponseDto`:
   - Content is masked to `content: ""` and `isDeleted: true`.
4. In the UI:
   - Deleted root comments display `"This comment was deleted."`.
   - Replies attached to the deleted root remain visible in the thread.
   - Reply creation on a deleted root is disabled and rejected server-side.

---

## 7. Real-Time Socket.IO Synchronization

### Event Contracts

All real-time mutations emit canonical envelopes containing monotonic revision metadata and canonical response DTOs:

* `comment:create` $\rightarrow$ Broadcasts `comment:created` with `{ meta, comment }`
* `comment:update` $\rightarrow$ Broadcasts `comment:updated` with `{ meta, comment }`
* `comment:resolve` $\rightarrow$ Broadcasts `comment:resolved` with `{ meta, comment }`
* `comment:delete` $\rightarrow$ Broadcasts `comment:deleted` with `{ meta, boardId, commentId, comment }`

### Event Deduplication & Optimistic Reconciliation
1. When a user submits a comment or reply, an optimistic comment with a temporary ID (`temp_...`) and `isOptimistic: true` is inserted into `useCommentStore`.
2. Upon receiving the server acknowledgement or Socket.IO response, `replaceOptimisticComment(tempId, canonicalComment)` seamlessly swaps the temporary key for the canonical server ID.
3. The store's key-based dictionary (`Record<string, Comment>`) guarantees that incoming socket broadcasts for the same comment update the authoritative entity in-place without generating duplicates.

---

## 8. UI Components

1. **`CommentThread.tsx`**: Renders root discussion point, deterministic sorted replies list, resolve toggle, and reply composer.
2. **`CommentItem.tsx`**: Renders author initials avatar, relative timestamp, `(edited)` indicator, `(sending...)` optimistic badge, soft-deleted placeholder, and inline editor.
   - Inline editor supports `Enter` (without Shift) / `Ctrl+Enter` to save, `Shift+Enter` for newline, `Escape` to cancel, and character limit counter.
3. **`CommentReplyComposer.tsx`**: Indented controlled composer with autoFocus and keyboard actions.
4. **`CommentPanel.tsx`**: Filter tabs ("All", "Open", "Resolved"), shape context filter banner, thread grouping, and open counter.
5. **`CanvasCommentOverlay.tsx` & `CommentMarker.tsx`**: World-anchored comment pins with active selection indicators and hover preview cards.

---

## 9. Verification & Test Suite

### Automated Backend Tests
* `server/src/modules/comment/tests/comment.domain.test.ts` (8 tests):
  - Finite coordinate schema validation, content length limits, repository creation, reply parent linking, shape unresolved counts, soft deletion masking, shape deletion decoupling.
* `server/src/modules/comment/tests/comment.service.test.ts` (6 tests):
  - Root comment anchors, invalid canvas rejection, 1-level thread limit enforcement, 5-role RBAC permissions, OCC conflict detection, shape decoupling.
* `server/src/modules/comment/tests/comment.api.test.ts` (9 tests):
  - Auth checks (401/403), POST canvas comment (201), POST reply (201), GET canvas comments (200), GET single comment (200), PATCH update with author & OCC checks (403/409/200), PATCH resolve (200), DELETE soft-delete (200).

### Automated Frontend Tests
* 45 client test files / 460 tests passing in Vitest:
  - `CommentThread.test.ts`: Deterministic chronological reply sorting, soft-deleted root thread preservation, reply and resolve submission.
  - `CommentItem.test.ts`: Inline edit save/cancel keyboard events, validation, delete execution, soft-deleted placeholder and menu suppression, edited badge.
  - `CommentReplyComposer.test.ts`: 2000 character limit, whitespace trimming, keyboard handlers.
  - `useCommentMutations.test.ts`: Optimistic reply lifecycle, canonical replacement, network error rollback, OCC 409 conflict rollback.
  - `comment.store.test.ts`: Normalization by ID, soft deletion, optimistic replacement, canvas history isolation.

### Build Verification
* `client`: `npm run build` $\rightarrow$ PASS (0 errors)
* `server`: `npm run build` $\rightarrow$ PASS (0 errors)
* `git diff --check` $\rightarrow$ PASS (clean formatting)

---

## 10. Future Improvements (Strictly Deferred)

* **Slice 31**: User `@mentions` and autocomplete.
* **Slice 32**: User notifications and email alerts.
* **Slice 33**: Collaboration offline recovery redesign and resilience hardening.
* **Slice 34**: Full accessibility (WCAG AAA) polish.
