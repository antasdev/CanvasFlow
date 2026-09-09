# Slice 33: Notifications

## 1. Purpose

CanvasFlow requires a scalable, maintainable, and real-time notification subsystem to keep whiteboard collaborators informed about critical collaborative events:
- **Mentions**: Notifying collaborators when they are @mentioned in comments or replies.
- **Comment Replies**: Notifying thread participants (root comment author and previous repliers) when new replies are submitted.
- **Thread Activity**: Notifying thread participants when threads are resolved or reopened.
- **Multi-Tab & Reconnect Consistency**: Keeping multi-tab browser sessions in sync and automatically reconciling state across network disconnections.

---

## 2. Architecture & Data Flow

```text
Authoritative Domain Event (e.g., Comment / Reply / Resolve)
                     │
                     ▼
        Notification Dispatch Boundary
                     │
                     ▼
            NotificationService
       ├── Recipient Resolution & Deduplication
       ├── Actor & Self-Mention Exclusion
       ├── Idempotency Protection
       │
       ▼
     NotificationRepository
       │
       ▼
  MongoDB (notifications collection)
       │
       ▼ (Authoritative persistence succeeds)
    Socket.IO Real-time Delivery (user:{userId} private room)
       │
       ▼
   Frontend Socket Listener (useNotificationSocket)
       │
       ▼
  Zustand Notification Store (useNotificationStore)
       │
       ▼
  Notification UI (NotificationBell, Badge, Panel, List, Item)
```

---

## 3. Domain Boundaries

The Notification domain is strictly decoupled from the Comment, Board, and Workspace domains:
- **Dedicated Domain & Collection**: Located at `server/src/modules/notification`, persisting to the `notifications` MongoDB collection.
- **No Embedded Arrays**: Notifications are never stored as arrays in User, Workspace, Board, or Comment documents.
- **Comment Domain Independence**: `CommentService` does not contain notification business logic. It invokes the notification dispatch boundary (`notificationService.dispatch*`) only **after** an authoritative comment mutation has succeeded and committed.
- **Server Authority**: Clients cannot create arbitrary notifications. There is no `POST /notifications` endpoint for client-supplied creation.

---

## 4. Notification Types

The subsystem is built on an extensible enum `NotificationType`:
- `MENTION` (Implemented): When a collaborator is mentioned in a comment or reply.
- `COMMENT_REPLY` (Implemented): When a collaborator's comment thread receives a reply.
- `THREAD_ACTIVITY` (Implemented): When a thread is resolved or reopened by a collaborator.
- `BOARD_INVITATION` (Extensible domain type): For future board invitations.
- `WORKSPACE_INVITATION` (Extensible domain type): For future workspace invitations.
- `ASSIGNMENT` (Extensible domain type): For future task assignments.
- `SYSTEM` (Extensible domain type): For system-wide announcements.

---

## 5. Recipient Calculation & Deduplication Rules

### A. Mention Notifications
- **Authoritative Source**: Uses structured `comment.mentions[].userId` from Slice 32. Free-text parsing with regex is strictly prohibited.
- **Duplicate Mentions**: If `@Bob` is mentioned multiple times in the same comment, Bob receives exactly **one** notification.
- **Self-Mention Exclusion**: If an author mentions themselves (`@Author`), no notification is generated.
- **Recipient Deduplication**: Recipients are deduplicated into a unique `Set<string>`.

### B. Mention Edit Diffing
- When a comment is edited from `Alice` to `Alice + Bob`, only `Bob` receives a new mention notification.
- Diffing algorithm:
  ```ts
  const previousMentionUserIds = new Set(previousMentions.map(m => m.userId));
  const newTargetUserIds = currentMentionUserIds.filter(id => !previousMentionUserIds.has(id));
  ```
- Position shifts without user changes generate **zero** new notifications.

### C. Comment Reply Notifications
- **Thread Participants**: Defined as the root comment author + all previous reply authors in that thread.
- **Actor Exclusion**: The current reply author is excluded.
- **Mention Precedence**: Users explicitly @mentioned in the reply receive a `MENTION` notification instead of a redundant `COMMENT_REPLY` notification for the same event (1 notification per user per logical event).

### D. Thread Activity Notifications
- When a collaborator resolves or reopens a comment thread, thread participants (root author and previous reply authors) receive a `THREAD_ACTIVITY` notification.
- The resolving collaborator (actor) is excluded.

---

## 6. Persistence & MongoDB Schema

Notifications reside in the `notifications` collection with compound indexes optimized for querying, unread counting, and cursor pagination:

```ts
interface NotificationDocument {
  _id: ObjectId;
  recipientId: ObjectId;
  type: NotificationType;
  actorId: ObjectId;
  metadata: {
    workspaceId?: ObjectId | string;
    boardId?: ObjectId | string;
    canvasId?: ObjectId | string;
    commentId?: ObjectId | string;
    rootCommentId?: ObjectId | string;
    parentCommentId?: ObjectId | string;
    resolved?: boolean;
    [key: string]: unknown;
  };
  isRead: boolean;
  readAt: Date | null;
  idempotencyKey?: string | null;
  createdAt: Date;
  updatedAt: Date;
}
```

### MongoDB Indexes
1. `{ recipientId: 1, createdAt: -1 }`: Optimizes the full notification list and cursor pagination.
2. `{ recipientId: 1, isRead: 1, createdAt: -1 }`: Optimizes unread notification list filtering.
3. `{ recipientId: 1, isRead: 1 }`: Optimizes the real-time unread count aggregation (`countUnreadByRecipient`).
4. `{ idempotencyKey: 1 }`: Supports deterministic duplicate event prevention (sparse index).

---

## 7. REST API Endpoints

All endpoints require JWT authentication and operate strictly on the authenticated user's context (`req.user.userId`). Client-supplied recipient overrides (IDOR attacks) are strictly prevented.

| Method | Path | Description | Query / Body Params |
|---|---|---|---|
| `GET` | `/api/v1/notifications` | Paginated notification list | `limit` (1-100), `cursor` (ISO date), `unreadOnly` (boolean) |
| `GET` | `/api/v1/notifications/unread-count` | Authoritative unread count | None |
| `PATCH` | `/api/v1/notifications/:id/read` | Mark single notification as read | `:id` (valid MongoDB ObjectId) |
| `PATCH` | `/api/v1/notifications/read-all` | Mark all user notifications as read | None |

---

## 8. Real-Time Socket Delivery & Multi-Tab Synchronization

- **User-Specific Rooms**: Notifications are emitted exclusively to the private room `user:${userId}`. Notifications are never broadcast to public `board:{boardId}` rooms.
- **Persistence First**: MongoDB persistence is completed before emitting any socket event.
- **Events**:
  - `notification:new`: Emitted when a new notification is persisted (`{ notification, unreadCount }`).
  - `notification:read`: Emitted when a notification is marked read in any tab (`{ notificationId, readAt, unreadCount }`).
  - `notification:all-read`: Emitted when mark-all-read is executed (`{ readAt, unreadCount }`).
  - `notification:count-updated`: Emitted when unread count changes (`{ unreadCount }`).
- **Multi-Tab Synchronization**: When a user marks a notification as read in Tab A, the server emits `notification:read` to `user:${userId}`, updating Tab B and Tab C immediately.

---

## 9. Reconnect Recovery & Deduplication

- **Authoritative Recovery**: Socket.IO is treated as a delivery optimization, not the single source of truth.
- **On Reconnect**:
  1. The client catches the `connected` state change.
  2. The client fetches the authoritative unread count (`GET /api/v1/notifications/unread-count`).
  3. The client fetches the latest notifications (`GET /api/v1/notifications?limit=20`).
  4. The normalized Zustand store reconciles incoming items using `notification.id` as the primary key.
- **Race Condition Protection**: Incoming real-time events that arrive during a REST recovery fetch are merged cleanly by ID into the normalized `Record<string, Notification>` store without overwriting or dropping newer records.

---

## 10. Frontend Architecture & Components

- **Store**: `useNotificationStore` (`client/src/features/notifications/store/notification.store.ts`)
  - Normalized `notifications: Record<string, Notification>`.
  - Authoritative `unreadCount`.
  - State flags (`isOpen`, `filter`, `isLoading`, `hasMore`).
- **Hooks**:
  - `useNotifications`: Provides reactive filtered notifications, pagination (`fetchMore`), optimistic `markAsRead`, and `markAllAsRead`.
  - `useNotificationSocket`: Handles event subscription and reconnection state reconciliation.
- **UI Components**:
  - `NotificationBell`: Accessible bell trigger button with badge.
  - `NotificationBadge`: Unread badge with `99+` threshold.
  - `NotificationPanel`: Floating popover dropdown with header, unread filter, and mark all read button.
  - `NotificationList`: Scrollable list with filter tabs ("All" / "Unread"), empty/loading states, and cursor-based "Load more" pagination.
  - `NotificationItem`: Individual notification item with actor avatar/initials, structured type icon/message, relative timestamp, unread indicator, and direct canvas/comment navigation.

---

## 11. Verification & Test Summary

### Backend Tests
- `server/src/modules/notification/tests/notification.domain.test.ts` (Unit & repository tests)
- `server/src/modules/notification/tests/notification.service.test.ts` (Integration tests for mention diffing, self-mention exclusion, reply dispatch, thread activity)
- `server/src/modules/notification/tests/notification.api.test.ts` (REST API integration tests for authentication, IDOR protection, cursor pagination, read state)
- `server/src/modules/comment/tests/*` (Full comment domain, service, and API regression suite)

### Frontend Tests
- `client/src/features/notifications/__tests__/notification.store.test.ts` (Zustand store operations, normalization, unread count tracking, deduplication)
- `client/src/features/notifications/__tests__/notification.components.test.ts` (Component helpers, initials parsing, badge thresholds, navigation target generation, sorting)
- 50 test files passed (489 tests total across client test suite).

### Production Builds
- `server`: `tsc` completed with 0 errors.
- `client`: `tsc -b && vite build` completed with 0 errors.
- `git diff --check`: 0 whitespace or formatting issues.

---

## 12. Future Improvements
- **Redis Pub/Sub & Queues**: Background worker queue for high-volume notification fanout.
- **Email & Push Notifications**: Offline digest emails and Web Push API notifications.
- **User Preferences**: Per-user notification preferences (mute thread, disable email digests, mention-only mode).
- **Retention & Archival**: Background cron job to prune or archive notifications older than 90 days.
