# Slice 49 — Search & Export Reliability & Polish

## Purpose

Slice 49 is the final slice of **Phase 10 — Search & Export** in CanvasFlow. It delivers a comprehensive reliability, regression, security, memory-safety, accessibility, and integration-polish audit across both the Search system (Slices 43–45) and the Export system (Slices 46–48).

Without expanding the system architecture or adding speculative dependencies, Slice 49 ensures:
1. Search pagination, cursor encoding/decoding, regex escaping, and query optimization are strictly deterministic, tenant-isolated, and safe.
2. Export operations are strictly protected against double-trigger races, cancelable with immediate AbortSignal propagation, memory-safe in object URL lifecycles, and resilient against background state churn.
3. Search and Export modal dialogs and canvas shortcuts arbitrate cleanly without mutual interference, focus leaks, or background document mutations.
4. Both systems remain strictly read-only with zero persistence or collaboration side effects.

---

## Audit

### Existing & Reusable
* **Search Architecture**:
  * MongoDB text queries & IXSCAN indexes (`Board`, `Canvas`, `Shape`, `Comment`).
  * V2 composite cursor pagination with V1 backward-compatibility fallback.
  * Bounded candidate retrieval ($limit + 1$ per collection, $\le 4 \times (limit + 1)$ in memory).
  * Batched metadata enrichment (2 batched queries per page instead of N+1 per-entity queries).
  * Global `SearchDialog` accessible via `Ctrl/Cmd + K`.
* **Export Architecture**:
  * Authoritative `exportService.exportShapes(...)` facade.
  * Client-side offscreen rendering processors (`png.exporter`, `jpeg.exporter`, `svg.exporter`, `pdf.exporter`).
  * `ExportDialog` modal accessible via `Ctrl/Cmd + Shift + E` and canvas header dock.
  * Deterministic z-index geometry and bounding-box calculators.

### Verified Correct
* **Identical Timestamps**: Pagination across single and mixed entity types with identical `createdAt` values remains strictly deterministic via secondary entity priority (`Board=1`, `Canvas=2`, `Shape=3`, `Comment=4`) and tertiary `_id` tie-breaking.
* **Bounded Candidates**: Total in-memory candidate retrieval is strictly bounded; neither backend queries nor pagination pull unbounded collections into memory.
* **Search Read-Only Boundary**: Repeated search queries generate 0 `MutationRecord` entries, 0 `BoardVersion` increments, 0 collaboration revision updates, and 0 socket mutation emissions.
* **Export Dimension Safety**: Service-level dimension validation strictly enforces `MAX_EXPORT_PIXEL_DIMENSION` (16,384px) independently of UI controls.
* **Browser Download Cleanup**: `triggerBlobDownload` revokes blob object URLs cleanly via deferred `URL.revokeObjectURL(url)` timers.

### Problems Confirmed & Fixed
1. **Empty Cursor Handling (`search.validation.ts` & `search.controller.ts`)**:
   * *Problem*: When clients passed `?cursor=` or whitespace, Zod validation failed with 400 Bad Request because `decodeCursor("")` returned null.
   * *Fix*: Coerced empty and whitespace-only cursor strings to `undefined` at the validation and controller boundaries, allowing first-page evaluation safely.
2. **Search Stale Requests & Cancellation (`search.api.ts` & `useInfiniteSearch.ts`)**:
   * *Problem*: TanStack Query's provided `signal` in `queryFn` was not accepted by `searchApi.search` or passed to Axios `api.get`.
   * *Fix*: Extended `searchApi.search(params, signal?)` and forwarded `signal` to Axios, ensuring superseded search requests are cancelled immediately.
3. **Filename Sanitization Edge Cases (`download.utils.ts`)**:
   * *Problem*: Filenames containing trailing dots, unprintable ASCII control characters (`\x00-\x1f\x7f`), or excessive length (>128 chars) could trigger filesystem or browser download failures.
   * *Fix*: Hardened `sanitizeFilename` regexes to strip control characters and trailing dots, and capped basename length to 128 characters.
4. **Export Double Invocation Race (`ExportDialog.tsx`)**:
   * *Problem*: Rapid clicks or Enter key presses before React state updated could trigger concurrent export runs.
   * *Fix*: Introduced an immediate synchronous ref guard (`isExportingRef.current`) alongside React state.
5. **Export State Churn on Background Updates (`ExportDialog.tsx`)**:
   * *Problem*: An open `ExportDialog` reset user selections (format, scale, custom filename) whenever canvas selections or background state changed.
   * *Fix*: Tracked the modal transition (`closed -> open`) via `prevIsOpenRef`, preserving user choices while the dialog remains open.
6. **Cancellation & UI Recovery during Export (`ExportDialog.tsx`)**:
   * *Problem*: Cancel and close buttons were disabled while exporting, preventing users from aborting long exports.
   * *Fix*: Kept Cancel and Close controls active during export, wiring them to `abortControllerRef.current.abort()` and resetting state cleanly in `finally`.
7. **Modal Shortcut Mutual Exclusion & Canvas Suppression (`SearchDialog.tsx`, `ExportDialog.tsx`, `CanvasEditor.tsx`, `useCanvasClipboard.ts`)**:
   * *Problem*: Pressing `Ctrl+K` while Export was open or `Ctrl+Shift+E` while Search was open could open both modals. Canvas keyboard shortcuts (Delete, Backspace, Clipboard) could trigger document mutations while modals were open.
   * *Fix*: Suppressed `Ctrl+K` if Export is open, suppressed `Ctrl+Shift+E` if Search is open, suppressed shortcuts inside any `[role="dialog"]`, and suppressed canvas space-pan, delete, and clipboard operations whenever either modal is open.

---

## Search Reliability

### Cursor Correctness & Identical Timestamps
* Pagination operates on V2 composite cursors containing per-entity progress:
  ```json
  {
    "v": 2,
    "b": { "t": 1789128000000, "id": "6aa3c56ea7adc8af66accd3f" },
    "c": { "t": 1789128000000, "id": "6aa3c56ea7adc8af66accd42" }
  }
  ```
* In-flight pagination across 12 items spanning 4 collections with identical millisecond timestamps (`createdAt = 1789128000000`) verified with both `limit=1` and `limit=2`:
  * Duplicates: **0**
  * Dropped/skipped items: **0**
  * Order: Strictly deterministic (`createdAt DESC -> entityPriority ASC -> _id DESC`).

### Authorization & Tenant Isolation
* Queries in `search.repository.ts` enforce tenant scoping via `{ tenantId }` and `{ workspaceId }` at the database level.
* Board-level access checks utilize `findBoardAuthSummaries` to evaluate permissions (`OWNER`, `ADMIN`, `EDITOR`, `VIEWER`, private board membership) before returning results.
* Search results never leak across tenant boundaries or private boards.

### Regex Metacharacter Safety
* User queries pass through `escapeRegex(q)`, escaping all 14 special regex metacharacters: `\`, `.`, `*`, `+`, `?`, `(`, `)`, `[`, `]`, `{`, `}`, `^`, `$`, `|`.
* Verified via HTTP test: querying `[Special] (Test.*+?^{}|)` executes literal string matching with zero regex injection vulnerability.

### Candidate Bounds & N+1 Prevention
* Retrieval queries query MongoDB with `limit(limit + 1)` per collection. Total candidates loaded in memory cannot exceed $4 \times (limit + 1)$.
* Metadata enrichment occurs in two batch queries per page:
  1. `boardRepository.findBoardAuthSummaries` (batched board metadata & authorization).
  2. `canvasRepository.findCanvasSummaries` (batched canvas metadata).
  Zero N+1 per-entity database queries exist.

---

## Export Reliability

### Duplicate Invocation Protection
* Export button clicks and keypresses are protected by `isExportingRef.current`.
* If an export is currently in progress, any subsequent trigger is ignored synchronously before React schedules a state update.

### Cancellation & UI Recovery
* An `AbortController` is allocated for each export session.
* Clicking **Cancel** or the modal close button aborts in-flight operations via `abortControllerRef.current.abort()`.
* Processors observe `signal.aborted` and throw `ExportError(ABORTED)`. The dialog handles the error gracefully, resets the export state in `finally`, and leaves the dialog in a recoverable state without unwanted downloads or stuck loaders.

### Filename Sanitization & Download Cleanup
* Basenames are stripped of path traversals (`..`, `/`, `\`), illegal characters (`:*?"<>|`), control characters (`0x00-0x1F`, `0x7F`), and trailing dots.
* Long names are safely truncated to a 128-character basename limit.
* `triggerBlobDownload` appends a hidden anchor, dispatches `.click()`, removes the anchor, and schedules `URL.revokeObjectURL(url)` after a 100ms safety window to prevent memory leaks.

---

## Shortcut Arbitration & Canvas Suppression

| Action | Search Open | Export Open | Canvas Active |
|---|---|---|---|
| `Ctrl/Cmd + K` | Active (navigates/closes) | **Suppressed** | Opens Search |
| `Ctrl/Cmd + Shift + E` | **Suppressed** | Active (toggles) | Opens Export |
| `Delete` / `Backspace` | Handled by input | Handled by input | Deletes selected shapes |
| `Ctrl/Cmd + C` / `V` / `D` | Native text copy/paste | Native text copy/paste | Canvas shape clipboard |
| `Space` (Pan) | **Suppressed** | **Suppressed** | Activates hand pan tool |

---

## Memory Safety

* **Object URLs**: Created blobs are converted via `URL.createObjectURL` and revoked after download.
* **Event Listeners**: All `window.addEventListener("keydown", ...)` subscriptions in `SearchDialog` and `ExportDialog` are registered once with proper cleanup returns in `useEffect`.
* **AbortControllers**: Created per operation, aborted on unmount or cancellation, and garbage-collected upon promise resolution.

---

## Persistence Boundary

Both Search and Export are strictly read-only subsystems:
* `MutationRecord` changes: **0**
* `BoardVersion` changes: **0**
* `collaborationRevision` increments: **0**
* Socket.IO mutation emissions: **0**
* Undo/redo history mutations: **0**

---

## Architectural Decisions

| Decision | Alternative Considered | Trade-off | Reason |
|---|---|---|---|
| Ref guard in `ExportDialog` | Disabling button via React state alone | Minimal ref state | React state updates are asynchronous; rapid double clicks or keypresses can trigger two concurrent exports before state updates. |
| In-browser signal propagation | Dedicated queue/worker pool | Direct Axios signal cancellation | TanStack Query already manages query signals; threading `signal` to `api.get` avoids complex state machines. |
| Session boundary tracking | Resetting on any dependency change | Re-evaluating defaults on open | Preserves user adjustments while tuning parameters before downloading. |

---

## Intentionally Deferred

* **Redis / Distributed Caching**: Not required. Bounded queries, covered index scans, and client-side TanStack Query provide sub-millisecond retrieval without distributed state.
* **Server-side Export Queue / Worker Threads**: Not required. Client-side canvas/SVG/PDF pipelines efficiently render offscreen vectors and bitmaps without server memory pressure.
* **AI Semantic Search / Atlas Search**: Not required. Strict regex and compound indexed searches fulfill all Phase 10 performance and capability contracts.

---

## Verification & Test Results

### Client Unit & Integration Tests (`npm run test:run`)
* **78 test files passed** (78/78).
* **645 tests passed** (645/645).
* 0 test failures, 0 regressions.

### Server Search Tests (`npm run test:search`)
* `search.validation.test.ts`: **Passed** (Regex safety, V2 cursors, V1 fallback, empty cursor handling).
* `search.api.test.ts`: **Passed** (HTTP route contracts, authorization, pagination).
* `search.optimization.test.ts`: **Passed** (Identical timestamps across 12 items, limit=1 & limit=2, single entity exhaustion, covered index plans).

### Production Builds
* Client (`tsc -b && vite build`): **PASS** (Zero TypeScript errors, production bundle built).
* Server (`tsc`): **PASS** (Zero TypeScript errors).
