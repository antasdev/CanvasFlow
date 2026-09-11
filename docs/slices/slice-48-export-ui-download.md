# Slice 48 — Export UI & Download

## Purpose

Slice 48 delivers the user-facing **Export UI and Browser Download workflow** for CanvasFlow. Connecting user interactions in the whiteboard editor to the Slice 46 domain preparation and Slice 47 processing pipeline, this slice provides an accessible, format-adaptive export modal dialog, trigger buttons, keyboard shortcut navigation, and a memory-safe browser download lifecycle.

---

## Existing Architecture Audit

### Reused
* **Slice 46 Domain**:
  * Types: `ExportFormat`, `ExportScope`, `ExportBackground`, `ExportOptions`, `ExportErrorCode`.
  * Constants: `SUPPORTED_EXPORT_FORMATS`, `SUPPORTED_EXPORT_SCOPES`, `SUPPORTED_EXPORT_BACKGROUNDS`, `DEFAULT_EXPORT_SCALE`, `DEFAULT_EXPORT_QUALITY`, `DEFAULT_CANVAS_BACKGROUND_COLOR`.
  * Validation & Error: `ExportError`, `validateExportOptions`, `validateExportDimensions`.
* **Slice 47 Processing**:
  * `exportService`: Authoritative export orchestration facade.
  * `ExportResult`: Strongly-typed result object (`blob`, `mimeType`, `format`, `width`, `height`, `pixelWidth`, `pixelHeight`, `filename`).
* **Canvas State**:
  * `useCanvasStore`: `shapes`, `selectedShapeIds`, `zoom`, `pan`.
* **Global Application Shell**:
  * `ProtectedRoute.tsx`: Global modal mounting alongside `SearchDialog`.
  * `BoardCanvasPage.tsx`: Top-right action dock mounting `<ExportButton />`.
  * `KeyboardShortcutsModal.tsx`: Keyboard cheatsheet documentation.

---

## Export UI Architecture

The export UI is organized as a unified, decoupled workflow:

```text
User Action (Export Button or Ctrl+Shift+E)
                │
                ▼
      useExportDialogStore
                │
                ▼
           ExportDialog
 ┌──────────────┼──────────────┬──────────────┐
 ▼              ▼              ▼              ▼
Scope         Format       Background       Scale
(Canvas /     (PNG /       (Transparent /   (0.5x / 1x /
Selection /   JPEG /       Canvas /         2x / 3x)
Viewport)     SVG / PDF)   Solid)
                │
                ├── Quality (JPEG only)
                └── Filename & Extension badge
                │
                ▼
           Validation
                │
                ▼
       ExportService.exportShapes(...)
                │
                ▼
           ExportResult
                │
                ▼
       triggerBlobDownload(...)
                │
                ▼
   Object URL Cleanup (Revocation)
```

---

## Scope Selection

* **Full Canvas**: Exports all shapes present on the canvas. Always available when document has shapes.
* **Selection**: Available only when one or more shapes are currently selected on the canvas. If no shapes are selected, the button is disabled with an explanatory tooltip and subtitle. If shapes are selected when the dialog opens, Selection scope defaults to active.
* **Current View (Viewport)**: Exports the area currently visible on the screen based on canvas `zoom` and `pan` parameters.

---

## Format Selection & Adaptive Configuration

* **PNG**:
  * Background: `transparent`, `canvas`, or `solid`.
  * Scale: `0.5x`, `1x`, `2x`, `3x`.
  * Quality: Hidden (lossless).
* **JPEG**:
  * Background: `canvas` or `solid`. (Transparent option is hidden because JPEG lacks alpha transparency support; explanatory guidance is displayed).
  * Quality: Visible slider from `10%` to `100%` (default `90%`).
  * Scale: `0.5x`, `1x`, `2x`, `3x`.
* **SVG**:
  * Background: `transparent`, `canvas`, or `solid`.
  * Quality: Hidden (pure vector XML).
* **PDF**:
  * Background: `canvas`, `solid`, or `transparent`.
  * Scale: `0.5x`, `1x`, `2x`, `3x`.
  * Quality: Hidden (vector PDF 1.4).

---

## Download Architecture

Download mechanics are strictly decoupled from export processing:

```text
ExportResult (Blob)
        │
        ▼
URL.createObjectURL(blob)
        │
        ▼
Hidden Anchor Click (<a download="filename.ext" href="blob:...">)
        │
        ▼
DOM Cleanup (removeChild)
        │
        ▼
URL.revokeObjectURL(url) via asynchronous setTimeout
```

### Memory Safety & URL Revocation
`triggerBlobDownload` schedules `URL.revokeObjectURL` after dispatching the download click, ensuring that:
1. The browser download manager has successfully accessed the in-memory Blob.
2. The blob URL is not leaked in browser memory.
3. No persistent download state or Blob references are retained.

---

## Cancellation

* An `AbortController` is initialized on every export execution.
* The `AbortSignal` is passed to `exportService.exportShapes(...)`.
* If the user clicks **Cancel** or presses **Escape** during active export:
  1. `abortController.abort()` is called.
  2. The export processor halts rendering.
  3. No browser download is triggered.
  4. An info toast (`"Export cancelled"`) is displayed.
  5. The dialog UI cleanly resets its loading state without getting stuck.

---

## Keyboard Shortcuts & Focus Management

* **Global Trigger**: `Ctrl + Shift + E` (or `⌘ + Shift + E` on macOS) opens the dialog.
* **Editable Element Guard**: `isEditableTarget` checks whether the event originated inside an `INPUT`, `TEXTAREA`, `SELECT`, or `contenteditable` container, preventing accidental dialog opening while typing.
* **Focus Management**:
  * On opening: Focus automatically shifts to the filename input with pre-selected text.
  * On closing: Focus is restored to the initiating trigger element.
* **Escape Key**:
  * When exporting: Cancels the active export operation.
  * When idle: Dismisses the export dialog.

---

## Persistence & Collaboration Invariants

Export UI and download operations are strictly read-only:
* Document mutations: **0**
* `MutationRecord` entries: **0**
* `BoardVersion` changes: **0**
* `collaborationRevision` changes: **0**
* Socket.IO mutation events: **0**
* Undo/redo stack pollution: **0**

---

## Architectural Decisions

### 1. Unified Dialog vs Per-Format Dialogs
* **Problem**: Creating separate dialogs for PNG, JPEG, SVG, and PDF causes component fragmentation and duplicates modal lifecycle code.
* **Decision**: Single cohesive `ExportDialog` with format-adaptive controls.
* **Reason**: Consistent user experience and single integration boundary with `exportService`.

### 2. Global Mounting via Zustand Store vs Deep Local Mounting
* **Problem**: Mounting dialogs inside canvas children complicates global shortcut arbitration and unmounting during page navigation.
* **Decision**: Lightweight global store `useExportDialogStore` mounted once in `ProtectedRoute.tsx`.
* **Reason**: Matches existing `SearchDialog` pattern and allows triggering from TopBar, CanvasToolbar, or keyboard shortcuts.

### 3. Asynchronous Object URL Revocation
* **Problem**: Immediate synchronous `URL.revokeObjectURL(url)` in the same tick can cause downloads to fail on some browsers before the Blob is read.
* **Decision**: Revoke in a `setTimeout(..., 100)` handler within a `finally` block.
* **Reason**: Standards-compliant, leak-free, and cross-browser reliable.

---

## Deferred Work (Slice 49)

* **Slice 49 — Search & Export Reliability / Polish**:
  * Multi-threaded Web Worker offloading for massive raster exports.
  * Server-side rendering offloading for extremely large whiteboards exceeding browser memory limits.
  * Tile-based chunked rendering for ultra-scale canvases.
