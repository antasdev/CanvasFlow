# CanvasFlow – System Architecture Documentation

## 1. Executive Summary

CanvasFlow is an offline-resilient, production-oriented collaborative whiteboard application built with React, Konva.js, Node.js, Express, MongoDB, and Socket.IO. The platform enables low-latency real-time collaboration, shape rendering, text editing, sticky notes, grouping, alignment, commenting, and optimistic concurrency control (OCC).

---

## 2. High-Level Architecture

```text
┌─────────────────────────────────────────────────────────────┐
│                      Client Layer (React)                   │
│  - Konva 2D Canvas Engine                                   │
│  - Zustand State Stores (Canvas, Mutation, Presence, Collab)│
│  - Ephemeral & Optimistic Mutation Manager                  │
│  - Local In-Memory Undo/Redo Differential Stack             │
└──────────────┬───────────────────────────────▲──────────────┘
               │ HTTP REST                     │ Socket.IO
               ▼                               │ WebSockets
┌──────────────────────────────────────────────┴──────────────┐
│                 Backend Server Layer (Node.js/Express)      │
│  - Controller -> Service -> Repository -> MongoDB Pattern   │
│  - Socket Handler Layer (Room isolation, RBAC, Soft-Locks)  │
│  - Authoritative OCC (Optimistic Concurrency Control)       │
│  - Atomic Revision Log & Snapshot Recovery Hydration        │
│  - In-Memory Presence & Ephemeral Soft-Locking Registry     │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Core Architectural Subsystems

### 3.1 Undo / Redo Mechanism
- **Model**: Client-side, local in-memory snapshot history stack (`past` and `future` stacks in Zustand `canvas.store.ts`).
- **Isolation**: Remote events broadcasted by collaborators directly mutate canvas shape state without polluting or shifting the local client's undo/redo history.
- **Operations**:
  - `undo()` pops the previous canvas snapshot, computes inverse mutations, and optimistically emits them with expected OCC versions.
  - `redo()` reapplies forward mutations.
- **Persistence**: Undo/Redo stacks are ephemeral per client tab session and not persisted across full page reloads.

### 3.2 Ephemeral Presence & Soft-Locking
- **Soft-Locks**: Prevents conflicting concurrent transforms or text edits. When a user transforms a shape, `shape:lock` is acquired with a 3-second auto-expiry window (refreshed via heartbeat while active).
- **Presence**: Tracks active user positions, colors, cursor coordinates, and selection bounding boxes in real-time.
- **Current Runtime**: High-throughput in-memory registry on a single Node.js instance.
- **Horizontal Scaling Roadmap**: Redis adapter and Redis pub/sub message broker are roadmap items for multi-instance clusters.

### 3.3 Authoritative Persistence & Optimistic Concurrency Control (OCC)
- **Primary Source of Truth**: MongoDB document version field (`version: number`).
- **Atomic Revision Service**: `collaborationVersionService.executeWithRevision()` runs within MongoDB transactions to atomically write shape mutations and increment board revision numbers.
- **Conflict Handling**: If two clients race with `expectedVersion = N`, the first write succeeds and increments the shape version to `N + 1`. The second write fails with a structured `CONFLICT` error payload (`{ code: "CONFLICT", currentVersion: N + 1 }`), prompting the second client to reconcile without crashing.

### 3.4 Recovery & Reconnection Hydration
- **Four-Case Reconciliation**: Client mutation manager reconciles uncertain mutations on reconnect.
- **Board Recovery Protocol**: Upon socket reconnection, the client emits `board:recover` to fetch the authoritative server revision, active room presence, and latest shape snapshots, reconciling any missed frames.

---

## 4. Verification & Testing Standards

All features are tested against:
1. **Frontend Vitest Suite**: 38 test files covering coordinate math, selection geometry, viewport transformations, grouping, alignment, undo/redo, presence, clipboard, and socket communication.
2. **ESLint & TypeScript**: Zero linter errors and zero compilation warnings under strict mode.
3. **Backend Integration Suites**: End-to-end Socket.IO tests validating OCC conflict races, shape creation/updates, text editing, sticky notes, room isolation, and reconnection recovery.
