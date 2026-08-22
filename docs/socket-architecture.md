# Socket Architecture

## 1. Purpose

CanvasFlow uses Socket.IO for real-time collaboration.

- **REST APIs** are responsible for initial workspace loading, authentication, and read-heavy views.
- **Socket.IO** is responsible for establishing real-time communication channels, authenticating sockets, managing board room collaboration lifecycles, and broadcasting live canvas shape events.

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
    └── registerShapeHandlers(socket)
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

### A. Shape Creation (`shape:create`)
- **Payload**: `{ canvasId, type, x, y, width, height, rotation?, style? }`
- **Resolution**: `canvasId` → `Canvas` → `boardId` → `boardService.authorizeBoardAccess(boardId, userId)`
- **Room Check**: `socket.rooms.has(getBoardRoom(boardId))`
- **Persistence**: `shapeService.createShape(...)` computes next `zIndex` and saves in MongoDB
- **Delivery**:
  - Creator receives Ack with canonical `ShapeResponseDto`.
  - Collaborators receive `shape:created` broadcast with `ShapeResponseDto`.

### B. Shape Update (`shape:update`)
- **Payload**: `{ shapeId, data: { x?, y?, width?, height?, rotation?, style? } }`
- **Resolution**: `shapeId` → `Shape` → `canvasId` → `Canvas` → `boardId` → `boardService.authorizeBoardAccess(boardId, userId)`
- **Room Check**: `socket.rooms.has(getBoardRoom(boardId))`
- **Persistence**: `shapeService.updateShape(shapeId, data)` validates and updates MongoDB
- **Delivery**:
  - Sender receives Ack with updated `ShapeResponseDto`.
  - Collaborators receive `shape:updated` broadcast with updated `ShapeResponseDto`.

### C. Shape Deletion (`shape:delete`)
- **Payload**: `{ shapeId }`
- **Resolution**: `shapeId` → `Shape` → `canvasId` → `Canvas` → `boardId` → `boardService.authorizeBoardAccess(boardId, userId)`
- **Room Check**: `socket.rooms.has(getBoardRoom(boardId))`
- **Persistence**: `shapeService.deleteShape(shapeId)` removes document from MongoDB
- **Delivery**:
  - Sender receives Ack `{ success: true }`.
  - Collaborators receive `shape:deleted` broadcast with `{ shapeId }`.

---

## 6. Remote State & Undo/Redo Isolation

To prevent infinite feedback loops and avoid polluting local undo/redo history:
- **Local User Actions**: Mutate Zustand store via `addShape`, `moveSelectedShapes`, `updateRectangleTransform`, or `deleteShape`, which append snapshots to `past` and clear `future`.
- **Remote Collaborator Actions**: Dispatched via dedicated remote store actions:
  - `applyRemoteShapeCreated(shape)`
  - `applyRemoteShapeUpdated(shape)`
  - `applyRemoteShapeDeleted(shapeId)`
- **Isolation Guarantee**: Remote actions update `shapes` directly without touching `past` or `future` stacks and without re-emitting socket events.

---

## 7. Sender Exclusion

Socket broadcasts use `socket.to(getBoardRoom(boardId)).emit(...)` rather than `io.to(...).emit(...)`.
- The originating client is acknowledged directly via the Socket.IO acknowledgement callback.
- The originating client never receives its own broadcast, preventing redundant UI re-renders and transformation jumping.

---

## 8. In-Memory Presence & Multi-Tab Model

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

## 9. Disconnect Cleanup

When a network drop, page refresh, or tab closure triggers Socket.IO `disconnect`:
1. `socket.server.ts` catches `SocketEvents.DISCONNECT`.
2. Calls `presenceManager.removeSocket(socket.id)`.
3. If the socket was in an active board and was the user's last connection, broadcasts `user:left` with updated `activeUsers` to the board room.
4. Cleans up in-memory mappings cleanly without throwing unhandled exceptions.

---

## 10. Supported Events

| Client → Server | Server → Client | Description |
|---|---|---|
| `board:join` | `canvas:sync` | Validates access, joins room, delivers initial canonical shapes |
| `board:leave` | `user:joined` | Leaves room, updates presence, notifies remaining collaborators |
| `shape:create` | `shape:created` | Authoritative shape creation broadcast |
| `shape:update` | `shape:updated` | Authoritative shape transform/position update broadcast |
| `shape:delete` | `shape:deleted` | Authoritative shape deletion broadcast |
| `cursor:move` (Future) | `cursor:moved` | Live collaborator cursor synchronization |
| | `user:left` | User departure notification |
| | `error` | Error notifications and status |

---

## 11. Folder Structure

```text
server/src/socket/
├── handlers/
│   ├── board.handler.ts      # Board room lifecycle & authorization orchestration
│   ├── shape.handler.ts      # Shape collaboration & persistence orchestration
│   └── presence.handler.ts   # (Future) Cursor & presence event handlers
├── presence/
│   └── presence.manager.ts   # Multi-tab in-memory presence tracking
├── socket.events.ts          # Strongly typed event constants
├── socket.middleware.ts      # JWT authentication middleware
├── socket.rooms.ts           # Deterministic room naming helpers
├── socket.server.ts          # Socket.IO HTTP server attachment & disconnect lifecycle
├── socket.types.ts           # TypeScript generic event and payload contracts
└── index.ts                  # Public exports & initializers
```

---

## 12. Security & Hardening

1. **Authentication**: All connections require a valid JWT access token verified against `JWT_ACCESS_SECRET`.
2. **Authorization Boundary**: Board access authorization is verified server-side through `boardService.authorizeBoardAccess` before room entry or data sync.
3. **Persisted Boundary Resolution**: Sockets cannot supply arbitrary `boardId` or `userId` values; the server derives `boardId` strictly from `Shape` → `Canvas` → `Board`.
4. **Room Membership Enforcement**: Shape handlers verify `socket.rooms.has(getBoardRoom(boardId))` before allowing shape creation, modification, or deletion.
5. **DTO Sanitization**: Raw Mongoose model instances are never broadcast over sockets; all shape entities pass through `ShapeMapper.toResponseDto()`.
6. **Structured Error Handling**: All handler errors return structured `SocketAckError` payloads with specific error codes (`NOT_FOUND`, `FORBIDDEN`, `BAD_REQUEST`, `INTERNAL_ERROR`).

---

## 13. Future Redis Architecture & Scaling

When scaling beyond a single Node.js instance:
1. **Redis Adapter (`@socket.io/redis-adapter`)**: Replaces the in-memory pub/sub adapter to broadcast room events across all server nodes.
2. **Distributed Presence**: `PresenceManager` will transition from local JavaScript `Map` structures to Redis Sets/Hashes with key expiration (`EXPIRE`) for distributed heartbeat and presence tracking.
3. **Sticky Sessions**: Load balancers (e.g. NGINX, AWS ALB) will configure sticky cookies for HTTP long-polling fallback during WebSocket handshakes.