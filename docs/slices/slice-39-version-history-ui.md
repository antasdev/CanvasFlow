# Slice 39 — Version History UI

## Purpose
Slice 39 implements the user-facing Version History client experience in CanvasFlow. It provides an accessible, responsive right-side slide-over panel that renders historical board versions grouped by calendar day (Today, Yesterday, etc.), displays lightweight version summaries with author metadata, version numbers, change reasons, canvas/shape counts, and supports cursor-based infinite pagination without introducing unnecessary snapshot reads, mutation side-effects, or global state pollution.

---

## Existing Architecture Audit

### Pre-Slice 39 Infrastructure
- **Server State**: `@tanstack/react-query` v5 for asynchronous caching and querying.
- **REST Client**: Centralized Axios instance (`client/src/services/api.ts`) managing JWT authentication headers.
- **Styling**: Tailwind CSS v4, `clsx`, `tailwind-merge`, and Lucide React icons.
- **Permissions**: `useWorkspacePermissions` with `role` resolving `OWNER`, `ADMIN`, `EDITOR`, `VIEWER`.
- **Backend API (Slice 38)**: `GET /api/v1/boards/:boardId/versions` returning lightweight summaries with cursor pagination (`nextCursor`, `hasMore`, `totalCount`) and excluding large shape snapshot payload arrays.

---

## Changes Introduced

### 1. Version History Feature Module (`client/src/features/history/`)
- **[history.types.ts](file:///d:/workspace/canvasflow/client/src/features/history/types/history.types.ts)**: Strict TypeScript definitions for `VersionSummary`, `VersionAuthor`, `VersionChangeSummary`, `VersionTrigger`, `VersionQueryParams`, `VersionListResponse`.
- **[history.api.ts](file:///d:/workspace/canvasflow/client/src/features/history/api/history.api.ts)**: Typed REST client consuming `GET /api/v1/boards/:boardId/versions`.
- **[history-date.utils.ts](file:///d:/workspace/canvasflow/client/src/features/history/utils/history-date.utils.ts)**: Pure presentation utilities for calendar day grouping (`formatDateGroup`), time formatting (`formatVersionTime`), and descending date bucket grouping (`groupVersionsByDate`).
- **[history.store.ts](file:///d:/workspace/canvasflow/client/src/features/history/store/history.store.ts)**: Minimal Zustand store for transient UI state (`isPanelOpen`, `togglePanel`).
- **[useVersionHistory.ts](file:///d:/workspace/canvasflow/client/src/features/history/hooks/useVersionHistory.ts)**: TanStack Query v5 `useInfiniteQuery` hook managing cursor pagination, deduplication, date grouping, and query caching.
- **Components**:
  - `VersionHistoryPanel.tsx`: Right-side slide-over container with WAI-ARIA region semantics, header, close controls, and timeline feed.
  - `VersionHistoryItem.tsx`: Timeline card showing version number, named badge, timestamp, author, trigger, change summary breakdown, and shape/canvas counts.
  - `VersionHistoryEmptyState.tsx`: Friendly empty state for boards without versions.
  - `VersionHistoryLoadingSkeleton.tsx`: Animated skeleton placeholders for initial load.
  - `VersionHistoryErrorState.tsx`: Error presentation with retry button.

### 2. Canvas & Workspace Integration
- **[CanvasToolbar.tsx](file:///d:/workspace/canvasflow/client/src/features/canvas/components/CanvasToolbar.tsx)**: Added History toggle button with active styling.
- **[CanvasEditor.tsx](file:///d:/workspace/canvasflow/client/src/features/canvas/components/CanvasEditor.tsx)**: Mounted `<VersionHistoryPanel boardId={boardId} />`.
- **[permissions.ts](file:///d:/workspace/canvasflow/client/src/features/workspace/utils/permissions.ts)** & **[useWorkspacePermissions.ts](file:///d:/workspace/canvasflow/client/src/features/workspace/hooks/useWorkspacePermissions.ts)**: Added `canViewHistory` (`!!role`).

---

## UI Architecture

```text
BoardCanvasPage
     │
     └── CanvasEditor
           ├── CanvasToolbar (History toggle button)
           │
           └── VersionHistoryPanel
                 ├── Header (Total count badge, Close X button)
                 │
                 └── Timeline Feed
                       ├── Date Group Headers ("Today", "Yesterday", etc.)
                       │     │
                       │     └── VersionHistoryItem cards
                       │
                       └── "Load older versions" Pagination Button
```

---

## Query Architecture
- **Query Key**: `['boards', boardId, 'versions']` strictly scoping version cache to the active board identity.
- **Pagination**: Uses TanStack Query v5 `useInfiniteQuery` with `initialPageParam: undefined` and `getNextPageParam: (lastPage) => lastPage.pagination.hasMore ? lastPage.pagination.nextCursor : undefined`.
- **Deduplication**: As sequential pages load, a `Map<string, VersionSummary>` deduplicates entries by stable version ID, guarding against duplicate rendering.
- **Cache Strategy**: Stale time of 2 minutes to minimize redundant network queries while keeping history fresh.

---

## Timeline & Date Grouping
- Grouped into chronological buckets using local timezone dates:
  - **"Today"**: Versions created during current calendar day.
  - **"Yesterday"**: Versions created during previous calendar day.
  - **"MMM d, yyyy"**: Older versions.
- Preserves server timestamp immutability while providing clean visual grouping.

---

## Loading / Error / Empty States
- **Initial Loading**: Renders `<VersionHistoryLoadingSkeleton />` with animated pulse placeholders.
- **Pagination Loading**: "Load older versions" button disables and renders a spinner while keeping existing items in place.
- **Empty State**: Renders `<VersionHistoryEmptyState />` when `totalCount === 0`.
- **Error State**: Displays `<VersionHistoryErrorState />` with error details and a "Try again" retry button calling TanStack Query `refetch()`.

---

## Permissions
- Reuses `useWorkspacePermissions` with `canViewHistory: !!role`.
- Any authenticated user who is a member of the workspace (`OWNER`, `ADMIN`, `EDITOR`, `VIEWER`) can access Version History.
- Frontend visibility aligns directly with backend authorization.

---

## Accessibility
- **Semantic Regions**: Panel uses `role="region"` with `aria-label="Version History Panel"`.
- **WAI-ARIA Controls**: Close button has explicit `aria-label="Close version history panel"`.
- **Keyboard Navigation**: Pressing `Escape` closes the history panel. Focusable timeline container has `tabIndex={0}`.

---

## Responsive Design
- Slide-over panel uses `fixed right-0 top-0 z-30 flex h-screen w-full sm:w-96 max-w-full`.
- On narrow viewports, panel gracefully occupies available width without horizontal overflowing or clipping toolbars.
- Text items and badges wrap and truncate cleanly.

---

## Performance & Snapshot Boundary
- **Lightweight Summaries Only**: Consumes only `VersionSummary` objects; does NOT fetch heavy shape snapshots for list rendering.
- **Zero N+1 Queries**: Renders author and change metadata directly from the list response without auxiliary user requests.
- **Cursor Pagination**: Loads versions in bounded pages (20 per page).

---

## Persistence & Collaboration Boundaries
- **0 Shape mutations**: Browsing history does not create or alter shapes.
- **0 Mutation records**: No mutation records generated.
- **0 collaborationRevision increments**: Live board revision is unmodified.
- **0 Socket.IO mutation events**: No broadcast events generated.
- **0 Undo/Redo pollution**: Local canvas history stack remains clean.
- **No new Socket.IO events**: History browsing is strictly local UI state.

---

## Preview & Restore Boundaries
- **Preview (Slice 40)**: Preview canvas and historical snapshot rendering are deferred to Slice 40. The preview action affordance is disabled.
- **Restore (Slice 41)**: Canvas restoration and replacement mutations are deferred to Slice 41. The restore action affordance is disabled.

---

## Architectural Decisions

### Decision 1: Server State in TanStack Query vs Zustand
- **Problem**: Storing version lists in global Zustand stores creates duplicate caching, manual pagination bookkeeping, and stale state bugs.
- **Decision**: Managed via TanStack Query v5 `useInfiniteQuery`. Zustand is used only for minimal UI visibility (`isPanelOpen`).
- **Trade-off**: Requires TanStack Query hook consumption in components.
- **Reason**: Server state caching, background refetching, and pagination are core strengths of TanStack Query.

### Decision 2: Pure Date Grouping in Presentation Layer
- **Problem**: Storing relative dates ("Today", "Yesterday") in database/DTO violates internationalization, locale handling, and caching.
- **Decision**: Presentation layer computes calendar day buckets dynamically using the user's local timezone.
- **Trade-off**: Requires lightweight grouping calculation on query response.
- **Reason**: Clean, robust, and timezone-accurate.

---

## Automated Tests
- **[history-date.utils.test.ts](file:///d:/workspace/canvasflow/client/src/features/history/__tests__/history-date.utils.test.ts)**: 4 tests passed.
- **[VersionHistoryItem.test.ts](file:///d:/workspace/canvasflow/client/src/features/history/__tests__/VersionHistoryItem.test.ts)**: 5 tests passed.
- **[VersionHistoryPanel.test.ts](file:///d:/workspace/canvasflow/client/src/features/history/__tests__/VersionHistoryPanel.test.ts)**: 4 tests passed.
- **[useVersionHistory.test.ts](file:///d:/workspace/canvasflow/client/src/features/history/__tests__/useVersionHistory.test.ts)**: 3 tests passed.
- **Full Client Vitest Suite**: 55 test files (522 tests) passed.
- **Server Regression Suite**: 9/9 history API tests passed.
- **Build**: `tsc -b` and `vite build` completed cleanly with zero errors.

---

## Future Improvements (Deferred to Slices 40–42)
- **Slice 40**: Version Preview Canvas with read-only snapshot inspection.
- **Slice 41**: Version Restore mutation workflow.
- **Slice 42**: Compression, snapshot pruning, and background archival workers.
