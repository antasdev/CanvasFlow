# Socket Architecture

## 1. Purpose

CanvasFlow uses Socket.IO for real-time collaboration.

- **REST APIs** are responsible for initial workspace loading, authentication, and read-heavy views.
- **Socket.IO** is responsible for establishing real-time communication channels, authenticating sockets, managing board room collaboration lifecycles, broadcasting live canvas shape events, and synchronizing collaborator cursors.

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
Domain Services (BoardService, ShapeService, CanvasService)
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
    └── registerCursorHandlers(socket)
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

### Key Principles of Cursor Synchronization:
1. **Ephemeral Collaboration State**: Cursors represent transient user focus. They are **never persisted to MongoDB** or logged in durable collections.
2. **Fire-and-Forget (No Ack Overhead)**: Because cursors emit 20–30 updates per second per active collaborator, cursor messages are unacknowledged datagrams.
3. **Zero-Trust Identity**: `userId` is strictly attached by the server from `socket.data.user.userId`; client-supplied identity fields are completely ignored.
4. **Client-Side Throttling**: Pointer events are throttled on the client to ~30 fps (~33ms intervals), bounding network bandwidth consumption.
5. **Canvas Coordinate Invariance**: Cursors transmit world coordinates mapped via `screenToWorld(pointer, { pan, zoom })`. Remote collaborators render cursors accurately regardless of their local zoom factor or pan offset.
6. **Dedicated Rendering Overlay Layer**: Cursors render inside a top-level `<Layer listening={false}>` on Konva, eliminating interaction conflicts with shapes.
7. **Departure Cleanup**: When a collaborator leaves (`user:left`) or disconnects, their cursor is immediately removed via `removeRemoteCursor(userId)`.

---

## 7. Remote State & Undo/Redo Isolation

To prevent infinite feedback loops and avoid polluting local undo/redo history:
- **Local User Actions**: Mutate Zustand store via `addShape`, `moveSelectedShapes`, `updateRectangleTransform`, or `deleteShape`, which append snapshots to `past` and clear `future`.
- **Remote Collaborator Actions**: Dispatched via dedicated remote store actions:
  - `applyRemoteShapeCreated(shape)`
  - `applyRemoteShapeUpdated(shape)`
  - `applyRemoteShapeDeleted(shapeId)`
  - `setRemoteCursor(cursor)`
  - `removeRemoteCursor(userId)`
  - `clearRemoteCursors()`
- **Isolation Guarantee**: Remote actions update `shapes` or `remoteCursors` directly without touching `past` or `future` stacks and without re-emitting socket events.

---

## 8. Sender Exclusion

Socket broadcasts use `socket.to(getBoardRoom(boardId)).emit(...)` rather than `io.to(...).emit(...)`.
- The originating client is acknowledged directly via the Socket.IO acknowledgement callback (or skipped for ephemeral events like cursors).
- The originating client never receives its own broadcast, preventing redundant UI re-renders, self-echo, and transformation jumping.

---

## 9. In-Memory Presence & Multi-Tab Model

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

## 10. Disconnect Cleanup

When a network drop, page refresh, or tab closure triggers Socket.IO `disconnect`:
1. `socket.server.ts` catches `SocketEvents.DISCONNECT`.
2. Calls `presenceManager.removeSocket(socket.id)`.
3. If the socket was in an active board and was the user's last connection, broadcasts `user:left` with updated `activeUsers` to the board room.
4. Cleans up in-memory mappings cleanly without throwing unhandled exceptions.

---

## 11. Supported Events

| Client → Server | Server → Client | Description | Frequency | Persistence |
|---|---|---|---|---|
| `board:join` | `canvas:sync` | Validates access, joins room, delivers initial canonical shapes | On load | None |
| `board:leave` | `user:joined` | Leaves room, updates presence, notifies remaining collaborators | On exit | None |
| `shape:create` | `shape:created` | Authoritative shape creation broadcast | Low | MongoDB |
| `shape:update` | `shape:updated` | Authoritative shape transform/position update broadcast | Low/Med | MongoDB |
| `shape:delete` | `shape:deleted` | Authoritative shape deletion broadcast | Low | MongoDB |
| `cursor:move` | `cursor:moved` | Live collaborator cursor synchronization | High (~30/s) | None (Ephemeral) |
| | `user:left` | User departure notification | On exit | None |
| | `error` | Error notifications and status | On failure | None |

---

## 12. Folder Structure

```text
server/src/socket/
├── handlers/
│   ├── board.handler.ts      # Board room lifecycle & authorization orchestration
│   ├── shape.handler.ts      # Shape collaboration & persistence orchestration
│   └── cursor.handler.ts     # Live collaborator cursor synchronization
├── presence/
│   └── presence.manager.ts   # Multi-tab in-memory presence tracking
├── validation/
│   └── cursor.validation.ts  # Zod validation for cursor payloads
├── socket.events.ts          # Strongly typed event constants
├── socket.middleware.ts      # JWT authentication middleware
├── socket.rooms.ts           # Deterministic room naming helpers
├── socket.server.ts          # Socket.IO HTTP server attachment & disconnect lifecycle
├── socket.types.ts           # TypeScript generic event and payload contracts
└── index.ts                  # Public exports & initializers
```

---

## 13. Security & Hardening

1. **Authentication**: All connections require a valid JWT access token verified against `JWT_ACCESS_SECRET`.
2. **Authorization Boundary**: Board access authorization is verified server-side through `boardService.authorizeBoardAccess` before room entry or data sync.
3. **Persisted Boundary Resolution**: Sockets cannot supply arbitrary `boardId` or `userId` values; the server derives `boardId` strictly from `Shape` → `Canvas` → `Board`.
4. **Room Membership Enforcement**: Shape and cursor handlers verify `socket.rooms.has(getBoardRoom(boardId))` before allowing actions.
5. **DTO Sanitization**: Raw Mongoose model instances are never broadcast over sockets; all shape entities pass through `ShapeMapper.toResponseDto()`.
6. **Structured Error Handling**: All handler errors return structured `SocketAckError` payloads with specific error codes (`NOT_FOUND`, `FORBIDDEN`, `BAD_REQUEST`, `INTERNAL_ERROR`).

---

## 14. Future Redis Architecture & Scaling

When scaling beyond a single Node.js instance:
1. **Redis Adapter (`@socket.io/redis-adapter`)**: Replaces the in-memory pub/sub adapter to broadcast room events across all server nodes.
2. **Distributed Presence**: `PresenceManager` will transition from local JavaScript `Map` structures to Redis Sets/Hashes with key expiration (`EXPIRE`) for distributed heartbeat and presence tracking.
3. **Sticky Sessions**: Load balancers (e.g. NGINX, AWS ALB) will configure sticky cookies for HTTP long-polling fallback during WebSocket handshakes.

---

## 15. Interview Concepts

### 1. Durable vs. Ephemeral State
- **Durable State**: Whiteboard entities (rectangles, text, colors, z-indexes, board settings) that must survive server restarts, page refreshes, and long-term storage. Stored authoritatively in database collections (MongoDB).
- **Ephemeral State**: High-frequency, transient collaboration signals (cursor positions, typing indicators, selection outlines, online presence heartbeats). Lost state has zero consequence after a fraction of a second; writing to durable storage introduces fatal disk I/O bottlenecks. Handled purely in memory and broadcast via pub/sub.

### 2. Socket.IO Rooms
A logical grouping mechanism on the Socket.IO server. By joining `socket.join("board:<boardId>")`, broadcasts sent to that room are partitioned exclusively to clients connected to the same whiteboard, preventing cross-tenant message leakage and unnecessary client processing.

### 3. Broadcast vs. Emit
- `io.to(room).emit(event, data)`: Sends the message to *all* sockets in the room, including the originating socket.
- `socket.to(room).emit(event, data)`: Sends the message to all *other* sockets in the room, excluding the sender.
- `socket.emit(event, data)`: Sends the message *only* to the sender.

### 4. Authentication vs. Authorization
- **Authentication**: Validating identity (e.g., verifying JWT signature in `socket.middleware.ts` and extracting `userId`).
- **Authorization**: Validating permissions (e.g., verifying `boardService.authorizeBoardAccess` to ensure User A is permitted to enter or edit Board B).

### 5. Server-Derived Identity
Never trusting client-supplied identity fields in message payloads (e.g., `{ userId: "attacker_id" }`). The server extracts identity exclusively from `socket.data.user.userId` attached during authentication, making spoofing mathematically impossible.

### 6. Event Throttling
Without throttling, `mousemove` triggers 120–240 times per second on high-refresh displays. In a board with 10 collaborators, unthrottled emissions generate 2,400 messages/sec. Throttling to 30 fps reduces traffic by 87% without perceptible degradation in visual fluidity.

### 7. requestAnimationFrame (RAF) & Timestamp Intervals
Browser API scheduling execution right before the next display paint (~16.6ms for 60Hz displays). Timestamp-based throttle checks (`now - lastEmit >= 33ms`) ensure smooth rate limiting independent of client frame rates.

### 8. Coordinate Systems (Screen vs. Canvas World)
- **Screen / Stage Coordinates**: Pixel offsets relative to the browser viewport or canvas DOM element. Changes when panning or zooming.
- **Canvas World Coordinates**: The invariant whiteboard space where a shape at `(100, 100)` remains at `(100, 100)` regardless of whether a user is zoomed at 50% or 200%. Cursors and shapes are synchronized exclusively in world coordinates.

### 9. Real-Time State vs. Persistent State
Real-time state focuses on low-latency delivery, transport efficiency, and in-memory routing, whereas persistent state focuses on ACID guarantees, schema validation, index optimization, and data durability.

### 10. Why Cursor Data Should NOT Be Stored in MongoDB
At 30 updates/sec per user across 50 active users, storing cursors in MongoDB would require 1,500 disk write ops/sec. This causes massive write amplification, oplog churn, database lock contention, and storage bloat for data that becomes completely obsolete in 33 milliseconds.

### 11. How Redis Adapter Affects Cursor Broadcasting
In a horizontally scaled deployment with multiple Node.js instances behind a load balancer, Socket.IO clients are distributed across servers. `@socket.io/redis-adapter` publishes cursor events to Redis Pub/Sub channels keyed by room, forwarding packets to sibling server instances so collaborators on different nodes receive broadcasts in sub-millisecond time.

### 12. Scaling Cursor Synchronization with 100+ Users
When a room has 100 concurrent collaborators:
- 100 users × 30 updates/sec = 3,000 inbound events/sec.
- Distributing to 99 peers = 297,000 outbound packets/sec per board room.
- **Optimizations for Enterprise Scale**:
  1. **Adaptive Throttling**: Lower cursor broadcast rates from 30 fps to 10–15 fps when room size exceeds 25 users.
  2. **Viewport Culling (Spatial Partitioning)**: Only broadcast cursor movements to collaborators whose viewports intersect the active region.
  3. **Binary Serialization**: Pack cursor coordinates into binary buffers (`Uint8Array` / Protocol Buffers) to minimize network payload size from ~100 bytes JSON to 8 bytes binary.
  4. **Client-Side Linear Interpolation (LERP)**: Render remote cursors with smooth spring/LERP animations between lower-frequency server updates.