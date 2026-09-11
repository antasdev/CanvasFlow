# Slice 44 — Search API & Query Optimization

## 1. Purpose

Slice 44 hardens and optimizes the Search Domain established in Slice 43. Specifically, it resolves a critical cross-collection pagination defect in heterogeneous search, introduces a robust V2 composite cursor representing per-entity pagination progress, guarantees deterministic global ordering across multiple collections, optimizes authorization-related database queries through lightweight projections, verifies query execution plans via MongoDB `executionStats`, and maintains strict read-only and multi-tenant isolation guarantees.

---

## 2. Slice 43 Baseline

In Slice 43 (Search Domain / Infrastructure):
- Unified `GET /api/v1/search` endpoint was created supporting `workspace` and `board` scopes across boards, canvases, shapes, and comments.
- Sanitized regex matching was implemented (`escapeRegex(q)`) over scoped B-Tree index prefixes.
- Authorization was centralized in `resolveAccessibleBoardIds`.
- A single cursor payload was introduced: `{ timestamp: number, id: string }` encoded as Base64URL.
- Pagination sorted candidates in Node by `createdAt DESC, _id DESC`, taking the first `limit` items and using the last item's `createdAt` and `_id` as the cursor for the next page.
- N+1 queries were prevented by batch-resolving board and canvas names via 2 metadata queries per page.

---

## 3. Audit Findings & Root Cause Analysis

### The Cross-Entity Cursor Defect
In Slice 43, the cursor generated from the last item on a page was passed globally to all four entity queries (`boards`, `canvases`, `shapes`, `comments`):
```json
{
  "$or": [
    { "createdAt": { "$lt": cursor.timestamp } },
    { "createdAt": cursor.timestamp, "_id": { "$lt": cursor.id } }
  ]
}
```

#### Why This Failed
Each MongoDB collection generates ObjectIds independently. Comparing `_id < cursor.id` is only valid **within the exact same collection**.
When documents in different collections share the identical `createdAt` timestamp:
- Suppose a `Board` document establishes the cursor boundary with `_id = 0x607f...A` at timestamp `T`.
- On the next page, the `Shape` query evaluates `{ createdAt: T, _id: { $lt: 0x607f...A } }`.
- Because `0x607f...A` is a Board ObjectId, comparing it to Shape ObjectIds is completely arbitrary. Any Shape whose ObjectId happens to be lexically greater than `0x607f...A` is **dropped entirely** from search results. Conversely, Shapes already consumed could be **duplicated**.
- When multiple collections progress at different rates across pages, applying a single global ObjectId boundary breaks pagination correctness.

### Authorization Bottleneck
In `SearchService.resolveAccessibleBoardIds`, searching within a workspace triggered `boardRepository.findByWorkspaceId(wsObjId)`. This query lacked a projection, hydrating complete Mongoose `BoardDocument` models including descriptions, collaboration revision counters, and timestamps, even though the authorization filter only evaluated `_id`, `visibility`, and `createdBy`.

---

## 4. V2 Composite Cursor Architecture

Slice 44 introduces an entity-scoped V2 composite cursor representing **per-entity progress**:

```typescript
export interface EntityCursor {
  t: number;  // timestamp in milliseconds (integer)
  id: string; // 24-character hexadecimal ObjectId
}

export interface CompositeCursorPayload {
  v: 2;
  b?: EntityCursor; // Board cursor
  c?: EntityCursor; // Canvas cursor
  s?: EntityCursor; // Shape cursor
  m?: EntityCursor; // Comment cursor
}
```

### Cursor Semantics
- The V2 cursor represents: **"For each entity type, this is the last item already consumed into the response page."**
- It does **NOT** represent "the globally last item across all collections".
- **Independent Progression**: Consuming a Board item advances `b`. Consuming a Shape item advances `s`. If no Canvas items were consumed on a page, Canvas progress remains at its incoming cursor position (or undefined if not yet advanced).
- The cursor is encoded as an opaque Base64URL string. The client treats `cursor` as an opaque token and never inspects its internal structure.

---

## 5. Global Ordering Model

To guarantee deterministic ordering across heterogeneous collections without comparing ObjectIds across different collections, Slice 44 defines a three-tier ordering model:

```text
1. Primary: createdAt DESC (most recent first)
       ↓
2. Secondary (Cross-Entity Tie-Breaker): Entity Type Priority
       Board (1) > Canvas (2) > Shape (3) > Comment (4)
       ↓
3. Tertiary (Intra-Entity Tie-Breaker): _id DESC (within same entity collection)
```

### Implementation
```typescript
candidateItems.sort((a, b) => {
  const timeA = new Date(a.createdAt).getTime();
  const timeB = new Date(b.createdAt).getTime();
  if (timeA !== timeB) {
    return timeB - timeA;
  }
  const priorityA = ENTITY_TYPE_PRIORITY[a.entityType];
  const priorityB = ENTITY_TYPE_PRIORITY[b.entityType];
  if (priorityA !== priorityB) {
    return priorityA - priorityB;
  }
  return b.id.localeCompare(a.id);
});
```

Because `_id` is only used as a tie-breaker **within the same entity type**, cross-collection ObjectId comparisons are completely avoided.

---

## 6. Legacy V1 Cursor Compatibility

Clients possessing Slice 43 V1 cursors (`{ timestamp, id }`) are supported under strict compatibility semantics:
1. **Detection**: Cursors without `v: 2` containing numeric `timestamp` and valid 24-character hex `id` are identified as V1.
2. **Single-Entity Queries**: If only one entity type was requested (e.g. `types=board`), `_id < cursor.id` is valid within that single collection and is safely applied.
3. **Mixed-Entity Queries**: For multi-entity searches, `createdAt < cursor.timestamp` is applied as a timestamp cutoff without cross-collection `_id` comparison, preventing ObjectId corruption.
4. **Immediate Upgrade**: The response to any V1 request **always emits a V2 cursor**, immediately upgrading the client to per-entity pagination on subsequent pages.
5. **Documented Limitation**: V1 cursors cannot reconstruct omitted per-entity state; items created at the exact same millisecond across multiple collections may not maintain continuity until upgraded to V2.

---

## 7. Pagination Correctness Invariants

Slice 44 guarantees:
- **Zero Duplicates**: No item appears more than once across consecutive pages.
- **Zero Dropped Results**: Every matching document is returned across the full pagination stream.
- **Strict Determinism**: Re-running pagination produces the exact same sequence.
- **Identical Timestamp Resilience**: Verified across all 4 collections containing records with identical `createdAt` timestamps, tested with page limits of 1, 2, and 5 until exhaustion.

---

## 8. Candidate Retrieval Boundedness

Search queries are strictly bounded:
- Each of the 4 entity queries retrieves at most `limit + 1` candidates from MongoDB:
  $$\text{Maximum Candidates Retrieved} = 4 \times (\text{limit} + 1)$$
- For default `limit = 20`: at most $4 \times 21 = 84$ candidate documents are loaded into memory.
- For maximum `limit = 50`: at most $4 \times 51 = 204$ candidate documents are loaded into memory.
- An unbounded collection scan or loading all matching documents is strictly prohibited.

---

## 9. Authorization Query Optimization

### Problem
Previously, `resolveAccessibleBoardIds` invoked `boardRepository.findByWorkspaceId(wsObjId)`, hydrating complete Mongoose `BoardDocument` models.

### Solution
Added `boardRepository.findBoardAuthSummaries(wsObjId)`:
```typescript
BoardModel.find({ workspaceId, isArchived: false })
  .select({ _id: 1, visibility: 1, createdBy: 1 })
  .lean<BoardAuthSummary[]>()
  .exec();
```

### Impact
- **Data Transfer**: Reduced payload per board document from ~500 bytes to ~60 bytes (88% reduction in memory and deserialization overhead).
- **Mongoose Overhead**: `.lean()` avoids hydrating full Mongoose document instances, change tracking, and virtuals.
- **Semantics**: Preserves 100% of existing authorization rules (workspace owner, admin/member roles, board creator, public board visibility).

---

## 10. Query Plan Verification (`executionStats`)

Using the internal diagnostic helper `searchRepository.explainQuery`:

| Collection | Filter | Sort | Measured Plan Stages | keysExamined | docsExamined | nReturned |
|---|---|---|---|---|---|---|
| **boards** | `{ _id: { $in: [...] }, isArchived: false, $or: [...] }` | `{ createdAt: -1, _id: -1 }` | `[SORT, FETCH, IXSCAN]` | 3 | 3 | 3 |
| **canvases** | `{ boardId: { $in: [...] }, name: regex }` | `{ createdAt: -1, _id: -1 }` | `[SORT, FETCH, IXSCAN]` | 3 | 3 | 3 |
| **shapes** | `{ canvasId: { $in: [...] }, text: regex }` | `{ createdAt: -1, _id: -1 }` | `[SORT, FETCH, IXSCAN]` | 3 | 3 | 3 |
| **comments** | `{ boardId: { $in: [...] }, deletedAt: null, content: regex }` | `{ createdAt: -1, _id: -1 }` | `[SORT, FETCH, IXSCAN]` | 3 | 3 | 3 |

*Environment*: Local MongoDB test instance. All queries leverage B-Tree index scans (`IXSCAN`) on scoping fields (`_id`, `boardId`, `canvasId`), examining zero unauthorized documents.

---

## 11. Minimal Projections

Projections intentionally exclude large or non-searchable document fields:
- **Board**: Projections retrieve only `_id, name, description, workspaceId, createdAt, updatedAt`.
- **Canvas**: Projections retrieve only `_id, name, boardId, createdAt, updatedAt`.
- **Shape**: Projections retrieve only `_id, type, text, canvasId, createdAt, updatedAt`. Excludes `points`, `style`, `shapeConfig`, `connector`, `zIndex`, `rotation`, and geometry coordinates.
- **Comment**: Projections retrieve only `_id, content, boardId, canvasId, shapeId, createdAt, updatedAt`. Excludes `mentions` array and reply threads.

---

## 12. N+1 Avoidance

Batch metadata enrichment guarantees that resolving board and canvas names for search result snippets requires exactly 2 database queries per page, regardless of result count:
1. Extract unique `canvasId`s and `boardId`s from the paginated page items ($\le \text{limit}$).
2. Execute `searchRepository.getCanvasMetadata(canvasIds)` (1 batch query).
3. Execute `searchRepository.getBoardNames(boardIds)` (1 batch query).
4. Populate metadata in memory via HashMaps.

---

## 13. Read-Only Invariants

Search is strictly an HTTP read operation with zero collaborative side-effects:
- **0** `MutationRecord` documents created
- **0** `BoardVersion` checkpoints created
- **0** `collaborationRevision` increments
- **0** `Shape.version` OCC counter increments
- **0** Socket.IO mutation events broadcast

---

## 14. Automated Test Matrix

| Test Suite | Command | Result |
|---|---|---|
| Search Validation & Sanitization | `npm run test:search` | **All Passed** (14 regex metacharacters, V2 encode/decode, V1 compatibility, schema rejections) |
| Search API Integration | `npm run test:search` | **9 / 9 Passed** (Auth, Multi-entity, Exclusions, V2 pagination, N+1 batching, Read-only) |
| Search Optimization & Correctness | `npm run test:search-optimization` | **8 / 8 Passed** (Identical timestamps across 4 collections, Limit 1/2 pagination, Explain plans, Projections) |
| Version History Reliability (Regression) | `npm run test:history-reliability` | **10 / 10 Passed** |
| Version Restore (Regression) | `npm run test:history-restore` | **10 / 10 Passed** |
| Version History API (Regression) | `npm run test:history-api` | **9 / 9 Passed** |
| Comment Collaboration (Regression) | `npm run test:comments` | **31 / 31 Passed (4 suites)** |
| Workspace & Board RBAC (Regression) | `npm run test:rbac` | **9 / 9 Passed** |
| Client Test Suite | `npm run test:run` (in client) | **544 / 544 Passed (60 files)** |

### Build Validation
- **Server Build**: `npm run build` (`tsc`) -> **PASS (0 errors)**
- **Client Build**: `npm run build` (`tsc -b && vite build`) -> **PASS (0 errors)**

---

## 15. Known Limitations & Future Improvements

1. **Regex Scalability**: Substring regex matching (`.*query.*`) requires evaluating regexes across candidates within the scoped index prefix. For workspaces with hundreds of thousands of shapes, migrating to MongoDB Atlas Search (Lucene) or dedicated inverted index search will provide sub-millisecond full-text queries and relevance scoring.
2. **MongoDB Planner Environment Differences**: Query execution plans can vary based on collection cardinality and index selectivity. In small collections, MongoDB's planner may occasionally prefer collection scans over index scans if statistics indicate lower cost.
3. **Workspace Board Resolution Scaling**: In enterprise workspaces with tens of thousands of boards, `findBoardAuthSummaries` may benefit from cursor pagination or indexed sub-queries directly within the shape and comment query filters.
