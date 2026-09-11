# Slice 46: Canvas Export Domain & Infrastructure

## 1. Purpose

Slice 46 establishes the production-grade **Canvas Export Domain & Infrastructure foundation** for CanvasFlow under `client/src/features/export/`.

Prior to this slice, CanvasFlow possessed rich vector and freehand canvas rendering (Konva), grouping hierarchies, selection arbitration, alignment, clipboard, and version history, but had no formal domain abstraction for exporting canvases into offline visual documents.

Slice 46 defines what an export is, what scopes and formats are supported, how document bounds are calculated in world coordinates, how coordinates are normalized to output canvas origins, and how scene hierarchies and z-orders are preserved deterministically—all while strictly enforcing that export is a **pure, read-only operation** with zero mutations to the document or collaboration state.

---

## 2. Existing Architecture Audit

### Audit Findings
- **Authoritative Shapes**: 13 concrete shapes (`rectangle`, `circle`, `ellipse`, `triangle`, `polygon`, `star`, `line`, `arrow`, `connector`, `freehand`, `text`, `sticky_note`, `group`) in `client/src/features/canvas/types/shape.types.ts`.
- **Canvas State**: `useCanvasStore` maintains authoritative `shapes: Shape[]`, `selectedShapeIds: string[]`, `zoom: number`, and `pan: { x: number; y: number }`.
- **Geometry & Hierarchy**:
  - `getShapeWorldTransform` and `getShapeWorldBounds` in `group-geometry.utils.ts` traverse ancestor parent IDs and accumulate group rotation/translation.
  - `screenToWorld` in `canvas.coordinates.ts` maps screen pixels to document world coordinates based on viewport pan and zoom.
- **Persistence & Collaboration**:
  - `MutationRecord`, `BoardVersion`, and `collaborationRevision` drive document mutations.
  - Whiteboard operations emit socket events (`draw:stroke`, `shape:create`, `shape:update`, etc.).
  - Undo/redo stacks (`past` and `future`) record historical snapshots.
  - **Invariant verified**: Export does not mutate `useCanvasStore`, does not generate `MutationRecord`, does not increment `collaborationRevision`, does not push undo/redo states, and does not emit socket messages.

---

## 3. Export Domain Model

Export domain types are defined in `client/src/features/export/types/export.types.ts`:

```ts
export type ExportFormat = "png" | "jpeg" | "svg" | "pdf";

export type ExportScope = "canvas" | "selection" | "viewport";

export type ExportBackground = "transparent" | "canvas" | "solid";

export type ExportBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
};

export type ExportDimensions = {
  width: number;
  height: number;
};

export type ExportViewport = {
  zoom: number;
  pan: {
    x: number;
    y: number;
  };
  screenWidth: number;
  screenHeight: number;
};

export type ExportOptions = {
  format: ExportFormat;
  scope: ExportScope;
  scale?: number;
  background?: ExportBackground;
  backgroundColor?: string;
  quality?: number;
  padding?: number;
  selectedShapeIds?: string[];
  viewport?: ExportViewport;
};
```

### Prepared Scene Output (`ExportPreparedScene`):
- `contentBounds`: Unpadded axis-aligned bounding box enclosing all target shapes in world space.
- `finalBounds`: Bounding box expanded by uniform `padding`.
- `logicalDimensions`: Integer dimensions `(width, height)` of `finalBounds`.
- `pixelDimensions`: `logicalDimensions` multiplied by `scale`.
- `shapes`: Ordered, normalized shapes (`ExportPreparedShape`) with `normalizedX = worldX - finalBounds.minX` and `normalizedY = worldY - finalBounds.minY`.
- `metadata`: Shape count, total input count, timestamp, and scope flags.

---

## 4. Supported Scopes

1. **`canvas` (Full Document)**:
   - Includes all renderable shapes in the canvas.
   - Calculates content bounds encompassing all shapes regardless of viewport position or zoom.
2. **`selection`**:
   - Requires `selectedShapeIds` with at least one ID.
   - Preserves hierarchy: When a group is selected, all of its nested child descendants are recursively included.
3. **`viewport`**:
   - Converts the screen viewport rectangle `(0, 0, screenWidth, screenHeight)` to a world AABB using `screenToWorld`.
   - Selects only shapes whose world-space bounding boxes intersect the viewport world rectangle.

---

## 5. Supported Formats

- **`png`**: Raster graphics with alpha transparency support.
- **`jpeg`**: High-compression raster graphics with solid background.
- **`svg`**: Scalable vector XML representation.
- **`pdf`**: Portable Document Format vector/paged output.

*Note: Encoders for these formats belong to Slice 47. Slice 46 establishes the format capabilities, validation, and prepared normalized scene model.*

---

## 6. Authoritative Data & Exclusions

### Included in Export:
- Persisted canvas shapes: `rectangle`, `circle`, `ellipse`, `triangle`, `polygon`, `star`, `line`, `arrow`, `connector`, `freehand`, `text`, `sticky_note`, and visual group contents.
- Authoritative coordinates, widths, heights, rotations, fills, strokes, line styles, shadows, and text formatting.

### Excluded from Export:
- Transient UI elements: Selection boxes, Transformer handles, marquee/lasso rectangles.
- Active drawing tool previews (in-progress pencil strokes).
- Remote peer cursors, selection highlights, and presence badges.
- Comment markers, comment pins, and floating comment composer UI.
- Viewport grid dots/lines.
- UI bars, search modals, navigation chrome.

---

## 7. Coordinate System & Normalization

Export preparation operates purely in **World/Document Coordinates**:
- Shape world coordinates are independent of browser screen coordinates, camera pan, and zoom.
- `screenToWorld` is only used when interpreting the visible window for `viewport` scope.
- **Normalization Formula**:
  $$\text{normalizedX} = \text{worldX} - \text{finalBounds.minX}$$
  $$\text{normalizedY} = \text{worldY} - \text{finalBounds.minY}$$
- This guarantees that the top-left padding corner of the exported image starts cleanly at `(0, 0)`.
- For point-based shapes (`line`, `arrow`, `connector`, `freehand`), local points are rotated by `worldTransform.rotation`, translated by shape origin, and offset by `finalBounds.minX` / `finalBounds.minY`.

---

## 8. Bounds Mathematics & Padding

### Content Bounds:
$$\text{minX} = \min_{s \in S} (\text{bounds}_s.\text{minX}), \quad \text{maxX} = \max_{s \in S} (\text{bounds}_s.\text{maxX})$$
$$\text{minY} = \min_{s \in S} (\text{bounds}_s.\text{minY}), \quad \text{maxY} = \max_{s \in S} (\text{bounds}_s.\text{maxY})$$
$$\text{width} = \max(1, \text{maxX} - \text{minX}), \quad \text{height} = \max(1, \text{maxY} - \text{minY})$$

### Padding Application:
$$\text{finalBounds.minX} = \text{contentBounds.minX} - \text{padding}$$
$$\text{finalBounds.minY} = \text{contentBounds.minY} - \text{padding}$$
$$\text{finalBounds.maxX} = \text{contentBounds.maxX} + \text{padding}$$
$$\text{finalBounds.maxY} = \text{contentBounds.maxY} + \text{padding}$$
$$\text{finalBounds.width} = \text{contentBounds.width} + 2 \times \text{padding}$$
$$\text{finalBounds.height} = \text{contentBounds.height} + 2 \times \text{padding}$$

*No Double-Counting: Padding is applied once around content bounds, and shapes are translated relative to `finalBounds.minX` / `finalBounds.minY`, placing content exactly `padding` pixels inside the image border.*

---

## 9. Scale & Dimension Limits

- Logical dimensions: Integer width and height of `finalBounds`.
- Pixel dimensions: Logical dimensions multiplied by `scale` (clamped between `0.5` and `4.0`, default `1.0`).
- **Memory Protection (`MAX_EXPORT_PIXEL_DIMENSION = 8192`)**:
  - Protects against browser/server OOM failures if an extreme scale or massive coordinate span is requested.
  - If `pixelDimensions.width > 8192` or `pixelDimensions.height > 8192`, validation throws `EXPORT_TOO_LARGE`.

---

## 10. Groups & Transforms

- Traverses ancestor `parentId` chains with cycle detection via `getShapeWorldTransform`.
- Accumulates position and rotation:
  $$\text{accumulatedRotation} = (\text{rotation}_{\text{shape}} + \sum \text{rotation}_{\text{ancestors}}) \pmod{360}$$
- Rotates points and corner vectors using trigonometry:
  $$x' = \cos(\theta) x - \sin(\theta) y + x_0$$
  $$y' = \sin(\theta) x + \cos(\theta) y + y_0$$
- Preserves the original `parentId` reference on `ExportPreparedShape` so hierarchical vector adapters (such as SVG trees) can optionally retain `<g>` structure while flat rasterizers can consume pre-calculated `normalizedX` and `normalizedY`.

---

## 11. Z-Order

- Preserves authoritative visual stacking order.
- Sorts ascending by `shape.zIndex`.
- Deterministic tie-breaking: If two shapes have identical `zIndex`, their original relative index in the canvas `shapes` array is preserved.

---

## 12. Text, Connectors & Images

- **Text & Sticky Notes**:
  - `TextShape` font family, size, weight, alignment, line height, and color are preserved in `ExportPreparedShape.shape`.
  - World bounds account for position, width, height, and rotation.
- **Connectors**:
  - `points` array, anchors, line style, stroke width, and arrowhead configurations are preserved.
  - Points are normalized relative to final bounds.
- **Images**:
  - No image shape exists in CanvasFlow at Slice 46. The infrastructure is extensible via `Shape["type"]` and `ExportPreparedShape.shape`.

---

## 13. Background Modes

- **`canvas`** (Default): Renders standard white board background (`#ffffff`).
- **`solid`**: Renders custom or specified solid background color.
- **`transparent`**: No background fill, suitable for transparent PNG and SVG assets.

---

## 14. Client vs Server Decision

### Architectural Decision:
- **Slice 46**: Client-side pure domain preparation and geometry calculation in `client/src/features/export/`.
- **Slice 47**: Will introduce the rendering adapter and encoding pipeline.
- **Why no MongoDB Export collection?**:
  CanvasFlow exports are immediate document downloads triggered by the active user. Storing transient export blobs or job records in MongoDB adds unneeded DB write overhead and retention complexity. If async batch export jobs are required in the future, the prepared domain scene model can be serialized and passed directly to worker queues.

---

## 15. Persistence Boundary Verification

| Metric | Count |
| :--- | :---: |
| HTTP document mutations | 0 |
| MutationRecord created | 0 |
| BoardVersion increments | 0 |
| collaborationRevision increments | 0 |
| Socket.IO mutation events | 0 |
| Undo/Redo stack changes | 0 |

---

## 16. Architectural Decisions

1. **Pure Geometry Pipeline**:
   - *Decision*: Separate export bounds, filtering, and normalization into pure mathematical utilities without imports from Konva or React.
   - *Reason*: Enables universal unit testing and allows future server-side or worker rendering without DOM dependencies.
2. **Deterministic Tie-Breaking**:
   - *Decision*: Use stable document index tie-breaking when `zIndex` values match.
   - *Reason*: Guarantees identical output regardless of JavaScript engine sort algorithm.
3. **No Database Collection in Slice 46**:
   - *Decision*: Maintain export as a stateless domain preparation layer.
   - *Reason*: Avoids database pollution for read-only user actions.

---

## 17. Testing & Verification

- **Focused Test Suites (`4/4` passed, `24/24` tests)**:
  - `src/features/export/__tests__/export-bounds.utils.test.ts` (7 tests)
  - `src/features/export/__tests__/export-geometry.utils.test.ts` (5 tests)
  - `src/features/export/__tests__/export-order.utils.test.ts` (5 tests)
  - `src/features/export/__tests__/export-validation.utils.test.ts` (7 tests)
- **Full Client Test Suite**: `68/68` test files passed (`589/589` tests passed).
- **Client Build**: `npm run build` passed with zero errors.
- **Server Build**: `npm run build` passed with zero errors.

---

## 18. Deferred Work

- **Slice 47 (Export API & Processing)**:
  - Canvas / Konva export adapter, raster/vector encoders (PNG, JPEG, SVG, PDF).
  - Blob / ArrayBuffer generation, file naming, and streaming download pipeline.
  - Server rendering worker boundary (if large export offloading is selected).
- **Slice 48 (Export UI / Download)**:
  - Export modal dialog, format selector, scale slider, background toggle, download trigger button.
- **Slice 49 (Reliability / Polish)**:
  - Telemetry, memory benchmarking, retry mechanisms for large export rendering.
