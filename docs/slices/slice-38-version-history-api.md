# Slice 38 — Version History API

## Purpose
Slice 38 provides a production-grade, secure, deterministic REST API for reading Version History checkpoints in CanvasFlow. It exposes cursor-paginated lightweight version summaries for board timelines and detailed single-version historical snapshots without leaking sensitive internal fields, mutating live canvas state, or introducing unnecessary overhead.

---

## Existing Architecture Audit

### Slice 36 (Domain Foundation)
- **Domain Entities & Types**: `IBoardVersion`, `IVersionSnapshot`, `IVersionSummary`, `VersionTrigger`.
- **Validation**: Strict Zod schemas (`versionQuerySchema`, `versionParamSchema`, `versionIdParamSchema`).
- **Mappers & DTOs**: `HistoryMapper` transforming Mongoose documents into sanitized API response DTOs (`VersionResponseDto`, `VersionSummaryResponseDto`).
- **Repository**: Atomic monotonic `versionNumber` allocation, cursor-based pagination, lean queries.
- **Service**: RBAC resolution via `boardService.authorizeBoardAccess` and IDOR isolation.

### Slice 37 (History Pipeline)
- **Authoritative Integration**: Post-commit auxiliary invocation from `MutationManager`.
- **Snapshot Construction**: `SnapshotBuilder` capturing all canvases, shapes, groups, and connectors deterministically.
- **Failure Isolation**: Auxiliary errors do not rollback committed MongoDB transactions.

### Slice 38 Additions & Optimizations
- **Repository Projection Optimization**: `listByBoard` explicitly projects out `{ "snapshot.canvases.shapes": 0 }`, minimizing network and memory overhead on list endpoints.
- **Controller Type Safety**: Strict type assertions on validated queries without unsafe type escapes.
- **Dedicated REST API Test Suite**: Comprehensive 9-test suite in [`history.api.test.ts`](file:///d:/workspace/canvasflow/server/src/modules/history/tests/history.api.test.ts).

---

## API Endpoints

### 1. List Board Versions
```http
GET /api/v1/boards/:boardId/versions
```
**Query Parameters**:
| Parameter | Type | Default | Constraints | Description |
|---|---|---|---|---|
| `limit` | integer | 20 | 1 ≤ limit ≤ 100 | Number of version records to return |
| `cursor` | integer | undefined | > 0 | Version number upper bound (`versionNumber < cursor`) |
| `trigger` | string | undefined | `"manual" \| "automatic"` | Filter by creation trigger |

**Response Format** (`200 OK`):
```json
{
  "success": true,
  "data": [
    {
      "id": "6aa2894ae1c2d8280391ae31",
      "boardId": "6aa28949e1c2d8280391ae24",
      "versionNumber": 5,
      "name": "Final Release",
      "description": "Description for version 5",
      "trigger": "manual",
      "createdBy": "6aa28949e1c2d8280391ae20",
      "author": {
        "id": "6aa28949e1c2d8280391ae20",
        "fullName": "API User Owner",
        "email": "api_owner_1773312061324_9v3m1@example.com"
      },
      "collaborationRevision": 15,
      "changeSummary": {
        "shapesAdded": 0,
        "shapesModified": 0,
        "shapesDeleted": 0
      },
      "canvasCount": 2,
      "shapeCount": 5,
      "isNamed": true,
      "createdAt": "2026-09-10T10:41:01.324Z"
    }
  ],
  "pagination": {
    "nextCursor": 4,
    "hasMore": true,
    "totalCount": 5
  }
}
```

### 2. Get Single Historical Version
```http
GET /api/v1/boards/:boardId/versions/:versionId
```
**Response Format** (`200 OK`):
```json
{
  "success": true,
  "data": {
    "id": "6aa2894ae1c2d8280391ae31",
    "boardId": "6aa28949e1c2d8280391ae24",
    "versionNumber": 5,
    "name": "Final Release",
    "description": "Description for version 5",
    "trigger": "manual",
    "createdBy": "6aa28949e1c2d8280391ae20",
    "author": {
      "id": "6aa28949e1c2d8280391ae20",
      "fullName": "API User Owner",
      "email": "api_owner_1773312061324_9v3m1@example.com"
    },
    "collaborationRevision": 15,
    "snapshot": {
      "boardId": "6aa28949e1c2d8280391ae24",
      "boardName": "Design Board A",
      "canvasCount": 2,
      "shapeCount": 5,
      "canvases": [
        {
          "canvasId": "6aa28949e1c2d8280391ae25",
          "name": "Page 1",
          "order": 1,
          "backgroundColor": "#FFFFFF",
          "shapes": [
            {
              "id": "6aa28949e1c2d8280391ae27",
              "canvasId": "6aa28949e1c2d8280391ae25",
              "type": "group",
              "x": 100,
              "y": 100,
              "width": 400,
              "height": 300,
              "zIndex": 1,
              "version": 1
            },
            {
              "id": "6aa28949e1c2d8280391ae28",
              "canvasId": "6aa28949e1c2d8280391ae25",
              "type": "rectangle",
              "x": 20,
              "y": 20,
              "width": 120,
              "height": 80,
              "zIndex": 2,
              "parentId": "6aa28949e1c2d8280391ae27",
              "style": { "fill": "#3B82F6", "stroke": "#1D4ED8", "strokeWidth": 2 },
              "version": 1
            }
          ]
        }
      ]
    },
    "isNamed": true,
    "createdAt": "2026-09-10T10:41:01.324Z"
  }
}
```

---

## Authentication
Authentication uses the project's standard `authenticate` middleware. The JWT token is read from the `Authorization: Bearer <token>` header or `access_token` cookie and validates the `userId` in `req.user`. Anonymous or invalid requests are rejected with `401 Unauthorized`.

---

## Authorization
1. **Workspace Membership & RBAC**: `boardService.authorizeBoardAccess(userId, boardId, BoardPermission.VIEW_BOARD)` resolves:
   - Board existence.
   - User's membership in the board's parent workspace (`WorkspaceMemberModel`).
   - Verifies the user has at least `VIEWER` permission (which satisfies `VIEW_BOARD`).
   - Outsiders are rejected with `403 Forbidden`.
2. **Board Ownership Decoupling**: Any authorized workspace member with `VIEW_BOARD` permission can inspect the history of that board, regardless of who created specific version checkpoints.
3. **IDOR & Cross-Board Isolation**: In `historyService.getVersionById(boardId, versionId, userId)`:
   - Verifies the user has access to `boardId`.
   - Checks that the fetched `BoardVersion` has `doc.boardId.toString() === boardId`.
   - If a valid `versionId` belonging to Board B is requested under Board A's URL, the service returns `404 Not Found`, completely preventing cross-board resource enumeration.

---

## Pagination
- **Strategy**: Keyserver cursor pagination using monotonic integer `versionNumber`.
- **Query Filter**: `{ boardId, versionNumber: { $lt: cursor } }`.
- **Ordering**: `{ versionNumber: -1 }` (newest to oldest).
- **Lookahead**: Queries `limit + 1` records. If `results.length > limit`, `hasMore = true` and `nextCursor = results[limit - 1].versionNumber`.
- **Determinism**: Monotonic version numbers guarantee zero duplicate entries and zero omitted versions across sequential pages.

---

## DTOs & Snapshot Handling
- **Summary DTO (`VersionSummaryResponseDto`)**: Omitted full shape snapshots while retaining `shapeCount`, `canvasCount`, `changeSummary`, and populated `author` metadata.
- **Detail DTO (`VersionResponseDto`)**: Returns the full snapshot with serialized canvas trees, shape hierarchies (`parentId`), styles, connector endpoints, and geometry.
- **Projection Efficiency**: MongoDB `{ "snapshot.canvases.shapes": 0 }` projection ensures the database does not read or serialize heavy shape payload arrays for list queries.

---

## Error Handling
| HTTP Status | Trigger Condition |
|---|---|
| `400 Bad Request` | Malformed ObjectId (`boardId`, `versionId`), invalid `limit` (< 1 or > 100), malformed `cursor`, or invalid `trigger`. |
| `401 Unauthorized` | Missing or invalid JWT credentials. |
| `403 Forbidden` | Authenticated user is not a member of the workspace containing the board. |
| `404 Not Found` | Board does not exist, version does not exist, or version belongs to a different board (cross-board IDOR). |
| `500 Internal Server Error` | Centralized error handler captures unhandled runtime exceptions without leaking DB traces. |

---

## Security Invariants
- **Authentication Required**: All version routes are protected by `authenticate`.
- **RBAC Enforced**: `BoardPermission.VIEW_BOARD` verified before database queries.
- **IDOR Protection**: Version records cannot be accessed through mismatched `boardId` URLs.
- **Input Validation**: Handled by strict Zod schemas before hitting controllers.
- **Information Disclosure**: Mongo errors and internal query structures are never leaked to clients.

---

## Read-Only Boundary
The GET endpoints are strictly read-only and have zero side effects:
- `0` MongoDB document mutations.
- `0` increments to `Board.collaborationRevision`.
- `0` increments to `Shape.version`.
- `0` `MutationRecord`s created.
- `0` Socket.IO mutation emissions.

---

## Testing Summary
- **API Tests ([`history.api.test.ts`](file:///d:/workspace/canvasflow/server/src/modules/history/tests/history.api.test.ts))**: 9 tests passed.
- **Domain Tests ([`history.domain.test.ts`](file:///d:/workspace/canvasflow/server/src/modules/history/tests/history.domain.test.ts))**: 9 tests passed.
- **Pipeline Tests ([`history.pipeline.test.ts`](file:///d:/workspace/canvasflow/server/src/modules/history/tests/history.pipeline.test.ts))**: 10 tests passed.
- **RBAC Tests ([`rbac.test.ts`](file:///d:/workspace/canvasflow/server/src/modules/workspace/tests/rbac.test.ts))**: 9 tests passed.
- **Comments Tests**: 31 tests passed.
- **Notifications Tests**: 18 tests passed.
- **Client Vitest Suite**: 51 test files (506 tests) passed.
- **TypeScript Build (`tsc`)**: Compiled cleanly with zero errors.

---

## Architectural Decisions

### Decision 1: Projection-Level Snapshot Omission in List Endpoint
- **Problem**: Loading thousands of full shape arrays for version list timelines causes severe memory overhead and sluggish response times.
- **Decision**: Repository projects out `snapshot.canvases.shapes` on list queries.
- **Trade-off**: Requires a dedicated single-version endpoint for full snapshots.
- **Reason**: List endpoints only need counts and metadata for UI timelines; full shapes are only needed during inspection or preview.

### Decision 2: Monotonic `versionNumber` Cursor vs `_id` Cursor
- **Problem**: Multi-field cursor (`createdAt` + `_id`) requires compound cursor string encoding.
- **Decision**: Use board-scoped strictly monotonic integer `versionNumber` (`versionNumber < cursor`).
- **Trade-off**: Requires integer parsing in query params.
- **Reason**: Clean, deterministic, human-readable pagination with natural tie-breaker behavior.

---

## Future Improvements (Deferred to Slice 39+)
- **Slice 39**: Version History UI (Timeline sidebar, version cards, snapshot diff preview).
- **Slice 40**: Read-only Historical Canvas Preview mode.
- **Slice 41**: Restore historical version endpoint and mutation pipeline.
- **Slice 42**: History compression, snapshot pruning, and background archival workers.
