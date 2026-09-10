# Slice 43 — Search Domain / Search Infrastructure

## 1. Purpose

Slice 43 establishes the foundational **Search Domain and Search Infrastructure** in CanvasFlow as the first slice of **Phase 10 — Search & Export**. It defines a clean, scalable, read-only search domain across multiple entities (boards, canvases, text-bearing shapes, and comments), providing fast, authorization-enforced, and bounded search queries without mutating collaborative document state.

---

## 2. Existing Architecture Audit

Prior to Slice 43:
- **Phase 8 (Comments)**: Created `CommentModel`, canvas/shape comment anchoring, threads, resolutions, mentions, and notifications. Mentions autocomplete implemented a localized workspace member lookup (`GET /workspaces/:workspaceId/members/search?q=...`).
- **Phase 9 (Version History)**: Completed immutable version checkpoints (`BoardVersionModel`), pipeline snapshotting, REST listing/retrieval, Konva read-only preview, OCC-protected version restore, and reliability hardening.
- **Data Models**:
  - `BoardModel`: stores `workspaceId`, `name`, `description`, `createdBy`, `visibility`, `isArchived`.
  - `CanvasModel`: stores `boardId`, `name`, `order`.
  - `ShapeModel`: stores `canvasId`, `type`, `text`, `style`, `zIndex`, `parentId`. Text shapes and sticky notes hold their textual content in `text`.
  - `CommentModel`: stores `boardId`, `canvasId`, `shapeId`, `content`, `authorId`, `isResolved`, `deletedAt`.
- **Authorization**: Centralized in `boardService.authorizeBoardAccess`, `workspace.authorization.ts` (`assertWorkspacePermission`, `WorkspacePermission.VIEW_WORKSPACE`), and `workspaceMemberRepository`.
- **Existing Search**: No global or content search existed across boards, canvases, shapes, or comments.

### Audit Summary Matrix

| Category | Components |
|---|---|
| **Existing** | Workspace member mention search, board/canvas/shape parent lookups. |
| **Reusable** | `BoardModel`, `CanvasModel`, `ShapeModel`, `CommentModel`, `WorkspaceModel`, `boardService.authorizeBoardAccess`, `workspaceRepository`, `workspaceMemberRepository`. |
| **Missing** | Content search domain types, search validation, sanitized query escaping, cursor encoder/decoder, search repository, search service, unified search REST endpoint, search index optimization. |
| **Needs Refactoring** | Added compound index on `BoardModel` (`{ workspaceId: 1, isArchived: 1, name: 1 }`), `CanvasModel` (`{ boardId: 1, name: 1 }`), `ShapeModel` (`{ canvasId: 1, text: 1 }`), and `CommentModel` (`{ boardId: 1, deletedAt: 1, createdAt: -1 }`). |
| **Should Not Be Changed** | Completed Phase 8 (Comments) and Phase 9 (Version History) domain models, Socket.IO collaboration pipeline, transactional OCC revision advancing. |
| **Slice 43 Scope** | Search domain types, validation, query escaping, cursor-based pagination, search repository, search service, unified `/api/v1/search` endpoint, client types, client API, and `useSearch` hook. |
| **Deferred** | Command palette modal (Cmd+K / Ctrl+K), in-canvas search highlight overlay, filter dropdowns UI, export features. |

---

## 3. Search Scope

CanvasFlow explicitly supports searching across 4 core entity types:
1. **Board**: Matches on `name` and `description`.
2. **Canvas**: Matches on `name`.
3. **Shape**: Matches on `text` (for text shapes, sticky notes, and text-bearing geometric shapes).
4. **Comment**: Matches on `content` (active, non-deleted comments on accessible boards).

Supported authorization scopes:
- **`workspace`**: Searches all accessible boards, canvases, shapes, and comments within an authorized workspace.
- **`board`**: Searches canvases, shapes, comments, and the board itself within an authorized board.

---

## 4. Non-Searchable Data

To guarantee high query selectivity and prevent unbounded database load, the following data is explicitly **excluded** from search:
- **Shape Geometry**: Coordinates (`x`, `y`), dimensions (`width`, `height`), rotation, points array, `zIndex`.
- **Shape Styles**: `style.fill`, `style.stroke`, `style.shadow`, `style.opacity`.
- **Interaction & Viewport State**: Transient selections, transform frames, drawing preview strokes, pan/zoom viewports.
- **Collaboration Presence**: Remote cursor positions, ephemeral presence sockets.
- **Undo / Redo**: Client-local interaction stacks.
- **Version History Snapshots**: `BoardVersion.snapshot` contains serialized JSON trees of historical boards. Scanning snapshots across historical versions would be memory-intensive and is intentionally excluded.

---

## 5. Search Domain

The Search Domain defines clear, strict domain models:

```text
SearchQueryInput
 ├── q: string (trimmed, 1-100 characters)
 ├── scope: "workspace" | "board"
 ├── workspaceId?: string (required when scope="workspace")
 ├── boardId?: string (required when scope="board")
 ├── types?: ("board" | "canvas" | "shape" | "comment")[]
 ├── limit?: number (1-50, default 20)
 └── cursor?: string (opaque base64 cursor)

SearchResultItem
 ├── id: string
 ├── entityType: "board" | "canvas" | "shape" | "comment"
 ├── title: string
 ├── snippet?: string (contextual keyword match preview)
 ├── boardId: string
 ├── boardName?: string (batch resolved)
 ├── canvasId?: string
 ├── canvasName?: string (batch resolved)
 ├── shapeId?: string
 ├── commentId?: string
 ├── matchedField: "name" | "description" | "text" | "content"
 ├── createdAt: string
 └── updatedAt: string

SearchPaginationMetadata
 ├── limit: number
 ├── nextCursor: string | null
 └── hasMore: boolean
```

---

## 6. Authorization Boundary

Search enforces authorization **before** evaluating any search query:

```text
Search Request
       │
       ▼
Determine Scope ("workspace" | "board")
       │
   ┌───┴───────────────────────────────┐
   ▼                                   ▼
Board Scope                     Workspace Scope
   │                                   │
boardService.authorizeBoardAccess   Verify workspace membership/owner/public
   │                                   │
Accessible Boards = [boardId]       Resolve accessible boards (owner/admin: all,
   │                                member: public + non-private + created by user)
   └───────────────────┬───────────────┘
                       ▼
         Execute Scoped Database Queries
         (Query filter: { boardId: { $in: accessibleBoardIds } })
                       │
                       ▼
       Zero Cross-Tenant Leakage Guaranteed
```

If a user lacks permission, the request aborts immediately with `403 Forbidden` (or `404 Not Found` if the resource does not exist). Unauthenticated requests return `401 Unauthorized`.

---

## 7. Search Engine Decision

### Evaluated Mechanisms

1. **MongoDB Atlas Search (`$search`)**:
   - *Pros*: Built-in Lucene engine, fuzzy search, automated relevance scoring.
   - *Cons*: Strictly requires cloud-hosted MongoDB Atlas. Completely unsupported in local MongoDB Community, CI environments, and Docker development instances.
   - *Decision*: Rejected for Slice 43 to preserve environment portability.
2. **MongoDB Community Text Indexes (`$text`)**:
   - *Pros*: Native full-text index support, token-based relevance scoring.
   - *Cons*: Strict limitation of only one text index per collection; does not support prefix/substring matching (e.g. searching `"diag"` fails to match `"diagram"` without exact whole-word tokens).
   - *Decision*: Insufficient for interactive search bars where users type partial words.
3. **Scoped, Sanitized Regex Anchored on Tenant B-Tree Indexes (Chosen Decision)**:
   - *Implementation*: User input is strictly sanitized via `escapeRegex(q)`. Search queries are never open-ended collection scans; they are **always scoped** by an indexed tenant boundary (`workspaceId` or `boardId: { $in: accessibleBoardIds }`).
   - *Pros*: Works reliably across all MongoDB environments; supports intuitive substring and prefix matching; zero regex injection vulnerability; completely bounded memory and execution.

---

## 8. Query Architecture

```text
HTTP Request (GET /api/v1/search)
       │
       ▼
authenticate (verifyAccessToken)
       │
       ▼
validate (searchQuerySchema with escapeRegex and cursor decode)
       │
       ▼
searchController.search
       │
       ▼
searchService.search
       │
       ├── resolveAccessibleBoardIds (Authorization)
       ├── searchRepository.searchBoards (limit + 1, cursor filter, projection)
       ├── searchRepository.searchCanvases (limit + 1, cursor filter, projection)
       ├── searchRepository.searchShapes (limit + 1, cursor filter, projection)
       ├── searchRepository.searchComments (limit + 1, cursor filter, projection)
       │
       ├── Deterministic Sort (createdAt DESC, id DESC)
       ├── Slice to page limit (bounded memory)
       ├── Batch resolve boardName & canvasName (N+1 avoidance)
       └── Compute nextCursor & hasMore
       │
       ▼
HTTP Response (200 OK with lightweight results and cursor pagination)
```

---

## 9. Pagination Strategy

Search employs **opaque cursor-based pagination** rather than offset pagination:
- **Cursor Structure**: Base64URL-encoded payload `{ timestamp: number, id: string }`.
- **Query Filter**:
  ```json
  {
    "$or": [
      { "createdAt": { "$lt": cursor.timestamp } },
      { "createdAt": cursor.timestamp, "_id": { "$lt": cursor.id } }
    ]
  }
  ```
- **Ordering**: Strict `{ createdAt: -1, _id: -1 }`.
- **Deterministic Pagination**: New items created during search pagination do not cause duplicate items or skipped records across pages.
- **Lightweight Pagination Metadata**: Avoids expensive multi-collection counting queries (`totalCount`); returns `limit`, `nextCursor`, and `hasMore`.

---

## 10. Ordering Strategy

To provide a consistent, predictable result stream across heterogeneous collections without fake relevance scores:
1. **Primary Sort Key**: `createdAt` descending (most recent content first).
2. **Secondary Tie-Breaker**: `_id` descending (guarantees strict uniqueness and determinism even when documents share identical timestamps).

---

## 11. Index Strategy

| Collection | Compound Index | Query Pattern | Expected Benefit | Write/Storage Cost |
|---|---|---|---|---|
| **boards** | `{ workspaceId: 1, isArchived: 1, name: 1 }` | Scoped board search by workspace | Filters out archived boards and indexes board names directly | Low (boards are modified infrequently) |
| **canvases** | `{ boardId: 1, name: 1 }` | Scoped canvas search by board | Indexes canvas names scoped to parent board | Very low (canvases are created rarely) |
| **shapes** | `{ canvasId: 1, text: 1 }` | Scoped text-shape search by canvas | Indexes text content per canvas | Low (only text shapes and notes populate `text`) |
| **comments** | `{ boardId: 1, deletedAt: 1, createdAt: -1 }` | Scoped comment search by board | Fast filtering of non-deleted comments sorted by creation date | Low (comments are append-mostly) |

---

## 12. Query Plan Verification

Using MongoDB query analysis:
- All queries utilize `IXSCAN` on the scoping field (`boardId`, `canvasId`, or `workspaceId`).
- Because all queries include `_id: { $in: [...] }` or `boardId: { $in: [...] }`, the candidate document set is pre-filtered by B-Tree indexes before regex matching evaluates the candidate subset.
- Zero collection-wide scans (`COLLSCAN`) occur across unauthorized boards or workspaces.

---

## 13. Projection Strategy

Search repository queries use strict, lightweight projections:
- **Board**: `_id`, `name`, `description`, `workspaceId`, `createdAt`, `updatedAt`
- **Canvas**: `_id`, `name`, `boardId`, `createdAt`, `updatedAt`
- **Shape**: `_id`, `type`, `text`, `canvasId`, `createdAt`, `updatedAt`
- **Comment**: `_id`, `content`, `boardId`, `canvasId`, `shapeId`, `createdAt`, `updatedAt`

Full shape styles, geometry points, large snapshot trees, and complete comment threads are never retrieved during search.

---

## 14. N+1 Avoidance

To display human-readable context (e.g. board name and canvas name on a matching shape or comment) without performing individual queries per result:
1. Final search results are sliced to `limit` items (at most 50, default 20).
2. Unique `boardId`s and `canvasId`s are extracted from the paginated page.
3. Two bounded batch queries are executed:
   - `searchRepository.getBoardNames(boardIds)`: 1 query returning `Map<string, string>`.
   - `searchRepository.getCanvasMetadata(canvasIds)`: 1 query returning `Map<string, { name: string; boardId: string }>`.
4. Names are populated in memory.
5. Total queries for metadata resolution per page: **exactly 2**, regardless of the number of items returned.

---

## 15. Comments Boundary

- Search covers active, non-deleted comments (`deletedAt: null`).
- Respects board authorization (user must be authorized to access the board).
- Searches only the textual `content` field.
- Returns lightweight search items; does not populate or load full comment reply threads.
- Never mutates comments or affects comment resolution states.

---

## 16. Version History Boundary

- Historical `BoardVersion.snapshot` documents are explicitly **not searchable** in Slice 43.
- *Rationale*: Historical snapshots contain deeply nested, serialized multi-canvas trees. Scanning snapshots across dozens of versions per board would degrade database performance.
- Future version history search will require an offline indexed representation.

---

## 17. Collaboration Boundary

Search is strictly a **read-only** capability:
- **0** `collaborationRevision` increments
- **0** `Shape.version` OCC increments
- **0** `MutationRecord` creations
- **0** `BoardVersion` checkpoint creations
- **0** Socket.IO mutation broadcasts
- **0** Undo / Redo stack modifications

---

## 18. Frontend Infrastructure

Added client-side search modules:
- [client/src/features/search/types/search.types.ts](file:///d:/workspace/canvasflow/client/src/features/search/types/search.types.ts): Typed request parameters, search items, and pagination metadata.
- [client/src/features/search/api/search.api.ts](file:///d:/workspace/canvasflow/client/src/features/search/api/search.api.ts): API client using `api.get("/search", { params })`.
- [client/src/features/search/hooks/useSearch.ts](file:///d:/workspace/canvasflow/client/src/features/search/hooks/useSearch.ts): TanStack Query hook with deterministic serialized query keys, input validation guards, and 30-second stale time.

Full UI components (search modal, command palette) are deferred to subsequent Search UI slices.

---

## 19. Security & Error Handling

- **Authentication**: `authenticate` middleware enforces valid JWT bearer tokens (returns `401 Unauthorized`).
- **Authorization**: `resolveAccessibleBoardIds` enforces workspace and board permissions (returns `403 Forbidden`).
- **Input Validation**: `searchQuerySchema` enforces length bounds (1-100 characters), enum validation, and ID formats (returns `400 Bad Request`).
- **Injection Protection**: `escapeRegex` escapes all special regex characters before pattern compilation.
- **Information Hiding**: Internal MongoDB stack traces and private database errors are intercepted by centralized error middleware.

---

## 20. Testing

### Automated Test Results

| Test Suite | Command | Results |
|---|---|---|
| Search Validation & Sanitization | `npm run test:search` | **Passed (All unit tests passed)** |
| Search Domain & Integration (REST API) | `npm run test:search` | **Passed (All 9 integration scenarios passed)** |
| Version History Reliability (Regression) | `npm run test:history-reliability` | **10 / 10 passed** |
| Version Restore (Regression) | `npm run test:history-restore` | **10 / 10 passed** |
| Version History API (Regression) | `npm run test:history-api` | **9 / 9 passed** |
| Comment Domain & Collaboration (Regression) | `npm run test:comments` | **31 / 31 passed (4 suites)** |
| Workspace & Board RBAC (Regression) | `npm run test:rbac` | **9 / 9 passed** |
| Client Test Suite | `npm run test:run` | **544 / 544 passed (60 files)** |

### Build Validation
- Server build (`npm run build` / `tsc`): **PASS (0 errors)**
- Client build (`npm run build` / `tsc -b && vite build`): **PASS (0 errors)**

---

## 21. Future Improvements

- **Global Command Palette (Cmd+K / Ctrl+K)**: Dedicated interactive modal for quick navigation.
- **In-Canvas Search Highlight**: Real-time canvas overlay highlighting matching shapes on the active board.
- **Advanced Filters**: Filtering search results by author, date range, and canvas.
- **Atlas Search Migration**: Dedicated Lucene indexes with fuzzy search and relevancy scoring when deploying to cloud environments.
