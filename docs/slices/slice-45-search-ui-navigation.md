# Slice 45: Search UI & Navigation

## 1. Purpose

Slice 45 implements a fast, accessible, keyboard-driven Search UI and cross-entity deep-link navigation experience on top of the search domain infrastructure (Slice 43) and query optimization API (Slice 44) in CanvasFlow.

Users can open search globally via trigger buttons or `Ctrl/Cmd + K`, perform debounced searches within board or workspace scopes, filter by entity type (`board`, `canvas`, `shape`, `comment`), navigate results smoothly via keyboard, load additional pages using opaque V2 composite cursor pagination, and jump directly to target entities while suppressing canvas shortcut conflicts and maintaining strict read-only guarantees.

---

## 2. Existing Architecture Audit

Prior to Slice 45:
- **Backend Search Infrastructure**:
  - `GET /api/v1/search` endpoint supported `workspace` and `board` scopes, multi-entity searching (`board`, `canvas`, `shape`, `comment`), sanitized literal regex matching, lightweight projections, and V2 composite cursor pagination.
  - Client API client: `searchApi.search(params)` in `client/src/features/search/api/search.api.ts`.
  - Client types: `SearchQueryParams`, `SearchResultItem`, `SearchPaginationMetadata`, `SearchResponse`.
  - Query hook: `useSearch` in `client/src/features/search/hooks/useSearch.ts`.
- **Canvas Navigation**:
  - `CanvasEditor.tsx` implemented `handleNavigateToShape(shapeId)` calculating viewport centering pan via `calculateCenterPan(center, zoom, size)` and selecting the shape via `useCanvasStore.getState().selectShape(shapeId)`.
  - Comment deep-linking already existed in `CanvasEditor.tsx` via `searchParams.get("commentId")`, opening the comment panel, setting the active thread, and centering viewport on the comment position.
- **Routing**:
  - `ProtectedRoute.tsx` wrapped all authenticated routes (`DashboardLayout` and `BoardCanvasPage`).
  - `/boards/:boardId` rendered `BoardCanvasPage`.
  - `/workspaces/:workspaceId` rendered `WorkspaceDetailPage` with `WorkspaceTopBar`.
- **Keyboard Shortcuts**:
  - Canvas shortcuts were registered across `CanvasEditor.tsx`, `useCanvasClipboard.ts`, and `useCanvasHistory.ts`.
  - `Ctrl/Cmd + K` was unassigned and available for search.

---

## 3. Search UI Architecture

Slice 45 adheres strictly to the **Single Global Search UI** principle:

```text
                               Application Layout
                                      │
              ┌───────────────────────┴───────────────────────┐
              ▼                                               ▼
     Authenticated Routes                              ONE SearchDialog
   (Dashboard / Board Canvas)                    (Mounted in ProtectedRoute)
              │                                               ▲
      Search Triggers                                         │
 (BoardCanvasPage / TopBar) ─── openSearch(context) ──────────┘
              │
              ▼
      useInfiniteSearch
              │
              ▼
       searchApi.search
              │
              ▼
      GET /api/v1/search
```

### Key Components:
1. `SearchDialog`: Mounted exactly once inside `client/src/app/router/ProtectedRoute.tsx`. Houses the search input, entity filter pills, scope badge/toggle, results listbox, "Load more" cursor pagination trigger, and empty/loading/error states.
2. `SearchButton`: Reusable contextual trigger mounted in `BoardCanvasPage`, `WorkspaceTopBar`, and `DashboardLayout`. Displays search icon, "Search...", and platform-aware keyboard shortcut (`Ctrl K` / `⌘ K`).
3. `SearchResultItem`: Accessible item renderer displaying entity type badges (`Board`, `Canvas`, `Shape`, `Comment`), icons, title, snippet, parent breadcrumbs, and active highlight indicators.

---

## 4. Global State vs Server State

State boundaries are strictly separated:
- **Search UI State (`useSearchDialogStore`)**:
  - Owns transient modal state: `isOpen`, active `scope` (`"workspace"` | `"board"`), contextual IDs (`workspaceId`, `boardId`, `workspaceName`, `boardName`), and open/close/toggle actions.
  - Does NOT store search results, cursor tokens, document mutations, or canvas selections.
- **Server State (`useInfiniteSearch`)**:
  - Owned by TanStack Query (`useInfiniteQuery`).
  - Caches results by deterministic query key: `["search", "infinite", { scope, workspaceId, boardId, q, types, limit }]`.
  - Automatically cancels superseded inflight requests when query or filter changes.
- **Canvas State (`useCanvasStore`)**:
  - Preserves shape selection and viewport pan/zoom without pollutive coupling to search state.

---

## 5. Contextual Search Scope

Search triggers provide precise context without broadening boundaries:
- **Board Canvas (`BoardCanvasPage`)**:
  - Context: `scope: "board"`, `boardId`, `workspaceId: board.workspaceId`.
  - SearchDialog displays `Board` scope and provides a quick toggle to broaden to `Workspace` search when `workspaceId` is present.
- **Workspace Pages (`WorkspaceTopBar`)**:
  - Context: `scope: "workspace"`, `workspaceId`.
  - Searches all boards, canvases, shapes, and comments within that workspace.
- **Dashboard (`DashboardLayout`)**:
  - Context: `scope: "workspace"`, uses the active workspace if available.

---

## 6. Keyboard Architecture & Conflict Suppression

### Global Shortcut (`Ctrl/Cmd + K`):
- Registered **exactly once** in `SearchDialog` on mount.
- Includes a robust `isEditableTarget` guard preventing accidental triggering when typing inside:
  - `<input>`
  - `<textarea>`
  - `<select>`
  - `[contenteditable]`
  - Rich text editors, sticky notes, or comment composers.

### Conflict Suppression:
When `SearchDialog` is open, canvas interactions are strictly guarded:
- `handleKeyDown` in `CanvasEditor.tsx`: Checks `useSearchDialogStore.getState().isOpen` and halts canvas tool keys (`V`, `T`, `R`, `H`, `O`, `L`, `A`, `P`, `S`, `C`, `Delete`, `Backspace`).
- `handleSpaceDown` in `CanvasEditor.tsx`: Checks `useSearchDialogStore.getState().isOpen` and prevents canvas pan mode.
- `useCanvasClipboard.ts`: Checks `useSearchDialogStore.getState().isOpen` and halts canvas copy/paste/duplicate.
- `useCanvasHistory.ts`: Checks `useSearchDialogStore.getState().isOpen` and halts canvas undo/redo.

### List Navigation:
- `ArrowDown` / `ArrowUp`: Cycles through results with wrap-around.
- `scrollIntoView({ block: "nearest" })`: Automatically scrolls active item into view.
- `Enter`: Activates highlighted result and executes navigation.
- `Escape`: Closes search dialog and restores focus to triggering element.

---

## 7. Pagination Architecture

- Uses `@tanstack/react-query` `useInfiniteQuery` via `useInfiniteSearch`.
- **Opaque Cursor Guarantee**: The client never inspects, decodes, constructs, or compares the V2 Base64URL cursor.
- `initialPageParam: null`.
- `getNextPageParam: (lastPage) => lastPage.pagination.hasMore && lastPage.pagination.nextCursor ? lastPage.pagination.nextCursor : undefined`.
- Pagination UX: Accessible "Load more results" button with loading spinner, preventing disruptive auto-jumps during keyboard navigation.

---

## 8. Navigation & Deep-Linking

| Result Type | Confirmed Destination Route | Navigation Handling |
|---|---|---|
| **Board** | `/boards/:boardId` | Standard React Router navigation via `navigate()`. |
| **Canvas** | `/boards/:boardId?canvasId=:canvasId` | `BoardCanvasPage` checks `searchParams.get("canvasId")` and sets `activeCanvas = canvases.find(c => c.id === canvasIdParam) \|\| canvases[0]`. |
| **Shape** | `/boards/:boardId?shapeId=:shapeId` (preserving `canvasId` if present) | `CanvasEditor` awaits canvas hydration, locates the target shape in `shapes`, executes `selectShape(shapeId)`, centers viewport via `calculateCenterPan`, and marks deep-link handled in `handledShapeDeepLinkRef` for idempotency. |
| **Comment** | `/boards/:boardId?commentId=:commentId` (preserving `canvasId` if present) | `CanvasEditor` resolves comment deep-link, opens comment panel, activates thread, and centers pan on comment position. |

---

## 9. Shape Deep-Linking Idempotency Lifecycle

```text
URL contains ?shapeId=xyz
            ↓
CanvasEditor mounts / renders
            ↓
Shapes finish loading from API/store
            ↓
Find target shape in shapes array
            ↓
Ensure viewport size (width > 0, height > 0)
            ↓
Match found & handledShapeDeepLinkRef !== shapeId
            ↓
handledShapeDeepLinkRef.current = shapeId
            ↓
selectShape(shapeId)
            ↓
setPan(centerPan.x, centerPan.y)
            ↓
Subsequent unrelated renders: SKIPPED IDEMPOTENTLY
```

---

## 10. Accessibility

- `SearchDialog`: Semantics defined with `role="dialog"`, `aria-modal="true"`, and `aria-label="Search"`.
- Search Input: `role="combobox"`, `aria-expanded={hasResults}`, `aria-controls="search-results-list"`, `aria-activedescendant="search-result-{index}"`, `aria-autocomplete="list"`.
- Results Container: `role="listbox"`, `id="search-results-list"`, `aria-label="Search results"`.
- Items: `role="option"`, `aria-selected={isSelected}`, `tabIndex={-1}`.
- Focus Lifecycle: Automatically focuses input on modal open; restores focus to trigger button on close.

---

## 11. Performance & Persistence Boundary

- **Debouncing**: Search inputs debounced at 250ms to eliminate redundant network requests.
- **Read-Only Invariant**:
  - Search opening: 0 mutations.
  - Search query: 0 mutations.
  - Result navigation: 0 mutations.
  - Zero MutationRecords, zero BoardVersion snapshots, zero collaborationRevisions, zero Socket.IO mutation events, zero undo/redo stack pollution.

---

## 12. Architectural Decisions

1. **Single Global SearchDialog Instance**:
   - *Problem*: Mounting independent dialogs in `BoardCanvasPage`, `WorkspaceTopBar`, and `DashboardLayout` causes duplicate key listeners, conflicting open states, and duplicate requests.
   - *Decision*: Mount one single `SearchDialog` in `ProtectedRoute.tsx` and use lightweight `SearchButton` triggers.
2. **Opaque Cursor in Frontend**:
   - *Problem*: Re-implementing V2 cursor logic on the client creates tight coupling and fragility.
   - *Decision*: Client treats the cursor strictly as an opaque string token passed between `pagination.nextCursor` and `params.cursor`.
3. **Modal Shortcut Guard vs stopPropagation**:
   - *Problem*: Window-level keyboard listeners bypass DOM event propagation boundaries.
   - *Decision*: Global keyboard handlers check `useSearchDialogStore.getState().isOpen` as a direct guard.

---

## 13. Verification & Test Results

### Client Vitest Suite:
```text
Test Files: 64 passed (64)
Tests:      565 passed (565)
Duration:   17.50s
```

### Server Regression Suites:
- `test:search`: 8/8 suites passed (Validation, API, Optimization, Cursor Pagination, Projections, Explain Plans).
- `test:history-reliability`: 10/10 tests passed (OCC, Idempotency, Concurrent Restore, Monotonic Sequencing).
- `test:history-restore`: 10/10 tests passed (RBAC, IDOR, Multi-canvas restore).
- `test:history-api`: 9/9 tests passed (Auth, RBAC, IDOR, Read-only invariants).
- `test:comments`: 4 test suites passed (Domain, Service, REST API, Reliability).
- `test:rbac`: 9/9 tests passed (Workspace & Board permissions).

### Production Builds:
- Server build (`tsc`): **PASS** (0 errors)
- Client build (`tsc -b && vite build`): **PASS** (0 errors, 2347 modules transformed)

---

## 14. Git Safety Review

- Branch: `feature/search-ui-navigation`
- Working tree clean of temporary files
- No commits made
- No pushes made
