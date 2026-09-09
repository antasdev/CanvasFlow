# Slice 32 — Mentions

## 1. Purpose

In collaborative whiteboard environments like CanvasFlow, communication within comment threads often targets specific team members who need to review designs, approve changes, or answer questions. Slice 32 implements **Workspace Mentions** across:
- Root comments (canvas-anchored and shape-attached)
- Thread replies
- Comment inline edits

Users type `@` to trigger an autocomplete combobox populated with active workspace members. When selected, a structured mention reference is inserted into the text and tracked with exact positional indices. The server authoritatively validates membership and range integrity, saving structured metadata directly on the comment document so that future downstream services (such as Slice 33 Notifications) can identify recipients directly without parsing free-form comment text.

---

## 2. Architecture

Mentions integrate cleanly into CanvasFlow's existing layered architecture without introducing redundant stores, standalone collections, or duplicate socket networks.

### Mutation and Validation Flow
```
User types "@" trigger
        ↓
useMentionAutocomplete (Client Hook)
        ↓
Debounced Query → GET /api/v1/workspaces/:workspaceId/members?q=...
        ↓
User Selects Member from MentionListbox
        ↓
Content updated: "@Antas Antony " + Mentions array updated
        ↓
Client Mutation (useCommentMutations / useCommentSocket)
        ↓
Server CommentController / comment:create Handler
        ↓
Zod Validation (commentMentionValidationSchema)
        ↓
CommentService.resolveAndValidateMentions
  - Sorted range non-overlapping invariant
  - Content slice bounds check (slice starts with '@')
  - Workspace membership verification (Workspace owner or member)
  - User existence check & canonical displayName snapshot
        ↓
CommentRepository → MongoDB (Embedded mentions array)
        ↓
Socket.IO Broadcast (comment:created / comment:updated / comment:replied)
        ↓
Collaborator Comment Store → CommentItem renders structured mention chips
```

---

## 3. Data Model

Mentions are embedded as subdocuments directly within the `Comment` model rather than stored in a separate collection.

### Domain Type & Mongoose Subdocument
```typescript
export interface CommentMention {
  userId: Types.ObjectId | string;
  displayName: string;
  startIndex: number;
  endIndex: number;
}
```

### Mongoose Subdocument Schema
```typescript
const commentMentionSchema = new Schema<CommentMention>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Mention userId is required"],
    },
    displayName: {
      type: String,
      required: [true, "Mention displayName is required"],
      trim: true,
      maxlength: [100, "DisplayName cannot exceed 100 characters"],
    },
    startIndex: {
      type: Number,
      required: [true, "Mention startIndex is required"],
      min: [0, "startIndex cannot be negative"],
    },
    endIndex: {
      type: Number,
      required: [true, "Mention endIndex is required"],
      min: [1, "endIndex must be greater than 0"],
    },
  },
  { _id: false }
);
```

### Design Rationale for Embedded Documents
1. **Atomic Lifecycle**: Mentions exist solely in the context of comment content. Embedding ensures zero orphan records when a comment is deleted or resolved.
2. **OCC Consistency**: Updating content and mention metadata increments the single `version` counter atomically.
3. **Optimistic Updates & Socket Payloads**: Payloads include the canonical mentions alongside `content`, eliminating additional network requests or joins.
4. **Historical Snapshots**: `displayName` acts as a historical display snapshot at mention creation/edit time, while `userId` remains the stable invariant identifier.

---

## 4. Server Validation & Invariants

Client-submitted mention metadata is strictly untrusted. `CommentService.resolveAndValidateMentions` enforces the following server-side checks:

1. **Zero Silent Filtering**: If any mention fails validation, the **entire mutation is rejected with HTTP 400 Bad Request**. Partial saving or silent divergence is forbidden.
2. **Boundary Checks**: `startIndex >= 0`, `endIndex > startIndex`, and `endIndex <= content.length`.
3. **Non-Overlapping Ranges**: Mentions are sorted by `startIndex`; every `mention.startIndex` must be `>= previous.endIndex`.
4. **Content Slice Alignment**: `content.slice(startIndex, endIndex)` must start with `@`.
5. **Workspace Membership**: Target `userId` must either be the `workspace.ownerId` or exist in `WorkspaceMemberModel` for that `workspaceId`.
6. **Active User Existence**: Target `userId` must exist in `UserModel`.
7. **Canonical Display Name**: Display name is normalized from `user.fullName` into the persisted mention subdocument.
8. **Duplicate Mentions**: Multiple mentions of the same user in different positions within the same comment are fully supported and preserved with distinct range indices.
9. **Self-Mentions**: Self-mentions are valid and persisted normally.

---

## 5. Workspace Member Search

Member searching reuses the workspace module endpoint:
`GET /api/v1/workspaces/:workspaceId/members?q=...&limit=...`

### Features & Security
- **Authentication & Authorization**: Requires valid JWT and `WorkspacePermission.VIEW_MEMBERS` in the target workspace.
- **Query Filtering**: Searches case-insensitively across `fullName` and `email`.
- **Field Redaction**: Returns only safe identifying fields (`id`, `fullName`, `email`, `avatar`, `role`, `joinedAt`).
- **Scalability**: Limits results (default/configurable) to prevent massive memory transfer.

---

## 6. Frontend Autocomplete UX

Implemented through the reusable `useMentionAutocomplete` hook and `MentionListbox.tsx` component.

### Autocomplete Mechanics
1. **Trigger Detection**: Detects `@` typed at cursor position preceded by whitespace or at line start.
2. **Debounced Search**: Debounces member search API calls by 150ms to prevent request-per-keystroke flooding.
3. **Keyboard Interception**:
   - `ArrowDown` / `ArrowUp`: Navigates through matching members with cyclical wrap-around.
   - `Enter` / `Tab`: Selects the highlighted member and inserts `@DisplayName `, positioning the cursor immediately after the inserted mention. Comment submission is intercepted while the combobox is active.
   - `Escape`: Closes the listbox without closing or cancelling the comment composer.
   - `Shift+Enter`: Allows multiline text entry without triggering selection.
4. **Listbox Semantics**: Implements accessible WAI-ARIA combobox/listbox attributes (`role="listbox"`, `role="option"`, `aria-selected`, `aria-label`).

---

## 7. Editing & Mention Reconciliation

When users edit comments, content and mention metadata remain strictly synchronized:
- `reconcileMentions(content, mentions)` verifies that each tracked mention range matches `@${displayName}` in current text.
- If a user deletes the `@` symbol, modifies letters within the name, or truncates text, the invalid mention is pruned from the metadata payload.
- If a user types a new `@Name`, autocomplete adds a new mention to the array.
- On save, the server re-validates the entire updated array against the new content.

---

## 8. Mention Rendering & Accessibility

Mentions are rendered via `renderCommentContent` inside `CommentItem.tsx`:
- **Safe React Elements**: Uses pure React element tokenization (zero `dangerouslySetInnerHTML` or HTML string interpolation).
- **Styling**: Renders a styled blue pill badge (`bg-blue-50 text-blue-700 font-medium px-1.5 py-0.5 rounded-sm border border-blue-100`).
- **Screen Reader Support**: Wraps the `@` symbol in `aria-label="Mentioned user: Name"` so assistive technologies announce mentions with context.
- **Plain Text Preservation**: Preserves whitespaces, multiline linebreaks, and emojis cleanly.

---

## 9. Optimistic Concurrency Control (OCC)

Mentions do not introduce separate version numbers:
- Create, reply, update, resolve, and soft-delete operations share the comment's `version` field.
- If a concurrent mutation occurs, the server rejects the request with `409 Conflict`.
- `useCommentMutations` catches the 409 conflict and triggers canonical rollback and store reconciliation.

---

## 10. Socket.IO Real-Time Synchronization

Mentions are synchronized across all connected collaborators using existing event channels:
- `comment:created`
- `comment:updated`
- `comment:replied`

Socket payloads include the complete `mentions: CommentMentionDto[]` array, allowing remote clients to immediately render mention badges without extra roundtrips.

---

## 11. Security Considerations

1. **IDOR & Workspace Isolation**: Users cannot mention members from arbitrary workspaces; validation enforces membership within the comment's workspace.
2. **No User Enumeration**: Search endpoint requires authorized workspace membership.
3. **Strict Range Invariants**: Content range verification prevents malicious payloads from causing index errors or out-of-bounds slicing.
4. **XSS Prevention**: Display names and content are rendered as React text nodes, eliminating script injection vectors.
5. **Soft Delete Privacy**: On comment soft deletion, the backend mapper explicitly clears `mentions: []`, ensuring deleted metadata is not exposed.

---

## 12. Performance & Scalability

- **Database**: No joins required for loading comments with mentions because mentions are embedded in the `Comment` document.
- **Client Debounce**: Autocomplete queries are debounced at 150ms.
- **Memory Footprint**: Result sets are constrained to target workspaces and query limits.

---

## 13. Slice 33 (Notifications) Compatibility

Slice 33 Notifications will consume structured mention metadata directly:
```typescript
// Slice 33 Notification Dispatcher (Conceptual Preview)
export async function dispatchCommentMentionNotifications(comment: CommentDocument) {
  if (!comment.mentions || comment.mentions.length === 0) return;

  // 1. Extract and deduplicate recipient user IDs directly from structured metadata
  const recipientIds = Array.from(
    new Set(
      comment.mentions
        .map((m) => m.userId.toString())
        .filter((id) => id !== comment.authorId.toString()) // Exclude author self-mentions
    )
  );

  // 2. Dispatch notifications without parsing free-form comment text or running regex
  for (const recipientId of recipientIds) {
    await notificationService.create({
      recipientId,
      actorId: comment.authorId,
      type: "COMMENT_MENTION",
      entityId: comment._id,
      boardId: comment.boardId,
    });
  }
}
```

---

## 14. Testing & Verification

### Test Suites Executed
1. **Comment Domain & Repository Unit Tests** (`comment.domain.test.ts`):
   - Structured mentions persistence on root and reply comments.
   - DTO mapping and masking to `[]` on soft-deleted comments.
2. **Comment Service Integration Tests** (`comment.service.test.ts`):
   - Single, multiple, duplicate, and self-mentions validation.
   - Rejection of non-workspace members (400 Bad Request).
   - Rejection of invalid ranges, out-of-bounds slices, and overlapping ranges.
   - Mention addition, removal, and replacement during comment edits.
3. **Comment REST API Integration Tests** (`comment.api.test.ts`):
   - Member search with query filter `GET /workspaces/:id/members?q=...`.
   - REST create comment, create reply, and update comment with mentions.
   - Non-member and invalid range 400 status error handling.
4. **Frontend Unit & Component Tests** (`Vitest`):
   - `useMentionAutocomplete.test.ts`: range reconciliation, slice validation, duplicate range preservation.
   - `MentionListbox.test.ts`: accessibility, keyboard selection, loading/empty states.
   - `CommentItem.test.ts`: safe tokenization, inline edit mention persistence.
   - `CommentComposer`, `CommentReplyComposer`, `FloatingCommentComposer`: mention propagation.
   - **48 Vitest test files (478 tests passed)**.
5. **Regression Verification**:
   - Auth integration tests (12 passed).
   - Workspace & Board RBAC integration tests (9 passed).
   - TypeScript compilation (`tsc`) on both server and client (0 errors).
   - Production bundle build with Vite (0 errors).

---

## 15. Trade-offs & Design Decisions

| Decision | Trade-off | Rationale |
|---|---|---|
| Embedded `mentions` array | Slight duplication of display names | Eliminates joins, guarantees atomicity with OCC versioning, simplifies soft-delete and cascade semantics. |
| Strict 400 Bad Request rejection | Requires valid client input | Prevents silent divergence between what user typed and what server persisted. |
| Historical `displayName` snapshot | Name changes in user profile don't immediately alter old mentions | Preserves comment context as written at that point in time while maintaining stable `userId` for identity. |
| Client-side range reconciliation | Range tracking on textarea input | Lightweight and robust without requiring heavy rich-text editor dependencies like Slate or Prosemirror. |

---

## 16. Future Improvements

1. **Slice 33 Notification Integration**: Hooking up the notification service to consume `comment.mentions` directly.
2. **Workspace Group Mentions**: Support `@channel` or `@team` group mentions in future enterprise slices.
3. **Hovercards on Mentions**: Rich popover preview showing mentioned user's profile and online presence status.
