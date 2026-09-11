# Slice 47 — Export API & Processing

## Purpose

Slice 47 establishes the **authoritative export processing pipeline** for CanvasFlow. Consuming the normalized `ExportPreparedScene` produced by Slice 46, this slice implements format-specific encoders for **PNG**, **JPEG**, **SVG**, and **PDF** to produce deterministic, strongly-typed `ExportResult` Blobs ready for download or presentation in future slices.

---

## Existing Architecture Audit

Slice 46 established the export domain foundation:
* **Types**: `ExportFormat`, `ExportScope`, `ExportBackground`, `ExportBounds`, `ExportDimensions`, `ExportOptions`, `ExportPreparedShape`, `ExportPreparedScene`, `ExportErrorCode`.
* **Constants**: `MAX_EXPORT_PIXEL_DIMENSION = 8192`, `DEFAULT_EXPORT_SCALE = 1`, padding, quality, and background definitions.
* **Bounds**: `calculateShapeWorldBounds`, `calculateContentBounds`, `applyExportPadding`.
* **Ordering & Filtering**: `filterShapesForExport` (handling `canvas`, `selection`, `viewport` scopes and expanding group hierarchies), `sortShapesForExport` (deterministic zIndex order with stable index tie-breaking).
* **Geometry Normalization**: `normalizeExportShape`, `prepareExportScene`.
* **Validation**: `validateExportOptions`, `validateExportDimensions`, `ExportError`.

Slice 47 consumes `ExportPreparedScene` without modifying Slice 46 domain types or creating duplicate geometry algorithms.

---

## Processing Architecture

The pipeline strictly enforces a single directional data flow:

```text
Document State (Shape[])
         │
         ▼
Slice 46 Export Preparation (`prepareExportScene`)
         │
         ▼
ExportPreparedScene
         │
         ▼
ExportService Orchestration
         │
 ┌───────┼──────────┬──────────┐
 ▼       ▼          ▼          ▼
PNG     JPEG       SVG        PDF
 │       │          │          │
 ▼       ▼          ▼          ▼
Blob    Blob       Blob       Blob
```

### Result Contract

```typescript
export type ExportResult = {
  blob: Blob;
  mimeType: string;
  format: ExportFormat;
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  filename: string;
};
```

---

## Format Support

### 1. PNG (`image/png`)
* Preserves transparent background when `background.mode === "transparent"`.
* Supports canvas default background (`#ffffff`) and solid custom backgrounds (`backgroundColor`).
* Renders via an offscreen canvas adapter scaled to `pixelDimensions`.
* Strictly prevents live Konva editor Stage capture, ensuring no selection handles, transformers, marquee boxes, cursors, presence avatars, or comment pins appear in the output.

### 2. JPEG (`image/jpeg`)
* **Transparency Handling**: Because the JPEG specification lacks alpha transparency support, `transparent` background requests are explicitly mapped to an opaque white fallback (`#ffffff`), preventing dark or corrupt artifacts.
* Quality parameter is strictly clamped within `[MIN_EXPORT_QUALITY (0.1), MAX_EXPORT_QUALITY (1.0)]`.

### 3. SVG (`image/svg+xml`)
* Pure vector serialization to XML markup.
* Configures `<svg width="${pixelWidth}" height="${pixelHeight}" viewBox="0 0 ${width} ${height}">`.
* Emits `<rect>` background when not transparent.
* Emits crisp vector elements (`<rect>`, `<circle>`, `<ellipse>`, `<polygon>`, `<polyline>`, `<text>`, `<tspan>`).
* Emits arrowhead caps for `arrow` and `connector` shapes.

### 4. PDF (`application/pdf`)
* Generates a valid, standalone, vector **PDF 1.4** document.
* Configures `/MediaBox [0 0 pixelWidth pixelHeight]`.
* Maps canvas coordinates to PDF coordinates using coordinate transformation matrix `q scale 0 0 -scale 0 pixelHeight cm`.
* Preserves crisp vector lines, fills, strokes, and text without raster blur.
* Requires **zero** external multi-megabyte dependencies (avoids `jspdf` / `pdfkit`).

---

## Shape Support Matrix

| Shape | PNG | JPEG | SVG | PDF | Implementation Details |
|---|---|---|---|---|---|
| `rectangle` | ✅ | ✅ | ✅ | ✅ | Full fill, stroke, strokeWidth, strokeStyle (dash/dot), rotation |
| `circle` | ✅ | ✅ | ✅ | ✅ | Center/radius calculated via `calculateCircleGeometry`; Bézier arcs in PDF |
| `ellipse` | ✅ | ✅ | ✅ | ✅ | Radii calculated via `calculateEllipseGeometry`; Bézier curves in PDF |
| `triangle` | ✅ | ✅ | ✅ | ✅ | Local 3 vertices calculated via `calculateTrianglePoints` |
| `polygon` | ✅ | ✅ | ✅ | ✅ | Regular n-gon vertices via `calculatePolygonPoints` |
| `star` | ✅ | ✅ | ✅ | ✅ | 2n alternating inner/outer vertices via `calculateStarPoints` |
| `line` | ✅ | ✅ | ✅ | ✅ | Multi-point polyline with strokeWidth and dash patterns |
| `freehand` | ✅ | ✅ | ✅ | ✅ | Smooth polyline strokes with round lineCap and lineJoin |
| `arrow` | ✅ | ✅ | ✅ | ✅ | Polyline with calculated arrowhead caps (`arrowHeadEnd`, `arrowHeadStart`) |
| `connector` | ✅ | ✅ | ✅ | ✅ | Routing polyline with arrowhead caps |
| `text` | ✅ | ✅ | ✅ | ✅ | Multi-line text with font size, family, alignment, and line height |
| `sticky_note` | ✅ | ✅ | ✅ | ✅ | Styled note card background with padded multi-line text |
| `group` | ✅ | ✅ | ✅ | ✅ | Container shape; child shapes are flattened and normalized by Slice 46 |

---

## Coordinate System & Scaling

* **Logical Space**: Normalized bounds starting at `(0, 0)`. Shapes have `normalizedX`, `normalizedY`, `width`, `height`, and `rotation`.
* **Pixel Dimensions**: `pixelWidth = logicalDimensions.width * scale`, `pixelHeight = logicalDimensions.height * scale`.
* **Single-Point Scaling**:
  * In SVG: Applied via `width`, `height` attributes with logical `viewBox`.
  * In Canvas (PNG/JPEG): Applied once via `ctx.scale(scale, scale)`.
  * In PDF: Applied once via coordinate matrix `scale 0 0 -scale 0 pixelHeight cm`.
* Coordinates are never multiplied repeatedly, eliminating double-scaling bugs.

---

## Background Handling

* `transparent`: Emits no background rect/canvas fill (PNG/SVG). In JPEG, mapped to opaque white fallback (`#ffffff`).
* `canvas`: Emits authoritative canvas background color (`#ffffff`).
* `solid`: Emits user-specified `backgroundColor` sanitized against injection.

---

## SVG Security & Sanitization

To prevent XML/SVG injection and malformed output:
* Text content is escaped using `escapeXmlText`: `&` ➔ `&amp;`, `<` ➔ `&lt;`, `>` ➔ `&gt;`.
* Attributes are escaped using `escapeXmlAttr`: `&` ➔ `&amp;`, `<` ➔ `&lt;`, `>` ➔ `&gt;`, `"` ➔ `&quot;`, `'` ➔ `&apos;`.
* CSS color strings are validated using strict regex allowing only hex, rgb/rgba, hsl/hsla, or standard CSS color names.

---

## Dimension Safety

Before allocating canvas surfaces or generating streams:
* `validateExportDimensions` validates that `pixelWidth` and `pixelHeight` do not exceed `MAX_EXPORT_PIXEL_DIMENSION` (8192px).
* Exceeding dimensions throw typed `ExportError("EXPORT_TOO_LARGE", ...)`.

---

## Immutability & Persistence Boundary

Export is strictly a read operation:
* **0 Document Mutations**: `Shape` objects and input arrays are never mutated.
* **0 MutationRecords**: No mutation records are created.
* **0 BoardVersion changes**: Board versions remain unchanged.
* **0 collaborationRevision changes**: Revision counters remain unchanged.
* **0 Socket.IO events**: No socket mutation messages are broadcast.
* **0 Undo/Redo side effects**: History stacks are untouched.

---

## Architectural Decisions

### 1. Dedicated Offscreen Renderer vs Live Editor Stage Capture
* **Problem**: `stage.toDataURL()` on the live editor stage captures selection handles, transformer bounds, marquee rects, cursors, presence avatars, and comment markers.
* **Decision**: Implement a dedicated offscreen canvas/vector export renderer that consumes `ExportPreparedScene`.
* **Trade-off**: Requires dedicated rendering logic for the 13 shapes.
* **Reason**: Guarantees clean, production-grade output containing only the document scene.

### 2. Pure Vector PDF 1.4 vs External Heavyweight Dependency
* **Problem**: PDF generation libraries like `jspdf` (~300KB) or `pdfkit` (~1.5MB with Node stream dependencies) bloat bundle size and introduce compatibility issues.
* **Decision**: Implement a pure TypeScript vector PDF 1.4 generator complying with PDF 1.4 specifications.
* **Trade-off**: Uses standard Type 1 fonts (Helvetica); rich font subsetting is deferred.
* **Reason**: Produces 100% crisp vector output with 0 additional npm dependencies and 0 bundle bloat.

### 3. JPEG Transparency Fallback
* **Problem**: JPEG format does not support alpha channel transparency.
* **Decision**: If `background.mode === "transparent"`, map to solid white (`#ffffff`).
* **Alternative**: Reject transparent JPEG with an error.
* **Trade-off**: Changes user's transparency request to white background.
* **Reason**: Users expect whiteboards to export on white backgrounds; throwing an error would degrade UX.

---

## Deferred Work (Slice 48 & 49)

* **Slice 48**: Export UI, export modal/dialog, download trigger, format dropdown, quality slider, resolution selector.
* **Slice 49**: Web Workers for multi-threaded rasterization, tile-based large-export rendering, server-side offloading.
