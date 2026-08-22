# Socket Architecture

## 1. Purpose

CanvasFlow uses Socket.IO for real-time collaboration.

- **REST APIs** are responsible for initial workspace loading, authentication, and read-heavy views.
- **Socket.IO** is responsible for establishing real-time communication channels, authenticating sockets, managing board room collaboration lifecycles, broadcasting live canvas shape events, synchronizing collaborator cursors, synchronizing collaborator shape selections, and managing collaborative shape soft-locks.

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

### Problem & Soft-Lock Rationale
When multiple collaborators view a shared whiteboard, concurrent edits on the same shape (e.g. User A dragging while User B resizes) lead to visual jumping, conflicting mutations, and race conditions in document persistence.

- **Hard-Locking (Anti-Pattern)**: Completely restricts multiple users from selecting, reading, or inspecting a shape, which ruins the fluid feel of a modern whiteboard.
- **Soft-Locking (CanvasFlow Pattern)**: Multiple users may freely select the same shape. However, the instant User A begins actively transforming (dragging, resizing, rotating) a shape, User A acquires an exclusive, ephemeral **soft-lock**. Peer collaborators see a non-blocking "User A editing" lock badge with User A's collaborator color and cannot drag or transform that specific shape until the transformation ends.

```text
User A (Starts Drag/Transform)                   Server (Authoritative Lock Layer)            User B (Peer Collaborator)
       │                                                       │                                         │
       ├── 1. onDragStart / onTransformStart                   │                                         │
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
       ├── 12. Finishes drag/transform (onDragEnd)             │                                         │
       ├── 13. socketClientService.updateShape(...)            │                                         │
       ├── 14. socketClientService.unlockShape(...) ──────────►│                                         │
       │                                                       ├── 15. shapeLockManager.releaseLock()    │
       │◄── 16. Ack { success: true } ─────────────────────────┤                                         │
       │                                                       ├── 17. Broadcast to room (excludes A) ──►│
       │                                                       │   ("shape:unlocked", { shapeId })       ├── 18. removeRemoteShapeLock()
       │                                                       │                                         └── 19. CollaboratorShapeLock unmounts
```

### Key Principles of Soft-Locking:
1. **Ephemeral Collaboration State**: Locks exist strictly in server memory (`ShapeLockManager`) and client memory (`remoteShapeLocks`). They are **never written to MongoDB**, avoiding disk I/O bottlenecks.
2. **Single Owner & Concurrency Guarantees**: Acquisition decisions are executed synchronously within the Node.js event loop. If User A and User B request a lock simultaneously, exactly one request succeeds. The other receives a structured `SHAPE_LOCKED` error response and cancels the local drag immediately.
3. **Safety Timeout (`LOCK_TIMEOUT_MS = 10_000`)**: If a client crashes, drops connection silently, or halts mid-drag, stale locks automatically expire after 10 seconds.
4. **Socket-Owned Multi-Tab Isolation**: In multi-tab workflows, locks are owned by specific socket connections (`socketId`). If User A has Tab 1 and Tab 2, closing Tab 2 does not release a lock actively held by Tab 1.
5. **Disconnect Cleanup**: When a socket disconnects, all locks held by that socket are released immediately and `shape:unlocked` is broadcast to remaining collaborators.
6. **Zero-Trust Identity**: `userId` is strictly extracted from `socket.data.user.userId`. Peer badges display the verified collaborator name and deterministic color palette.
7. **Undo/Redo Stack Purity**: Lock acquisition, refresh, and release never append snapshots to `past` or mutate `future`.

---

## 9. Remote State & Undo/Redo Isolation

To prevent infinite feedback loops and avoid polluting local undo/redo history:
- **Local User Actions**: Mutate Zustand store via `addShape`, `moveSelectedShapes`, `updateRectangleTransform`, or `deleteShape`, which append snapshots to `past` and clear `future`.
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

## 10. Sender Exclusion

Socket broadcasts use `socket.to(getBoardRoom(boardId)).emit(...)` rather than `io.to(...).emit(...)`.
- The originating client is acknowledged directly via the Socket.IO acknowledgement callback (or skipped for ephemeral events like cursors).
- The originating client never receives its own broadcast, preventing redundant UI re-renders, self-echo, and transformation jumping.

---

## 11. In-Memory Presence & Multi-Tab Model

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

## 12. Disconnect Cleanup

When a network drop, page refresh, or tab closure triggers Socket.IO `disconnect`:
1. `socket.server.ts` catches `SocketEvents.DISCONNECT`.
2. Releases all shape locks held by the socket via `shapeLockManager.releaseSocketLocks(socket.id)` and broadcasts `shape:unlocked` for each released lock.
3. Calls `presenceManager.removeSocket(socket.id)`.
4. If the socket was in an active board and was the user's last connection, broadcasts `user:left` with updated `activeUsers` to the board room.
5. Cleans up in-memory mappings cleanly without throwing unhandled exceptions.

---

## 13. Supported Events

| Client → Server | Server → Client | Description | Frequency | Persistence |
|---|---|---|---|---|
| `board:join` | `canvas:sync` | Validates access, joins room, delivers initial canonical shapes | On load | None |
| `board:leave` | `user:joined` | Leaves room, updates presence, notifies remaining collaborators | On exit | None |
| `shape:create` | `shape:created` | Authoritative shape creation broadcast | Low | MongoDB |
| `shape:update` | `shape:updated` | Authoritative shape transform/position update broadcast | Low/Med | MongoDB |
| `shape:delete` | `shape:deleted` | Authoritative shape deletion broadcast | Low | MongoDB |
| `cursor:move` | `cursor:moved` | Live collaborator cursor synchronization | High (~30/s) | None (Ephemeral) |
| `selection:change` | `selection:changed` | Live collaborator shape selection synchronization | On change | None (Ephemeral) |
| `shape:lock` | `shape:locked` | Exclusive soft-lock acquisition before shape transformation | On transform start | None (Ephemeral) |
| `shape:unlock` | `shape:unlocked` | Release shape soft-lock after shape transformation ends | On transform end | None (Ephemeral) |
| `shape:lock-refresh` | | Extend soft-lock timeout during ongoing active transformation | ~1-2s during drag | None (Ephemeral) |
| | `user:left` | User departure notification | On exit | None |
| | `error` | Error notifications and status | On failure | None |

---

## 14. Folder Structure

```text
server/src/socket/
├── handlers/
│   ├── board.handler.ts        # Board room lifecycle & authorization orchestration
│   ├── shape.handler.ts        # Shape collaboration & persistence orchestration
│   ├── cursor.handler.ts       # Live collaborator cursor synchronization
│   ├── selection.handler.ts    # Live collaborator selection synchronization
│   └── lock.handler.ts         # Live collaborator soft-lock synchronization
├── presence/
│   └── presence.manager.ts     # Multi-tab in-memory presence tracking
├── locks/
│   └── shape-lock.manager.ts   # In-memory atomic shape soft-lock manager
├── validation/
│   ├── cursor.validation.ts    # Zod validation for cursor payloads
│   ├── selection.validation.ts # Zod validation for selection payloads
│   └── lock.validation.ts      # Zod validation for lock payloads
├── socket.events.ts            # Strongly typed event constants
├── socket.middleware.ts        # JWT authentication middleware
├── socket.rooms.ts             # Deterministic room naming helpers
├── socket.server.ts            # Socket.IO HTTP server attachment & disconnect lifecycle
├── socket.types.ts             # TypeScript generic event and payload contracts
└── index.ts                    # Public exports & initializers
```

---

## 15. Security & Hardening

1. **Authentication**: All connections require a valid JWT access token verified against `JWT_ACCESS_SECRET`.
2. **Authorization Boundary**: Board access authorization is verified server-side through `boardService.authorizeBoardAccess` before room entry or data sync.
3. **Persisted Boundary Resolution**: Sockets cannot supply arbitrary `boardId` or `userId` values; the server derives `boardId` strictly from `Shape` → `Canvas` → `Board`.
4. **Room Membership Enforcement**: Shape, cursor, selection, and lock handlers verify `socket.rooms.has(getBoardRoom(boardId))` before allowing actions.
5. **Shape Ownership Verification**: For selection and lock requests, `shapeService.verifyShapesBelongToBoard` guarantees that foreign shapes cannot be locked or selected across boards.
6. **DTO Sanitization**: Raw Mongoose model instances are never broadcast over sockets; all shape entities pass through `ShapeMapper.toResponseDto()`.
7. **Structured Error Handling**: All handler errors return structured `SocketAckError` payloads with specific error codes (`NOT_FOUND`, `FORBIDDEN`, `BAD_REQUEST`, `SHAPE_LOCKED`, `INTERNAL_ERROR`).

---

## 16. Future Redis Architecture & Scaling

When scaling beyond a single Node.js instance:
1. **Redis Adapter (`@socket.io/redis-adapter`)**: Replaces the in-memory pub/sub adapter to broadcast room events across all server nodes.
2. **Distributed Presence**: `PresenceManager` will transition from local JavaScript `Map` structures to Redis Sets/Hashes with key expiration (`EXPIRE`) for distributed heartbeat and presence tracking.
3. **Distributed Soft-Locking**: `ShapeLockManager` will transition to atomic Redis key operations (`SET shape:lock:<boardId>:<shapeId> <socketId> NX EX 10`). Releasing uses Lua scripts to guarantee safe release only by the owning socket.
4. **Sticky Sessions**: Load balancers (e.g. NGINX, AWS ALB) will configure sticky cookies for HTTP long-polling fallback during WebSocket handshakes.

---

## 17. Interview Concepts

### 1. Durable vs. Ephemeral State
- **Durable State**: Whiteboard entities (rectangles, text, colors, z-indexes, board settings) that must survive server restarts, page refreshes, and long-term storage. Stored authoritatively in database collections (MongoDB).
- **Ephemeral State**: High-frequency, transient collaboration signals (cursor positions, shape selections, soft-locks, typing indicators, selection outlines, online presence heartbeats). Lost state has zero consequence after a fraction of a second; writing to durable storage introduces fatal disk I/O bottlenecks. Handled purely in memory and broadcast via pub/sub.

### 2. Soft-Locking vs. Hard-Locking
- **Hard-Locking**: Blocks other users from selecting or interacting with an element at all times, making multi-user collaboration rigid.
- **Soft-Locking**: Allows multi-user selection, but establishes an exclusive lock only during the active transformation lifecycle (drag/resize/rotate). Communicates clear visual ownership ("User B editing") without impeding peer visibility.

### 3. Socket.IO Rooms
A logical grouping mechanism on the Socket.IO server. By joining `socket.join("board:<boardId>")`, broadcasts sent to that room are partitioned exclusively to clients connected to the same whiteboard, preventing cross-tenant message leakage and unnecessary client processing.

### 4. Broadcast vs. Emit
- `io.to(room).emit(event, data)`: Sends the message to *all* sockets in the room, including the originating socket.
- `socket.to(room).emit(event, data)`: Sends the message to all *other* sockets in the room, excluding the sender.
- `socket.emit(event, data)`: Sends the message *only* to the sender.

### 5. Server-Derived Identity
Never trusting client-supplied identity fields in message payloads (e.g., `{ userId: "attacker_id" }`). The server extracts identity exclusively from `socket.data.user.userId` attached during authentication, making spoofing mathematically impossible.

### 6. Event Throttling
Without throttling, `mousemove` triggers 120–240 times per second on high-refresh displays. In a board with 10 collaborators, unthrottled emissions generate 2,400 messages/sec. Throttling to 30 fps reduces traffic by 87% without perceptible degradation in visual fluidity.

### 7. Coordinate Systems (Screen vs. Canvas World)
- **Screen / Stage Coordinates**: Pixel offsets relative to the browser viewport or canvas DOM element. Changes when panning or zooming.
- **Canvas World Coordinates**: The invariant whiteboard space where a shape at `(100, 100)` remains at `(100, 100)` regardless of whether a user is zoomed at 50% or 200%. Cursors and shapes are synchronized exclusively in world coordinates.

### 8. Why Selection & Lock Data Should NOT Be Stored in MongoDB
At high frequencies across many concurrent users, storing ephemeral collaboration signals in MongoDB would require thousands of disk write ops/sec. This causes massive write amplification, oplog churn, database lock contention, and storage bloat for data that becomes completely obsolete within seconds.