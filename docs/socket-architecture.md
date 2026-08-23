# Socket Architecture

## 1. Purpose

CanvasFlow uses Socket.IO for real-time collaboration.

- **REST APIs** are responsible for initial workspace loading, authentication, and read-heavy views.
- **Socket.IO** is responsible for establishing real-time communication channels, authenticating sockets, managing board room collaboration lifecycles, broadcasting live canvas shape events, synchronizing collaborator cursors, synchronizing collaborator shape selections, managing collaborative shape soft-locks, and synchronizing rich shape mutations (Text Shapes & Sticky Notes).

---

## 2. Layered Architecture

The socket layer adheres strictly to the project's layered architectural pattern:

```text
Client (React + Konva + Zustand + SocketClientService)
       ↓
Socket.IO Transport & Middleware (Authentication)
       ↓
Socket Handlers (Transport validation, orchestration, room management)
       ↓
Domain Services & In-Memory Managers (BoardService, ShapeService, PresenceManager, ShapeLockManager)
       ↓
Repositories (BoardRepository, ShapeRepository, WorkspaceMemberRepository)
       ↓
MongoDB (Authoritative Persistence Layer)
```

No business logic or direct database queries exist inside socket servers, middlewares, or handlers.

---

## 3. Connection & Authentication Flow

```text
Client (SocketClientService)
    │
    │ (Handshake auth: { token: "Bearer <jwt>" })
    ▼
Socket Auth Middleware (socket.middleware.ts)
    │
    ├── 1. Read token from handshake auth or headers
    ├── 2. Verify token via verifyAccessToken() (JWT)
    ├── 3. Extract userId and role
    ├── 4. Attach socket.data.user = { userId, role }
    │
    ▼
Socket Server (socket.server.ts)
    │
    ├── Authenticated connection registered
    ├── registerBoardHandlers(socket)
    ├── registerShapeHandlers(socket)
    ├── registerCursorHandlers(socket)
    ├── registerSelectionHandlers(socket)
    └── registerLockHandlers(socket)
```

- **Zero Client Identity Trust**: Client payloads cannot provide or forge `userId` or `role`. The server extracts user identity exclusively from the verified JWT in `socket.data.user`.

---

## 4. Board Room Lifecycle (Slice 2)

Users collaborate through board-specific Socket.IO rooms formatted deterministically via `getBoardRoom(boardId)` (`board:<boardId>`).

### A. Board Access Authorization (`authorizeBoardAccess`)

Before a socket joins a board room or receives canvas data, the domain service verifies access permissions:

1. **Board Existence**: Verifies the board exists and `isArchived` is false (returns 404 if missing).
2. **Creator Access**: If `board.createdBy.equals(userId)` → Access Granted.
3. **Public Board**: If `board.visibility === "PUBLIC"` → Access Granted.
4. **Workspace Verification**:
   - Finds associated workspace (returns 404 if workspace missing).
   - If `workspace.ownerId.equals(userId)` → Access Granted.
   - If `workspace.visibility === "PUBLIC"` → Access Granted.
   - If user is an active workspace member in `WorkspaceMemberModel` → Access Granted.
5. **Unauthorized Access**: If none match, throws `ApiError(HttpStatus.FORBIDDEN)` (returns 403 error ack).

### B. Board Join Flow (`board:join`)

```text
Client                              Server
  │                                    │
  ├─── board:join { boardId } ────────►│
  │                                    ├── 1. Validate payload & ObjectId format
  │                                    ├── 2. boardService.authorizeBoardAccess()
  │                                    ├── 3. Resolve canvas (specified or default Page 1)
  │                                    ├── 4. shapeService.getCanvasShapes()
  │                                    ├── 5. ShapeMapper.toResponseDto()
  │                                    ├── 6. socket.join("board:<boardId>")
  │                                    ├── 7. presenceManager.joinBoard()
  │                                    │
  │◄── canvas:sync { canvasId, shapes }┤ (Sent ONLY to joining socket)
  │                                    │
  │                                    ├── 8. Broadcast user:joined to OTHER room members
  │◄── Ack { success: true, data } ────┤
```

### C. Board Leave Flow (`board:leave`)

```text
Client                              Server
  │                                    │
  ├─── board:leave { boardId } ───────►│
  │                                    ├── 1. socket.leave("board:<boardId>")
  │                                    ├── 2. presenceManager.leaveBoard()
  │                                    ├── 3. If last socket for user:
  │                                    │        Broadcast user:left to room
  │◄── Ack { success: true } ──────────┤
```

---

## 5. Shape Synchronization (Slice 3)

Real-time shape manipulation uses authoritative backend synchronization over Socket.IO.

```text
User A (Initiator)                   Backend Authoritative Server             User B (Collaborator)
       │                                         │                                      │
       ├─── 1. Local action (draw/move/resize)  │                                      │
       ├─── 2. Update local Zustand store        │                                      │
       │       (records undo snapshot)           │                                      │
       │                                         │                                      │
       ├─── 3. Emit shape:create/update/delete ─►│                                      │
       │                                         ├── 4. Validate transport payload     │
       │                                         ├── 5. Derive canvasId & boardId       │
       │                                         ├── 6. Authorize board access          │
       │                                         ├── 7. Verify socket room membership   │
       │                                         ├── 8. ShapeService persistence in DB │
       │                                         ├── 9. ShapeMapper.toResponseDto()     │
       │                                         │                                      │
       │◄── 10. Ack { success: true, data } ─────┤                                      │
       │                                         ├── 11. Broadcast to room (excludes A)►│
       │                                         │   (shape:created/updated/deleted)    ├── 12. useCanvasSocket catches event
       │                                         │                                      └── 13. applyRemoteShape* (NO undo snapshot)
```

---

## 6. Live Collaborator Cursor Synchronization (Slice 4)

Live cursor synchronization allows active collaborators on the same board to see each other's mouse movements in real time.

```text
User A (Moving Mouse)                         Server                              User B (Collaborator)
       │                                         │                                         │
       ├─── 1. pointermove on Stage              │                                         │
       ├─── 2. screenToWorld(pointer)            │                                         │
       ├─── 3. Throttle (~30 fps / 33ms)         │                                         │
       │                                         │                                         │
       ├─── 4. socket.emit("cursor:move") ──────►│                                         │
       │       { boardId, x, y }                 ├── 5. Zod schema validation              │
       │                                         ├── 6. Extract socket.data.user.userId    │
       │                                         ├── 7. Verify room membership             │
       │                                         │                                         │
       │                                         ├── 8. socket.to(boardRoom).emit() ──────►│
       │                                         │      ("cursor:moved", { userId, ... })  ├── 9. useCanvasSocket catches
       │                                         │                                         ├── 10. setRemoteCursor(payload)
       │                                         │                                         └── 11. Render CollaboratorCursor
```

---

## 7. Live Collaborator Selection Synchronization (Slice 5)

Live selection synchronization allows collaborators on the same board to see which shapes other collaborators currently have selected.

```text
User A (Selects Shape locally)                Server (Authoritative Transport)           User B (Collaborator)
       │                                                     │                                      │
       ├── 1. Updates selectedShapeIds in Zustand            │                                      │
       ├── 2. Broadcast effect detects selection change      │                                      │
       │                                                     │                                      │
       ├── 3. socket.emit("selection:change") ──────────────►│                                      │
       │      { boardId, shapeIds }                          ├── 4. Zod schema validation           │
       │                                                     ├── 5. Extract socket.data.user.userId │
       │                                                     ├── 6. Verify board room membership    │
       │                                                     ├── 7. Verify shapes belong to board   │
       │                                                     │                                      │
       │                                                     ├── 8. Broadcast to room (excludes A) ─►│
       │                                                     │   ("selection:changed")              ├── 9. useCanvasSocket catches event
       │                                                     │                                      ├── 10. setRemoteSelection(payload)
       │                                                     │                                      └── 11. CollaboratorSelection renders
```

---

## 8. Collaborative Selection Conflict Resolution & Soft-Locking (Slice 6)

### Soft-Lock Rationale
When multiple collaborators view a shared whiteboard, concurrent edits on the same shape lead to visual jumping and race conditions in document persistence.

- **Hard-Locking (Anti-Pattern)**: Completely restricts multiple users from selecting, reading, or inspecting a shape, ruining whiteboard fluidity.
- **Soft-Locking (CanvasFlow Pattern)**: Multiple users may freely select the same shape. However, the instant User A begins actively transforming or editing a shape, User A acquires an exclusive, ephemeral **soft-lock**. Peer collaborators see a non-blocking "User A editing" lock badge and cannot transform or edit that specific shape until released.

```text
User A (Starts Drag/Transform/Edit)              Server (Authoritative Lock Layer)            User B (Peer Collaborator)
       │                                                       │                                         │
       ├── 1. onDragStart / onDoubleClick                      │                                         │
       ├── 2. socketClientService.lockShape(boardId, shapeId) ─►│                                         │
       │                                                       ├── 3. Zod validation                     │
       │                                                       ├── 4. Verify board room membership       │
       │                                                       ├── 5. Verify shape belongs to board      │
       │                                                       ├── 6. shapeLockManager.acquireLock()     │
       │                                                       │                                         │
       │◄── 7. Ack { success: true, data: { ... } } ───────────┤                                         │
       │                                                       ├── 8. Broadcast to room (excludes A) ───►│
       │                                                       │   ("shape:locked", { shapeId, ... })    ├── 9. useCanvasSocket catches
       │                                                       │                                         ├── 10. setRemoteShapeLock()
       │                                                       │                                         └── 11. CollaboratorShapeLock renders
       │                                                       │                                         │
       ├── 12. Finishes editing / dragging (onBlur / onDragEnd)│                                         │
       ├── 13. socketClientService.updateShape(...)            │                                         │
       ├── 14. socketClientService.unlockShape(...) ──────────►│                                         │
       │                                                       ├── 15. shapeLockManager.releaseLock()    │
       │◄── 16. Ack { success: true } ─────────────────────────┤                                         │
       │                                                       ├── 17. Broadcast to room (excludes A) ──►│
       │                                                       │   ("shape:unlocked", { shapeId })       ├── 18. removeRemoteShapeLock()
       │                                                       │                                         └── 19. CollaboratorShapeLock unmounts
```

---

## 9. Real-Time Text Shapes & Sticky Notes (Slice 7)

### Discriminated Union Shape Model
CanvasFlow enforces a strict TypeScript discriminated union across backend entities, DTOs, mappers, and frontend Zustand state:

```typescript
type Shape =
  | RectangleShape
  | TextShape
  | StickyNoteShape;
```

Each shape type defines its unique visual attributes while sharing fundamental canvas geometry (`id`, `x`, `y`, `width`, `height`, `rotation`, `opacity`, `zIndex`).

### Inline HTML Overlay Text Editing Architecture
Konva `<Text>` is rendered on an HTML5 `<canvas>` element and does not support native text carets, spellchecking, or multi-line selection.

When a user double-clicks or triggers text editing:
1. **Soft-Lock Acquisition**: Client emits `shape:lock`. If rejected (`SHAPE_LOCKED`), editing is prevented and a non-blocking toast alerts the user.
2. **Projected HTML `<textarea>`**: If lock succeeds, an `<InlineTextEditor>` is mounted directly over the shape.
3. **Screen Projection Math**:
   ```typescript
   screenX = shape.x * zoom + pan.x;
   screenY = shape.y * zoom + pan.y;
   screenWidth = shape.width * zoom;
   screenHeight = shape.height * zoom;
   screenFontSize = shape.fontSize * zoom;
   ```
4. **Lock Heartbeat**: During long drafting sessions, a 1500ms interval calls `refreshShapeLock(boardId, shapeId)` to prevent the 10-second safety timeout from prematurely releasing the lock.
5. **Idempotent Commit / Cancel**:
   - `Blur` / `Ctrl+Enter`: Calls `onCommit()`, emits `shape:update`, emits `shape:unlock`, unmounts overlay.
   - `Escape`: Reverts changes, emits `shape:unlock`, unmounts overlay.

### Architectural Decision: Local Editing + Commit vs. Keystroke Synchronization
**Why CanvasFlow does NOT synchronize every keystroke to MongoDB:**
- Typing at 60 words per minute across 10 collaborators generates ~300 write operations per minute per user.
- Emitting every keystroke through MongoDB causes severe database write amplification, oplog saturation, lock contention, and network churn.
- **CanvasFlow Solution**: Keystrokes remain local to the active client. The shape soft-lock guarantees zero collisions. When editing concludes, the authoritative final text is committed in a single, atomic `shape:update` transaction.
- **Future Roadmap**: Character-level collaborative editing (Google Docs style) will introduce CRDTs (e.g. Yjs / Automerge) over WebSockets without persisting intermediary keystrokes to MongoDB.

---

## 10. Remote State & Undo/Redo Isolation

To prevent infinite feedback loops and avoid polluting local undo/redo history:
- **Local User Actions**: Mutate Zustand store via `addShape`, `moveSelectedShapes`, `updateShapeTransform`, `updateShapeText`, or `deleteShape`, which append snapshots to `past` and clear `future`.
- **Remote Collaborator Actions**: Dispatched via dedicated remote store actions:
  - `applyRemoteShapeCreated(shape)`
  - `applyRemoteShapeUpdated(shape)`
  - `applyRemoteShapeDeleted(shapeId)`
  - `setRemoteCursor(cursor)`
  - `removeRemoteCursor(userId)`
  - `clearRemoteCursors()`
  - `setRemoteSelection(selection)`
  - `removeRemoteSelection(userId)`
  - `clearRemoteSelections()`
  - `setRemoteShapeLock(lock)`
  - `removeRemoteShapeLock(shapeId)`
  - `clearRemoteShapeLocks()`
- **Isolation Guarantee**: Remote actions update presentation states directly without touching `past` or `future` stacks and without re-emitting socket events.

---

## 11. Sender Exclusion

Socket broadcasts use `socket.to(getBoardRoom(boardId)).emit(...)` rather than `io.to(...).emit(...)`.
- The originating client is acknowledged directly via the Socket.IO acknowledgement callback (or skipped for ephemeral events like cursors).
- The originating client never receives its own broadcast, preventing redundant UI re-renders, self-echo, and transformation jumping.

---

## 12. In-Memory Presence & Multi-Tab Model

`PresenceManager` tracks active connections in memory without writing temporary presence state to MongoDB.

### Data Structure:
- `boards`: `Map<boardId, Map<socketId, SocketUser>>`
- `socketBoards`: `Map<socketId, boardId>`

### Multi-Tab Departure Handling:
A user may open multiple tabs (multiple socket connections) for the same board:
- When Tab 1 closes, `leaveBoard` checks if the user has other active sockets in that board.
- If remaining sockets exist, `isLastSocketForUser` is `false`, and no `user:left` event is broadcast.
- When the user's final tab disconnects or leaves, `isLastSocketForUser` is `true`, and `user:left` is broadcast to remaining collaborators.
- `getActiveUsers(boardId)` automatically deduplicates sockets by user ID.

---

## 13. Disconnect Cleanup

When a network drop, page refresh, or tab closure triggers Socket.IO `disconnect`:
1. `socket.server.ts` catches `SocketEvents.DISCONNECT`.
2. Releases all shape locks held by the socket via `shapeLockManager.releaseSocketLocks(socket.id)` and broadcasts `shape:unlocked` for each released lock.
3. Calls `presenceManager.removeSocket(socket.id)`.
4. If the socket was in an active board and was the user's last connection, broadcasts `user:left` with updated `activeUsers` to the board room.
5. Cleans up in-memory mappings cleanly without throwing unhandled exceptions.

---

## 14. Supported Events

| Client → Server | Server → Client | Description | Frequency | Persistence |
|---|---|---|---|---|
| `board:join` | `canvas:sync` | Validates access, joins room, delivers initial canonical shapes | On load | None |
| `board:leave` | `user:joined` | Leaves room, updates presence, notifies remaining collaborators | On exit | None |
| `shape:create` | `shape:created` | Authoritative shape creation broadcast (Rectangle, Text, Sticky) | Low | MongoDB |
| `shape:update` | `shape:updated` | Authoritative shape transform/position/text update broadcast | Low/Med | MongoDB |
| `shape:delete` | `shape:deleted` | Authoritative shape deletion broadcast | Low | MongoDB |
| `cursor:move` | `cursor:moved` | Live collaborator cursor synchronization | High (~30/s) | None (Ephemeral) |
| `selection:change` | `selection:changed` | Live collaborator shape selection synchronization | On change | None (Ephemeral) |
| `shape:lock` | `shape:locked` | Exclusive soft-lock acquisition before shape editing/transform | On edit start | None (Ephemeral) |
| `shape:unlock` | `shape:unlocked` | Release shape soft-lock after editing/transform completes | On edit end | None (Ephemeral) |
| `shape:lock-refresh` | | Extend soft-lock timeout heartbeat during active editing | ~1.5s during edit | None (Ephemeral) |
| `shape:transforming` | `shape:transforming` | Live ephemeral transform streaming (30–60 FPS) during drag/resize/rotate | High (~30-60/s) | None (Ephemeral) |
| `shape:transform-end` | `shape:transform-end` | Transform completion notification to peer collaborators | On transform end | None (Ephemeral) |
| | `user:left` | User departure notification | On exit | None |
| | `error` | Error notifications and status | On failure | None |

---

## 15. Real-Time Shape Transform Streaming (Slice 8)

### Architecture Overview

When a user drags, resizes, or rotates a shape, collaborators observe the transformation live at 30–60 FPS without overloading the database.

```text
LOCAL POINTER / TRANSFORM
         ↓ (requestAnimationFrame)
  SocketClientService.transformShape()
         ↓ (shape:transforming)
    Socket.IO Server
         ↓ (lock ownership check & broadcast)
  socket.to(boardRoom).emit(shape:transforming)
         ↓
  REMOTE COLLABORATORS (setRemoteShapeTransform)
         ↓
  ShapeRenderer (effectiveTransform)
```

### Key Engineering Principles:

1. **Zero Database Write Amplification**:
   - Intermediate transform frames are purely in-memory and ephemeral.
   - Only the final position/dimension is persisted to MongoDB via `shape:update` upon mouse release / transform end.
2. **Soft-Lock Ownership Verification**:
   - The server verifies `shapeLockManager.getLock(boardId, shapeId)?.socketId === socket.id` before broadcasting `shape:transforming`. Non-owners cannot stream transforms.
3. **Undo/Redo Stack Purity**:
   - Remote transforms only update `remoteShapeTransforms` in Zustand, completely isolated from `past` and `future` stacks.
   - Local user produces exactly **one** undo snapshot per drag/transform operation upon release.
4. **Effective Transform Rendering**:
   - Renderers compute `effectiveTransform = (isLockedByOther && remoteShapeTransforms[shape.id]) ?? shape`.
   - Outlines and lock badges follow `effectiveTransform` in real time.
5. **Stale Transform Garbage Collection**:
   - Stale transforms older than 3000ms are automatically purged every 1000ms.
   - Transforms are also cleaned up on `shape:unlocked`, `shape:updated`, `shape:deleted`, and `user:left`.

---

## 17. Real-Time Comments & Collaborative Annotations (Slice 9)

Collaborative annotations introduce persistent discussion threads attached to either the **canvas** (`shapeId: null`) or a **specific shape** (`shapeId: "<shapeId>"`).

### A. Architectural Principles & Invariants:
1. **Durable Persistence & Threading**:
   - Comments are persisted in MongoDB in `comments` collection with compound indexes (`{ boardId: 1, createdAt: -1 }`, `{ boardId: 1, shapeId: 1 }`, `{ parentCommentId: 1 }`).
   - Threading is strictly 1-level (root comment $\rightarrow$ replies). Reply-to-reply nesting is rejected at domain service level.
2. **Author Identity Enforcement**:
   - `authorId` is strictly extracted from verified session JWT (`socket.data.user.userId` / `req.user.userId`).
   - Sockets cannot spoof author identity or edit/delete comments authored by others.
3. **Soft-Deletion Model**:
   - When a comment is deleted, its record remains in MongoDB with `isDeleted: true`, `deletedAt: Date`, and `content: ""`.
   - Replies to deleted comments remain preserved and readable. Soft-deleted comments cannot be edited or replied to.
4. **Shape Deletion Decoupling**:
   - When a shape is deleted, attached comments are not deleted. Their `shapeId` is gracefully nullified (`shapeId: null`), converting them into canvas-level comments.
5. **Undo/Redo History Isolation**:
   - Comments live in an independent Zustand store (`useCommentStore`) and React Query cache.
   - Comment actions (create, reply, edit, delete, resolve) **never** enter the canvas undo/redo stack (`past` / `future`).

### B. Comment Socket Event Lifecycles:

```text
1. COMMENT_CREATE (comment:create)
   Client ──► Server (validates Zod schema, checks board access)
            ├── commentRepository.create()
            ├── CommentMapper.toResponseDto()
            ├── socket.to(boardRoom).emit("comment:created", dto)
            └── ack({ success: true, data: dto })

2. COMMENT_UPDATE (comment:update)
   Client ──► Server (author equality check, soft-delete lockout)
            ├── commentRepository.updateById() (sets isEdited: true)
            ├── socket.to(boardRoom).emit("comment:updated", dto)
            └── ack({ success: true, data: dto })

3. COMMENT_RESOLVE (comment:resolve)
   Client ──► Server (checks board access, updates isResolved)
            ├── socket.to(boardRoom).emit("comment:resolved", dto)
            └── ack({ success: true, data: dto })

4. COMMENT_DELETE (comment:delete)
   Client ──► Server (author equality or board creator check)
            ├── commentRepository.softDeleteById()
            ├── socket.to(boardRoom).emit("comment:deleted", { boardId, commentId })
            └── ack({ success: true, data: dto })
```

---

## 18. Slice 10 — Real-Time Reconnection & Authoritative Board State Recovery

### A. Architectural Principles

When network drops, tab sleep, or mobile backgrounding breaks a WebSocket connection, systems must recover seamlessly without state corruption or stale collaboration artifacts.

1. **State Categorization & Recovery Boundaries**:
   - **Authoritative State** (Boards, Canvases, Shapes, Comments): Persisted in MongoDB; recovered cleanly via authoritative REST hydration.
   - **Ephemeral Collaboration State** (Presence, Cursors, Selections, Shape Locks, Live Transforms): Exists in-memory during active connections; wiped on disconnect and reconstructed fresh from server snapshot.
   - **Undo/Redo History Isolation**: Recovery replaces stale store state atomically (`replaceShapesFromRecovery`) without pushing snapshots into `past` or wiping `future`. Recovery is never treated as a local undoable user action.

2. **Race Condition Prevention**:
   - **Single-Flight Mutex (`isRecoveringRef`)**: Prevents rapid connection churn or retry bursts from triggering concurrent overlapping hydration flights.
   - **Generation Counter Token (`recoveryGenerationRef`)**: Every recovery cycle increments a monotonic integer token. If a subsequent recovery initiates while a slow API request is in-flight, the stale response from the superseded recovery is silently discarded upon arrival.

3. **Multi-Tab Session Isolation**:
   - Tab-specific socket IDs join board rooms and register in `PresenceManager`.
   - When Tab 1 disconnects and reconnects, other active tabs for the same user remain undisturbed, and room presence deduplication guarantees zero phantom user drops.

### B. Recovery Event Lifecycle:

```text
1. Network / Tab Reconnection Event
   Client: socket.on("connect") fires after disconnect
   Client ──► Sets status = "recovering"
             ├── Wipes local ephemeral state (remoteCursors, remoteSelections, remoteShapeLocks, remoteShapeTransforms)
             ├── Emits "board:recovery-request" { boardId }
             ├── Fetches GET /api/v1/shapes/canvas/:canvasId
             └── Fetches GET /api/v1/comments/board/:boardId

2. Server Processing:
   Server ──► Validates boardId (Zod hex ObjectId)
            ├── Authorizes board access (boardService.authorizeBoardAccess)
            ├── Idempotently joins socket.join(getBoardRoom(boardId))
            ├── Updates PresenceManager: presenceManager.joinBoard(boardId, socket.id, user)
            ├── Broadcasts "user:joined" if first active socket for user
            └── Returns ack({ success: true, data: { boardId, recoveredAt, presence: { activeUsers } } })

3. Client Store Hydration:
   Client ──► Verifies generation token
            ├── useCanvasStore.replaceShapesFromRecovery(authoritativeShapes)
            ├── useCommentStore.setComments(authoritativeComments)
            ├── queryClient.invalidateQueries(["boards", boardId, "comments"])
            └── Sets status = "recovered" (transitions to "idle" after 2.5s)
```

---

## 19. Security & Hardening

1. **Authentication**: All connections require a valid JWT access token verified against `JWT_ACCESS_SECRET`.
2. **Authorization Boundary**: Board access authorization is verified server-side through `boardService.authorizeBoardAccess` before room entry, recovery, or data sync.
3. **Persisted Boundary Resolution**: Sockets cannot supply arbitrary `boardId` or `userId` values; the server derives `boardId` strictly from `Shape` → `Canvas` → `Board`.
4. **Room Membership Enforcement**: Shape, cursor, selection, lock, and comment handlers verify `socket.rooms.has(getBoardRoom(boardId))` before allowing actions.
5. **Shape Ownership Verification**: For selection and lock requests, `shapeService.verifyShapesBelongToBoard` guarantees foreign shapes cannot be locked or selected across boards.
6. **Payload Bounds & Validation**: Zod validates all shape properties (`text` length $\le 5000$, `fontSize` 8–200, valid text alignment, finite coordinates), comment payloads (`content` 1–2000 chars), and recovery requests (`boardId` 24-char ObjectId).
7. **DTO Sanitization**: Raw Mongoose model instances are never broadcast over sockets; all entities pass through DTO mappers (`ShapeMapper`, `CommentMapper`) with soft-delete masking.

---

## 20. Interview Concepts

### 1. Discriminated Unions in Real-Time Systems
Using a literal discriminator field (`type: "rectangle" | "text" | "sticky_note"`) enables TypeScript to perform exhaustive pattern matching and type narrowing. This eliminates optional-property soup and ensures component renderers receive guaranteed, non-null properties for specific shape types.

### 2. Ephemeral vs. Durable Collaboration State
- **Durable State**: Shapes, text content, colors, z-indexes, board settings, comment threads. Persisted authoritatively in MongoDB.
- **Ephemeral State**: Cursor coordinates, shape selections, soft-locks, heartbeat refresh timers. Managed in-memory to prevent database write amplification.

### 3. State Invalidation vs. Event Replay during Recovery
Attempting to recover state by replaying a buffer of missed Socket.IO events introduces severe consistency and ordering hazards (race conditions, dropped events, split-brain). The robust industry standard (used by Figma and Google Docs) is to fetch the current authoritative snapshot from durable persistence, atomically replace canonical state, and rebuild transient presence from live in-memory managers.

### 4. Generation Token Pattern for Out-of-Order Async Responses
When network conditions fluctuate rapidly, multiple asynchronous recovery cycles may be dispatched. By tagging each recovery invocation with a monotonically increasing integer (`recoveryGeneration`), late-arriving responses from superseded requests are discarded, preventing stale data from overwriting newer snapshots.

### 5. Screen vs. World Coordinate Projection
- **World Space**: The invariant infinite canvas coordinates where a shape lives at `(x, y)`.
- **Screen Space**: The pixel position on the viewport computed via `screenX = worldX * zoom + pan.x`. HTML overlays like `<InlineTextEditor>`, `<CommentBadge>`, and `<RecoveryStatusIndicator>` dynamically compute screen projections so editing controls match the visual canvas perfectly during pan and zoom.

### 6. Decoupled Persistence & Soft-Deletion Cascades
In collaborative systems, hard-deleting records or cascading deletes can destroy contextual collaborator discussions. By adopting a soft-delete model with masked content on comments and a foreign-key nullification lifecycle (`shapeId: null` on shape deletion), the collaborative history remains resilient without orphaned dangling references.

---

## 21. Real-Time Collaboration Ordering, Versioning & Reliability (Slice 11)

### Architectural Architecture

```text
       Authoritative Mutation
                  │
                  ▼
   Validate Zod & Authorize Access
                  │
                  ▼
CollaborationVersionService.executeWithRevision
                  │
      ┌───────────┴───────────┐
      │  MongoDB Transaction  │
      │  ├── Persist Mutation │
      │  └── $inc Board.collaborationRevision
      │  Commit Transaction   │
      └───────────┬───────────┘
                  │
                  ▼
  CollaborationEventMeta Construction
  ├── eventId: crypto.randomUUID()
  ├── boardId: boardObjectId.toString()
  ├── actorId: user.userId.toString()
  ├── socketId: socket.id
  ├── revision: updatedBoard.collaborationRevision
  └── occurredAt: ISO timestamp
                  │
                  ▼
  Socket.IO Broadcast Envelope
  ├── shape:created  -> { meta, shape }
  ├── shape:updated  -> { meta, shape }
  ├── shape:deleted  -> { meta, shapeId }
  ├── comment:created -> { meta, comment }
  ├── comment:updated -> { meta, comment }
  └── comment:resolved -> { meta, comment }
                  │
                  ▼
           Client Receiver
                  │
      ┌───────────┴───────────┐
      │  checkEventFreshness  │
      └───────────┬───────────┘
                  │
     ┌────────────┼────────────┐
     ▼            ▼            ▼
  incoming     incoming     incoming
  <= current   === curr + 1 > curr + 1
     │            │            │
     ▼            ▼            ▼
  "ignore"     "apply"       "gap"
  (drop stale) (apply state) (trigger Slice 10 recovery)
```

### 1. Authoritative Monotonic Board Revision
- Every `Board` document maintains an integer `collaborationRevision: { type: Number, default: 0, min: 0 }`.
- Only **authoritative mutations** that persist into MongoDB (Shapes and Comments) increment `collaborationRevision`.
- Ephemeral mutations (Presence, Cursors, Selections, Live transforms, Soft-locks) **never** increment `collaborationRevision`.

### 2. Transaction Atomicity & Write Conflict Retry
- Mutation persistence and `$inc: { collaborationRevision: 1 }` execute together inside a MongoDB `ClientSession` transaction.
- If concurrent mutations contend on the same `Board` document, `CollaborationVersionService` intercepts `TransientTransactionError` / `WriteConflict` and applies automatic exponential backoff retries (up to 5 attempts).
- An event is **never** broadcast if mutation persistence fails.

### 3. Server-Generated Event Envelopes
Every versioned socket event wraps its payload with an authoritative metadata block:
```typescript
export type CollaborationEventMeta = {
  eventId: string;     // Unique UUID generated server-side
  boardId: string;     // Canonical board identifier
  actorId: string;     // Authenticated user ID who performed mutation
  socketId: string;    // Originating socket ID
  revision: number;    // Monotonically increasing board revision integer
  occurredAt: string;  // ISO 8601 server timestamp
};
```

### 4. Client Freshness State Machine
Client components and hooks (`useCanvasSocket`, `useCommentSocket`) route incoming events through `useCollaborationStore.checkEventFreshness(boardId, meta.revision)`:
1. **Stale or Duplicate (`incoming <= currentRevision`)**: Discarded silently. Protects against out-of-order delivery, slow networks, and post-reconnection message echoes.
2. **Sequential Next (`incoming === currentRevision + 1` or `currentRevision === 0`)**: Applied directly to the canvas/comment store, advancing `currentRevision`.
3. **Gap Detected (`incoming > currentRevision + 1`)**: Indicates one or more intermediate mutations were dropped or missed. Automatically triggers authoritative snapshot recovery via `useBoardRecovery(boardId, canvasId)`.

### 5. Concept Disambiguation: Epoch vs. Revision vs. Generation
| Concept | Scope | Source | Purpose |
| :--- | :--- | :--- | :--- |
| **`connectionEpoch`** | Ephemeral Connection | Client Socket.IO | Tracks "Which socket connection session am I currently in?" Incremented on every socket `connect`. |
| **`collaborationRevision`**| Authoritative Board State | Server MongoDB | Tracks "Which durable board mutation state am I seeing?" Monotonically incremented per board mutation. |
| **`recoveryGeneration`** | Async Recovery Cycle | Client Recovery Hook | Tracks "Is this async REST hydration response still fresh?" Prevents slow recovery responses from overwriting newer snapshots. |

### 6. Undo/Redo Isolation Guarantees
- Monotonic revision checks, epoch updates, and recovery hydration execute in `useCollaborationStore` and dedicated remote store actions (`replaceShapesFromRecovery`, `applyRemoteShapeCreated`, `applyRemoteShapeUpdated`, `applyRemoteShapeDeleted`).
- Undo/redo stacks (`past` / `future` in `useCanvasStore`) are reserved strictly for local user edits, maintaining pristine edit histories across real-time collaboration.

---

## Slice 12: Concurrent Mutation Conflict Protection (Optimistic Concurrency Control)

Slice 12 introduces server-authoritative **Optimistic Concurrency Control (OCC)** for all durable whiteboard entities (`Shapes` and `Comments`).

### 1. The Concurrency Problem
While Slice 11 orders durable mutations globally across a board room (`collaborationRevision`), Slice 12 solves entity-level concurrent mutation races:
> *What happens when two collaborators read version 1 of an entity and concurrently attempt to update or delete it with different data?*

```text
                  Entity (Shape/Comment) [Version: 1]
                                  │
         ┌────────────────────────┴────────────────────────┐
         │                                                 │
   Client A: Update                                  Client B: Update
   expectedVersion: 1                                expectedVersion: 1
         │                                                 │
         ▼                                                 ▼
   [WINNER - FIRST]                                  [LOSER - CONFLICT]
   Version becomes 2                                 Predicate { version: 1 } fails
   Board revision incremented                        409 CONFLICT returned
   Broadcast sent to room                            Transaction aborted
                                                     Zero revision increment
                                                     Zero broadcast
                                                     Triggers Slice 10 recovery
```

### 2. Multi-Tier Concurrency Architecture
CanvasFlow cleanly separates three distinct versioning and concurrency controls:

| Control | Scope | Source | Persistence | Role |
| :--- | :--- | :--- | :--- | :--- |
| **`Shape.version` / `Comment.version`** | Entity Lifecycle | Server MongoDB | Persisted on Entity (`min: 1`) | **Optimistic Concurrency Control (OCC)**. Validates that the client's write was based on the latest entity state. |
| **`collaborationRevision`** | Board Room | Server MongoDB | Persisted on Board (`min: 0`) | **Global Event Ordering & Gap Detection**. Enforces causal event ordering and stale event rejection across room. |
| **`shapeLocks`** | Collaborative Interaction | Server Memory | Ephemeral in-memory | **UX Conflict Avoidance**. Prevents visual fighting during active drag/resize or text edit sessions. |

> **Key Rule**: Ephemeral soft-locks are a UX optimization, NOT a database concurrency guarantee. OCC functions reliably even if a shape is unlocked or if lock heartbeats expire.

### 3. Atomic Compare-and-Modify Pattern
OCC checks are executed directly within MongoDB query predicates to prevent read-then-write race conditions:

```typescript
// Atomically match entity ID AND expected version, then increment version
const updated = await ShapeModel.findOneAndUpdate(
  {
    _id: shapeId,
    version: expectedVersion,
  },
  {
    $set: updateFields,
    $inc: { version: 1 },
  },
  { new: true, session }
);

if (!updated) {
  const existing = await ShapeModel.findById(shapeId, null, { session });
  if (!existing) {
    throw new ApiError(HttpStatus.NOT_FOUND, "Shape not found.");
  }
  // Mismatch detected -> trigger 409 Conflict
  throw new ConflictError("shape", shapeId.toString(), existing.version);
}
```

### 4. Structured Conflict Protocol
When an OCC predicate fails, the server responds with a structured 409 conflict acknowledgement:

```typescript
export type CollaborationConflictPayload = {
  code: "CONFLICT";
  resourceType: "shape" | "comment";
  resourceId: string;
  currentVersion: number;
  message?: string;
};
```

### 5. Zero-Pollution Semantics
When an OCC conflict occurs:
1. **Zero Entity Mutation**: The loser's modifications are completely discarded.
2. **Zero Version Increment**: Entity version is not modified by the failed attempt.
3. **Zero Board Revision Increment**: The MongoDB transaction aborts, ensuring `collaborationRevision` is not consumed.
4. **Zero Broadcast**: No socket events (`shape:updated`, `comment:updated`, etc.) are broadcast to peer clients.
5. **Zero History Pollution**: The loser's local undo/redo stack is not corrupted.
6. **Automatic Recovery**: The conflicting client handles the 409 conflict by querying authoritative state via Slice 10 recovery (`useBoardRecovery`), synchronizing to the winner's version, and presenting fresh state to the user.

---

## Senior Engineering Interview Questions & Deep Architecture Guide

### Q1: Why do we maintain both an entity-level `version` and a board-level `collaborationRevision`?
**Answer:**
They solve two fundamentally different distributed systems problems:
1. **Entity-level `version` (Optimistic Concurrency Control)**: Protects against write-after-write conflicts on a specific record (e.g. two users trying to change the background color of Shape #123 at the same time). It operates per entity, starting at `1` and incrementing on every mutation of that specific document.
2. **Board-level `collaborationRevision` (Global Event Ordering & Freshness)**: Enforces causal ordering across the entire board room. It enables peer clients to detect dropped socket messages (revision gaps) and discard stale out-of-order frames across all shape and comment mutations on that canvas.

If we only used board revision for OCC, updating Shape A would falsely conflict with a concurrent update to Shape B! If we only used entity version for ordering, clients could not detect missed events for newly created or deleted entities.

### Q2: Why is "find entity in JS -> compare version -> update entity" an anti-pattern in high-concurrency systems?
**Answer:**
This is the classic **Time-of-Check to Time-of-Use (TOCTOU)** race condition. If two requests execute the find query simultaneously:
1. Request A reads Version 1.
2. Request B reads Version 1.
3. Request A validates that version === 1, and issues an update writing Version 2.
4. Request B validates that its in-memory variable version === 1, and also issues an update writing Version 2 with its own data.

Request B silently overwrites Request A's changes (Lost Update Problem). By placing `{ _id: id, version: expectedVersion }` in the atomic MongoDB `findOneAndUpdate` predicate with `$inc: { version: 1 }`, the database engine's row-level lock guarantees that only the first write matches and executes. The second write finds 0 matching documents and is rejected.

### Q3: How does CanvasFlow handle database write conflicts when running in a replica set vs standalone MongoDB?
**Answer:**
In `CollaborationVersionService.executeWithRevision`, transactions are used when MongoDB runs with replica set support enabled. If two transactions attempt to update the same board document concurrently, MongoDB raises a `WriteConflict` / `TransientTransactionError`.
`CollaborationVersionService` wraps the transaction in an automatic exponential backoff retry loop (up to 5 attempts).
If MongoDB is operating in standalone mode (where replica set transactions are unsupported), the service seamlessly falls back to direct execution without breaking functionality, ensuring zero developer friction in local development while maintaining transaction isolation in production clusters.

### Q4: If an OCC conflict occurs inside a transaction, how do we guarantee zero state pollution?
**Answer:**
When an OCC predicate fails, the repository returns `null`, and the service immediately throws a `ConflictError`. Because this error is thrown before the transaction commits, the transaction driver (`withTransaction`) aborts the entire transaction.
As a result:
- Any partial database writes in that session are rolled back.
- The `Board.collaborationRevision` increment is rolled back.
- The revision number is not consumed or skipped.
- The handler catches `ConflictError` before calling `socket.to(room).emit(...)`, guaranteeing no peer client receives a phantom socket event.

### Q5: How do ephemeral soft-locks differ from optimistic concurrency control?
**Answer:**
- **Soft-Locks**: An ephemeral in-memory lease (`ShapeLockManager`) acquired by a client when starting a drag/resize or opening an inline text editor. Its purpose is **collaborative UX**: preventing two users from visually fighting over the same element. Locks are stored in Redis/memory with TTLs and release on disconnect.
- **OCC**: A persistent, ACID-backed database constraint enforcing data integrity during state persistence. Even if a user bypasses the UI, loses their soft-lock due to a network stutter, or mutates an unlocked entity, OCC prevents lost updates at the database tier.

### Q6: What is the client-side recovery loop when an OCC 409 CONFLICT is received?
**Answer:**
1. The client mutation promise rejects with an error containing `{ code: 'CONFLICT', resourceType, resourceId, currentVersion }`.
2. The UI / collaboration store sets `lastConflict` to log the conflict event and suppress optimistic reconciliation errors.
3. The client calls `useBoardRecovery(boardId, canvasId)`.
4. `useBoardRecovery` fetches the authoritative snapshot via REST API (`/api/v1/boards/:boardId`), synchronizing all local shapes and comments to their latest server versions.
5. If the user desires, the mutation can be safely re-attempted using the newly acquired version (`recoveredShape.version`).

### Q7: Why must soft-deletions on comments also participate in OCC?
**Answer:**
Soft-deleting a comment modifies its state (`deletedAt`, `content` masked, `version` incremented). If User A soft-deletes a comment while User B concurrently edits its content:
1. If delete did not check `expectedVersion`, User A might delete a comment that User B just significantly updated or corrected.
2. Conversely, if User B's edit arrives after User A's delete, User B could un-delete or resurrect deleted content.
With OCC, whichever mutation reaches the database first increments the version; the second mutation is rejected with 409 CONFLICT and must re-hydrate before taking further action.

### Q8: Why is the `version` field initialized to `1` rather than `0` on creation?
**Answer:**
In JavaScript and TypeScript, `0` is falsy. If `version` is `0`, checks like `if (shape.version)` or DTO validations that verify positive integers (`z.number().int().min(1)`) require verbose explicit undefined checks. Initializing entities at version `1` upon creation provides clear semantic meaning: Version 1 represents the initial creation state, while Version $N$ represents the $N-1$-th update.

### Q9: How does CanvasFlow prevent undo/redo history corruption when an OCC conflict occurs?
**Answer:**
In `useCanvasStore`, local user actions push undo entries onto the `past` stack *only* upon successful local completion or with rollback handlers. When mutations are emitted over the socket, if the server returns a 409 CONFLICT, the rejected promise or error handler reverts the optimistic state change and triggers authoritative recovery without leaving ghost operations on the local undo stack. Remote operations never push to the local undo/redo stack.

### Q10: How does the combination of Slice 10 (Recovery), Slice 11 (Ordering), and Slice 12 (Conflict Protection) achieve end-to-end distributed consistency?
**Answer:**
The three slices form a layered consistency defense:
1. **Slice 10 (Transport Recovery)**: Restores socket connection, re-binds rooms, hydrates authoritative state, and resets ephemeral presence when networks drop.
2. **Slice 11 (Broadcast Freshness)**: Ensures that all peer-to-peer broadcasts are delivered with monotonic board revisions, dropping out-of-order or duplicate frames and detecting network packet gaps.
3. **Slice 12 (Storage OCC)**: Ensures that when multiple clients submit concurrent writes to the same record, only one atomic transaction succeeds, while conflicting writes fail cleanly with 409 CONFLICT and trigger authoritative state realignment.