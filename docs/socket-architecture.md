# Socket Architecture

## 1. Purpose

CanvasFlow uses Socket.IO for real-time collaboration.

REST APIs are responsible for CRUD operations.

Socket.IO is responsible for broadcasting live collaboration events.

---

## 2. Connection Flow

```text
Client
    │
JWT
    │
Socket Middleware
    │
Socket Server
    │
Board Room
    │
Handlers
```

---

## 3. Event Flow

```text
shape:create
      │
      ▼
Shape Handler
      │
      ▼
Shape Service
      │
      ▼
Repository
      │
      ▼
MongoDB
      │
      ▼
Broadcast
```

---

## 4. Supported Events

| Client → Server | Server → Client |
|-----------------|-----------------|
| `board:join` | `canvas:sync` |
| `board:leave` | `user:joined` |
| `shape:create` | `user:left` |
| `shape:update` | `shape:created` |
| `shape:delete` | `shape:updated` |
| `cursor:move` | `shape:deleted` |
| | `cursor:moved` |

---

## 5. Folder Structure

```text
src/socket
│
├── handlers
│   ├── board.handler.ts
│   ├── shape.handler.ts
│   └── presence.handler.ts
│
├── presence
│   └── presence.manager.ts
│
├── socket.events.ts
├── socket.middleware.ts
├── socket.rooms.ts
├── socket.server.ts
└── socket.types.ts
```

---

## 6. Future Improvements

- Redis Adapter
- Multiple Node.js instances
- Rate limiting
- Event acknowledgements
- Collaborative selection
- Undo/Redo synchronization
- Version history synchronization
- Conflict resolution
- Operational Transformation (OT)
- CRDT support

---

This documentation reflects the architecture-first approach followed throughout the Socket.IO implementation in CanvasFlow. The current implementation establishes a scalable, maintainable foundation for real-time collaboration while leaving room for distributed deployment, advanced synchronization techniques, and enterprise-scale collaboration features.