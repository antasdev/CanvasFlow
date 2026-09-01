# CanvasFlow

An offline-resilient, production-oriented collaborative whiteboard platform designed for software engineering teams.

---

## Architecture Overview

```text
┌─────────────────────────────────────────────────────────────┐
│                      Client Layer (React)                   │
│  - Konva Canvas Engine (Shapes, Transforms, Anchors, Grid)  │
│  - Zustand State Stores (Canvas, Presence, Mutation, Collab)│
│  - Ephemeral & Optimistic Mutation Manager                  │
│  - Local Undo/Redo In-Memory History Stack                  │
└──────────────┬───────────────────────────────▲──────────────┘
               │ HTTP REST                     │ Socket.IO
               ▼                               │ WebSockets
┌──────────────────────────────────────────────┴──────────────┐
│                    Server Layer (Node.js/Express)           │
│  - Controller -> Service -> Repository -> MongoDB Pattern   │
│  - Socket Handler Layer (Room isolation, RBAC, Soft-Locks)  │
│  - Authoritative OCC (Optimistic Concurrency Control)       │
│  - Atomic Revision Log & Snapshot Recovery Hydration        │
│  - In-Memory Presence & Ephemeral Soft-Locking Registry     │
└─────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

### Frontend
- **Framework**: React 19 + TypeScript + Vite
- **Styling**: Tailwind CSS
- **State Management**: Zustand (Canvas, Collaboration, Presence, Comments, Mutation Stores)
- **Canvas Rendering**: Konva.js & `react-konva` (Virtual layer, anchor snapping, smart guides)
- **Data Fetching**: TanStack Query
- **Forms & Validation**: React Hook Form + Zod
- **Networking**: Socket.IO Client + Axios

### Backend
- **Runtime**: Node.js + Express + TypeScript
- **Database**: MongoDB + Mongoose (Authoritative OCC schema versioning)
- **Real-Time Communication**: Socket.IO (Namespaces, authenticated handshake, room isolation)
- **Authentication**: JWT (Access + Refresh token rotation) + Bcrypt
- **State Storage**: In-Memory Presence & Ephemeral Soft-Locking Registry (Single-Node Architecture)

---

## Key Architectural Realities & Design Decisions

### 1. Undo / Redo Architecture (Local In-Memory Optimistic History)
- **Scope**: Local client session only.
- **Implementation**: Managed inside Zustand `canvas.store.ts` via snapshot differential stacks (`past` and `future`).
- **Isolation**: Remote mutations received from peer collaborators via Socket.IO update the canvas stage directly but **do not** pollute or mutate the local client's undo/redo history stack.
- **Reconciliation**: Undoing or redoing an action generates standard optimistic mutations sent to the authoritative backend with expected OCC version checks.

### 2. Multi-User Presence & Ephemeral Soft-Locking
- **Current Runtime**: High-performance single-node architecture with in-memory presence tracking, room state, and shape soft-locks (`shape:lock` / `shape:unlock` / `shape:lock-refresh` with 3-second auto-expiry).
- **Scale Roadmap**: Redis pub/sub adapter integration is scheduled for horizontal multi-instance scaling in post-1.0 deployment phases.

### 3. Optimistic Concurrency Control (OCC) & Authoritative Recovery
- **Conflict Prevention**: Soft-locking prevents inadvertent concurrent edits.
- **Race Protection**: If concurrent mutations race against the same version, MongoDB OCC atomically commits the first write and rejects subsequent writes with structured `CONFLICT` errors.
- **Reconnection Recovery**: Upon network disconnect and reconnect, clients request `board:recover` to hydrate the latest authoritative server revision and shapes snapshot.

---

## Getting Started

### Prerequisites
- Node.js (v18+)
- MongoDB instance (local or MongoDB Atlas)

### Server Setup
```bash
cd server
npm install
npm run build
npm run dev
```

### Client Setup
```bash
cd client
npm install
npm run build
npm run dev
```

### Running Tests
```bash
# Frontend Unit & Store Suites
cd client
npm run test:run

# Frontend Linter
cd client
npm run lint

# Backend Integration Suites
cd server
npx tsx -r tsconfig-paths/register src/socket/tests/socket-transform-sync.test.ts
npx tsx -r tsconfig-paths/register src/socket/tests/socket-text-shape.test.ts
```