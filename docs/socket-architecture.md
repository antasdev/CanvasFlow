# Socket Architecture

## 1. Purpose

CanvasFlow uses Socket.IO for real-time collaboration.

- **REST APIs** are responsible for persistence-oriented CRUD operations and queries.
- **Socket.IO** is responsible for establishing real-time communication channels, authenticating sockets, managing board room collaboration lifecycles, and broadcasting live canvas events.

---

## 2. Layered Architecture

The socket layer adheres strictly to the project's layered architectural pattern:

```text
Client (React + Zustand + Socket.IO Client)
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
    └── Lifecycle handlers attached (board, shape, presence)
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

## 5. In-Memory Presence & Multi-Tab Model

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

## 6. Disconnect Cleanup

When a network drop, page refresh, or tab closure triggers Socket.IO `disconnect`:
1. `socket.server.ts` catches `SocketEvents.DISCONNECT`.
2. Calls `presenceManager.removeSocket(socket.id)`.
3. If the socket was in an active board and was the user's last connection, broadcasts `user:left` with updated `activeUsers` to the board room.
4. Cleans up in-memory mappings cleanly without throwing unhandled exceptions.

---

## 7. Supported Events

| Client → Server | Server → Client | Description |
|---|---|---|
| `board:join` | `canvas:sync` | Validates access, joins room, delivers initial canonical shapes |
| `board:leave` | `user:joined` | Leaves room, updates presence, notifies remaining collaborators |
| `shape:create` (Future) | `user:left` | Authoritative shape creation broadcast |
| `shape:update` (Future) | `shape:created` | Authoritative shape transform/position update broadcast |
| `shape:delete` (Future) | `shape:updated` | Authoritative shape deletion broadcast |
| `cursor:move` (Future) | `shape:deleted` | Live collaborator cursor synchronization |
| | `cursor:moved` | Collaborator cursor position update |
| | `error` | Error notifications and status |

---

## 8. Folder Structure

```text
server/src/socket/
├── handlers/
│   ├── board.handler.ts      # Board room lifecycle & authorization orchestration
│   ├── shape.handler.ts      # (Future) Shape collaboration orchestration
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

## 9. Security & Hardening

1. **Authentication**: All connections require a valid JWT access token verified against `JWT_ACCESS_SECRET`.
2. **Authorization Boundary**: Board access authorization is verified server-side through `boardService.authorizeBoardAccess` before room entry or data sync.
3. **DTO Sanitization**: Raw Mongoose model instances are never broadcast over sockets; all shape entities pass through `ShapeMapper.toResponseDto()`.
4. **Structured Error Handling**: All handler errors return structured `SocketAckError` payloads with specific error codes (`NOT_FOUND`, `FORBIDDEN`, `BAD_REQUEST`, `INTERNAL_ERROR`).

---

## 10. Future Redis Architecture & Scaling

When scaling beyond a single Node.js instance:
1. **Redis Adapter (`@socket.io/redis-adapter`)**: Replaces the in-memory pub/sub adapter to broadcast room events across all server nodes.
2. **Distributed Presence**: `PresenceManager` will transition from local JavaScript `Map` structures to Redis Sets/Hashes with key expiration (`EXPIRE`) for distributed heartbeat and presence tracking.
3. **Sticky Sessions**: Load balancers (e.g. NGINX, AWS ALB) will configure sticky cookies for HTTP long-polling fallback during WebSocket handshakes.