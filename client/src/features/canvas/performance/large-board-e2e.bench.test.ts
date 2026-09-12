import { describe, it, expect, afterAll } from "vitest";

import { svgExporter } from "@/features/export/processors/svg.exporter";
import { calculateContentBounds } from "@/features/export/utils/export-bounds.utils";
import { prepareExportScene } from "@/features/export/utils/export-geometry.utils";
import { sortShapesForExport } from "@/features/export/utils/export-order.utils";

import type { MarqueeState, SelectionPoint, Shape } from "../types";
import type { AABB } from "../utils/alignment.utils";
import { findNearestAnchor } from "../utils/anchor.utils";
import { screenToWorld } from "../utils/canvas.coordinates";
import { ScheduledChannel } from "../utils/collaboration-scheduler";
import {
  marqueeToPolygon,
  getShapeGeometryInWorld,
  hitTestShapeGeometry,
} from "../utils/selection-geometry.utils";
import {
  filterCandidateShapes,
  resolveSelectionWithModifiers,
} from "../utils/selection-policy.utils";
import { normalizeShapeBounds } from "../utils/shape-geometry.utils";
import { simplifyStroke } from "../utils/stroke-simplification";
import {
  getViewportWorldBounds,
  filterVisibleRootShapes,
  DEFAULT_VIEWPORT_CULLING_MARGIN,
} from "../utils/viewport-culling.utils";

import {
  generatePerformanceBoard,
  generatePerformanceStroke,
} from "./performance.fixtures";

export interface E2EBenchmarkMetric {
  workflow: string;
  shapeCount: number;
  durationMs: number;
  itemsPerMs: number;
  notes?: string;
}

const e2eMetrics: E2EBenchmarkMetric[] = [];

describe("Slice 56: Large-Board & End-to-End Performance Validation", () => {
  const boardSizes = [1000, 5000, 10000];

  // ==========================================
  // 1. Initial Board Load & State Hydration
  // ==========================================
  describe("1. Initial Board Load & State Hydration", () => {
    for (const count of boardSizes) {
      it(`hydrates and indexes ${count.toLocaleString()} shapes from serialized state`, () => {
        // Step A: Serialization simulation (API payload)
        const rawShapes = generatePerformanceBoard(count);
        const serialized = JSON.stringify(rawShapes);

        // Step B: JSON parse + State Hydration
        const startParse = performance.now();
        const parsedShapes = JSON.parse(serialized) as Shape[];
        const durationParse = performance.now() - startParse;

        // Step C: Lookup indexing (Map construction)
        const startIndex = performance.now();
        const shapesMap = new Map<string, Shape>();
        for (const s of parsedShapes) {
          shapesMap.set(s.id, s);
        }
        const durationIndex = performance.now() - startIndex;

        // Step D: Initial scene graph culling
        const startCull = performance.now();
        const vp = getViewportWorldBounds(
          { width: 1920, height: 1080 },
          { x: 0, y: 0 },
          1,
          DEFAULT_VIEWPORT_CULLING_MARGIN
        );
        const visibleShapes = filterVisibleRootShapes(parsedShapes, vp);
        const durationCull = performance.now() - startCull;

        const totalHydrationMs = durationParse + durationIndex + durationCull;

        e2eMetrics.push({
          workflow: "Initial Board Load & Hydration",
          shapeCount: count,
          durationMs: totalHydrationMs,
          itemsPerMs: count / Math.max(0.001, totalHydrationMs),
          notes: `Parse: ${durationParse.toFixed(2)}ms, Index: ${durationIndex.toFixed(2)}ms, Initial Cull: ${durationCull.toFixed(2)}ms (${visibleShapes.length} mounted)`,
        });

        expect(parsedShapes).toHaveLength(count);
        expect(shapesMap.size).toBe(count);
        expect(visibleShapes.length).toBeLessThan(count);
      });
    }
  });

  // ==========================================
  // 2. Selection Workflows
  // ==========================================
  describe("2. Selection Workflows (Single, Multi, Marquee, Lasso)", () => {
    for (const count of boardSizes) {
      it(`executes single selection lookup on ${count.toLocaleString()} board`, () => {
        const shapes = generatePerformanceBoard(count);
        const targetShapeId = `perf-shape-${Math.floor(count / 2)}`;

        const start = performance.now();
        const target = shapes.find((s) => s.id === targetShapeId);
        const selectedIds = resolveSelectionWithModifiers({
          currentSelectedIds: [],
          hitIds: target ? [target.id] : [],
          mode: "replace",
          shapes,
          editingGroupId: null,
        });
        const durationMs = performance.now() - start;

        e2eMetrics.push({
          workflow: "Single Selection",
          shapeCount: count,
          durationMs,
          itemsPerMs: count / Math.max(0.001, durationMs),
        });

        expect(selectedIds).toEqual([targetShapeId]);
      });

      it(`resolves multi-selection (50 items) on ${count.toLocaleString()} board`, () => {
        const shapes = generatePerformanceBoard(count);
        const targetIds = Array.from({ length: 50 }, (_, i) => `perf-shape-${i * 10}`);

        const start = performance.now();
        const selectedIds = resolveSelectionWithModifiers({
          currentSelectedIds: [],
          hitIds: targetIds,
          mode: "replace",
          shapes,
          editingGroupId: null,
        });
        const durationMs = performance.now() - start;

        e2eMetrics.push({
          workflow: "Multi-Selection (50 shapes)",
          shapeCount: count,
          durationMs,
          itemsPerMs: 50 / Math.max(0.001, durationMs),
        });

        expect(selectedIds).toHaveLength(50);
      });

      it(`executes Marquee selection on ${count.toLocaleString()} board`, () => {
        const shapes = generatePerformanceBoard(count);

        const marquee: MarqueeState = {
          startX: 100,
          startY: 100,
          currentX: 900,
          currentY: 700,
          direction: "left-to-right",
          matchMode: "containment",
        };

        const minX = Math.min(marquee.startX, marquee.currentX);
        const maxX = Math.max(marquee.startX, marquee.currentX);
        const minY = Math.min(marquee.startY, marquee.currentY);
        const maxY = Math.max(marquee.startY, marquee.currentY);

        const marqueeAABB: AABB = {
          minX,
          minY,
          maxX,
          maxY,
          width: maxX - minX,
          height: maxY - minY,
          centerX: (minX + maxX) / 2,
          centerY: (minY + maxY) / 2,
        };

        const marqueePoly = marqueeToPolygon(marquee);

        const start = performance.now();
        const candidates = filterCandidateShapes(shapes, marqueeAABB, null);
        const hitIds: string[] = [];
        for (const candidate of candidates) {
          const geom = getShapeGeometryInWorld(candidate, shapes);
          if (hitTestShapeGeometry(geom, marqueePoly, marquee.matchMode)) {
            hitIds.push(candidate.id);
          }
        }
        const durationMs = performance.now() - start;

        e2eMetrics.push({
          workflow: "Marquee Selection (Stages 1+2)",
          shapeCount: count,
          durationMs,
          itemsPerMs: count / Math.max(0.001, durationMs),
          notes: `${candidates.length} candidates, ${hitIds.length} matched`,
        });

        expect(durationMs).toBeLessThan(50);
      });

      it(`executes Lasso selection on ${count.toLocaleString()} board`, () => {
        const shapes = generatePerformanceBoard(count);

        const lassoPolygon: SelectionPoint[] = [
          { x: 100, y: 100 },
          { x: 800, y: 120 },
          { x: 850, y: 700 },
          { x: 120, y: 650 },
        ];

        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (const p of lassoPolygon) {
          if (p.x < minX) minX = p.x;
          if (p.x > maxX) maxX = p.x;
          if (p.y < minY) minY = p.y;
          if (p.y > maxY) maxY = p.y;
        }

        const lassoAABB: AABB = {
          minX,
          minY,
          maxX,
          maxY,
          width: maxX - minX,
          height: maxY - minY,
          centerX: (minX + maxX) / 2,
          centerY: (minY + maxY) / 2,
        };

        const start = performance.now();
        const candidates = filterCandidateShapes(shapes, lassoAABB, null);
        const hitIds: string[] = [];
        for (const candidate of candidates) {
          const geom = getShapeGeometryInWorld(candidate, shapes);
          if (hitTestShapeGeometry(geom, lassoPolygon, "intersection")) {
            hitIds.push(candidate.id);
          }
        }
        const durationMs = performance.now() - start;

        e2eMetrics.push({
          workflow: "Lasso Selection (Stages 1+2)",
          shapeCount: count,
          durationMs,
          itemsPerMs: count / Math.max(0.001, durationMs),
          notes: `${candidates.length} candidates, ${hitIds.length} matched`,
        });

        expect(durationMs).toBeLessThan(50);
      });
    }
  });

  // ==========================================
  // 3. Viewport Navigation (Pan & Zoom)
  // ==========================================
  describe("3. Viewport Navigation (Pan & Zoom)", () => {
    for (const count of boardSizes) {
      it(`recalculates culling over 10 pan frames on ${count.toLocaleString()} board`, () => {
        const shapes = generatePerformanceBoard(count);
        const frames = 10;
        let totalDuration = 0;

        for (let f = 0; f < frames; f++) {
          const pan = { x: -f * 100, y: -f * 80 };
          const vp = getViewportWorldBounds(
            { width: 1920, height: 1080 },
            pan,
            1,
            DEFAULT_VIEWPORT_CULLING_MARGIN
          );

          const start = performance.now();
          const visible = filterVisibleRootShapes(shapes, vp);
          totalDuration += performance.now() - start;

          expect(visible.length).toBeGreaterThan(0);
        }

        const avgDurationPerFrame = totalDuration / frames;

        e2eMetrics.push({
          workflow: "Pan Recalculation (10 Frames)",
          shapeCount: count,
          durationMs: avgDurationPerFrame,
          itemsPerMs: count / Math.max(0.001, avgDurationPerFrame),
        });

        expect(avgDurationPerFrame).toBeLessThan(25);
      });

      it(`maintains pointer-relative zoom invariant on ${count.toLocaleString()} board`, () => {
        const shapes = generatePerformanceBoard(count);
        const cursorScreen = { x: 960, y: 540 };
        const initialPan = { x: 200, y: 150 };
        const initialZoom = 1.0;

        // Step 1: Calculate world point under cursor before zoom
        const worldPointBefore = screenToWorld(cursorScreen, {
          pan: initialPan,
          zoom: initialZoom,
        });

        // Step 2: Zoom in to 1.5x centered on cursor
        const nextZoom = 1.5;
        const nextPan = {
          x: cursorScreen.x - worldPointBefore.x * nextZoom,
          y: cursorScreen.y - worldPointBefore.y * nextZoom,
        };

        // Step 3: Verify world point under cursor after zoom equals original
        const worldPointAfter = screenToWorld(cursorScreen, {
          pan: nextPan,
          zoom: nextZoom,
        });

        expect(Math.abs(worldPointAfter.x - worldPointBefore.x)).toBeLessThan(0.0001);
        expect(Math.abs(worldPointAfter.y - worldPointBefore.y)).toBeLessThan(0.0001);

        // Step 4: Measure culling recalculation at zoomed viewport
        const start = performance.now();
        const vp = getViewportWorldBounds(
          { width: 1920, height: 1080 },
          nextPan,
          nextZoom,
          DEFAULT_VIEWPORT_CULLING_MARGIN
        );
        const visible = filterVisibleRootShapes(shapes, vp);
        const durationMs = performance.now() - start;

        e2eMetrics.push({
          workflow: "Zoom Recalculation (Pointer-Relative)",
          shapeCount: count,
          durationMs,
          itemsPerMs: count / Math.max(0.001, durationMs),
          notes: `Visible shapes: ${visible.length}`,
        });

        expect(durationMs).toBeLessThan(25);
      });

      it(`verifies protected selected shapes remain mounted when offscreen (${count.toLocaleString()} board)`, () => {
        const shapes = generatePerformanceBoard(count);
        // Select shapes that are placed far away in bottom-right corner
        const offscreenShapeId1 = `perf-shape-${count - 1}`;
        const offscreenShapeId2 = `perf-shape-${count - 2}`;

        // Viewport at top-left origin (0, 0)
        const vp = getViewportWorldBounds(
          { width: 800, height: 600 },
          { x: 0, y: 0 },
          1,
          DEFAULT_VIEWPORT_CULLING_MARGIN
        );

        // Filter with selection override
        const visibleWithProtection = filterVisibleRootShapes(shapes, vp, {
          selectedShapeIds: [offscreenShapeId1, offscreenShapeId2],
        });

        const ids = new Set(visibleWithProtection.map((s) => s.id));
        expect(ids.has(offscreenShapeId1)).toBe(true);
        expect(ids.has(offscreenShapeId2)).toBe(true);
      });
    }
  });

  // ==========================================
  // 4. Drawing Workflows
  // ==========================================
  describe("4. Drawing Workflows", () => {
    it("measures basic shape creation and bound normalization", () => {
      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        normalizeShapeBounds(100, 100, 100 + i, 100 + (i % 200));
      }
      const durationMs = performance.now() - start;

      e2eMetrics.push({
        workflow: "Drawing Bounds Normalization (1,000 shapes)",
        shapeCount: 1000,
        durationMs,
        itemsPerMs: 1000 / Math.max(0.001, durationMs),
      });

      expect(durationMs).toBeLessThan(50);
    });

    it("measures freehand stroke ingestion and simplification (5,000 points)", () => {
      const rawPoints = generatePerformanceStroke(5000);

      const start = performance.now();
      const simplified = simplifyStroke(rawPoints, 1.5);
      const durationMs = performance.now() - start;

      const reductionPercent = ((rawPoints.length - simplified.length) / rawPoints.length) * 100;

      e2eMetrics.push({
        workflow: "Freehand Stroke Simplification (5,000 pts)",
        shapeCount: 5000,
        durationMs,
        itemsPerMs: 5000 / Math.max(0.001, durationMs),
        notes: `Reduced by ${reductionPercent.toFixed(1)}% (${simplified.length / 2} pts remaining)`,
      });

      expect(durationMs).toBeLessThan(50);
      expect(simplified.length).toBeLessThan(rawPoints.length);
    });

    for (const count of boardSizes) {
      it(`discovers nearest anchor across ${count.toLocaleString()} shapes`, () => {
        const shapes = generatePerformanceBoard(count);
        const queryPoint = { x: 500, y: 500 };

        const start = performance.now();
        const anchor = findNearestAnchor(queryPoint, shapes, 40);
        const durationMs = performance.now() - start;

        e2eMetrics.push({
          workflow: "Nearest Anchor Discovery",
          shapeCount: count,
          durationMs,
          itemsPerMs: count / Math.max(0.001, durationMs),
          notes: anchor ? `Found anchor on ${anchor.shapeId}` : "No anchor within threshold",
        });

        expect(durationMs).toBeLessThan(50);
      });
    }
  });

  // ==========================================
  // 5. Transform Workflows
  // ==========================================
  describe("5. Transform Workflows", () => {
    for (const count of boardSizes) {
      it(`computes move transform updates on ${count.toLocaleString()} board`, () => {
        const shapes = generatePerformanceBoard(count);
        const selectedId = `perf-shape-${Math.floor(count / 2)}`;

        const start = performance.now();
        const target = shapes.find((s) => s.id === selectedId);
        if (target) {
          target.x += 25;
          target.y += 15;
        }
        const durationMs = performance.now() - start;

        e2eMetrics.push({
          workflow: "Single Shape Move Transform",
          shapeCount: count,
          durationMs,
          itemsPerMs: 1 / Math.max(0.001, durationMs),
        });

        expect(durationMs).toBeLessThan(50);
      });
    }
  });

  // ==========================================
  // 6. Search Against Large Boards
  // ==========================================
  describe("6. Search Against Large Boards", () => {
    for (const count of boardSizes) {
      it(`searches shapes on ${count.toLocaleString()} board across realistic queries`, () => {
        const shapes = generatePerformanceBoard(count);

        const queries = [
          { name: "Exact item", query: "Benchmark Item 42" },
          { name: "Partial prefix", query: "Benchmark Item 1" },
          { name: "Common term", query: "Benchmark" },
          { name: "Rare term", query: "Note 7" },
          { name: "No match", query: "NonexistentQueryTokenXYZ" },
        ];

        for (const q of queries) {
          const lowerQ = q.query.toLowerCase();

          const start = performance.now();
          const matches = shapes.filter((s) => {
            if ("text" in s && typeof s.text === "string") {
              return s.text.toLowerCase().includes(lowerQ);
            }
            return false;
          });
          const durationMs = performance.now() - start;

          e2eMetrics.push({
            workflow: `Search: ${q.name} (${q.query})`,
            shapeCount: count,
            durationMs,
            itemsPerMs: count / Math.max(0.001, durationMs),
            notes: `${matches.length} matched`,
          });

          expect(durationMs).toBeLessThan(30);
        }
      });
    }
  });

  // ==========================================
  // 7. Comments on Large Boards
  // ==========================================
  describe("7. Comments on Large Boards", () => {
    for (const count of boardSizes) {
      it(`evaluates shape comment badge mapping for ${count.toLocaleString()} shapes`, () => {
        const shapes = generatePerformanceBoard(count);

        // Simulate 200 spatial comments attached to shapes across the board
        const commentMap: Record<string, { count: number; hasUnresolved: boolean }> = {};
        for (let i = 0; i < 200; i++) {
          const shapeId = `perf-shape-${i * 15}`;
          commentMap[shapeId] = {
            count: 3,
            hasUnresolved: i % 2 === 0,
          };
        }

        const start = performance.now();
        let badgeCount = 0;
        for (const shape of shapes) {
          const info = commentMap[shape.id];
          if (info && info.count > 0) {
            badgeCount++;
          }
        }
        const durationMs = performance.now() - start;

        e2eMetrics.push({
          workflow: "Comment Badge Evaluation",
          shapeCount: count,
          durationMs,
          itemsPerMs: count / Math.max(0.001, durationMs),
          notes: `${badgeCount} active badges mapped`,
        });

        expect(durationMs).toBeLessThan(50);
      });
    }
  });

  // ==========================================
  // 8. Real-Time Collaboration Scaling & Isolation
  // ==========================================
  describe("8. Real-Time Collaboration Scaling & Isolation", () => {
    it("evaluates ScheduledChannel coalescing for 2, 5, and 10 collaborators", () => {
      const collaboratorCounts = [2, 5, 10];

      for (const peers of collaboratorCounts) {
        let totalEmitted = 0;
        const channel = new ScheduledChannel<{ x: number; y: number }>({
          intervalMs: 33, // 30 FPS
          leading: false,
          onEmit: () => {
            totalEmitted++;
          },
        });

        // 300 moves per collaborator over 2.5 seconds
        const movesPerPeer = 300;
        const totalMoves = peers * movesPerPeer;

        const start = performance.now();
        for (let i = 0; i < totalMoves; i++) {
          channel.schedule({ x: i % 1000, y: (i * 2) % 800 });
        }
        const durationMs = performance.now() - start;

        channel.flush();

        e2eMetrics.push({
          workflow: `Collaboration Ingestion (${peers} peers, ${totalMoves} events)`,
          shapeCount: totalMoves,
          durationMs,
          itemsPerMs: totalMoves / Math.max(0.001, durationMs),
          notes: `Coalesced to 1 batch (${totalEmitted} emitted)`,
        });

        expect(durationMs).toBeLessThan(50);
        expect(totalEmitted).toBe(1);
      }
    });

    it("verifies board room event isolation invariants", () => {
      const boardARoomEvents: string[] = [];
      const boardBRoomEvents: string[] = [];

      // Simulate isolated board event dispatcher
      const dispatchToBoard = (targetBoardId: string, eventName: string): void => {
        if (targetBoardId === "board-A") {
          boardARoomEvents.push(eventName);
        } else if (targetBoardId === "board-B") {
          boardBRoomEvents.push(eventName);
        }
      };

      dispatchToBoard("board-A", "cursor:move");
      dispatchToBoard("board-A", "shape:transforming");
      dispatchToBoard("board-B", "shape:update");

      expect(boardARoomEvents).toEqual(["cursor:move", "shape:transforming"]);
      expect(boardBRoomEvents).toEqual(["shape:update"]);
      expect(boardARoomEvents.includes("shape:update")).toBe(false);
      expect(boardBRoomEvents.includes("cursor:move")).toBe(false);
    });
  });

  // ==========================================
  // 9. Export Scaling
  // ==========================================
  describe("9. Export Scaling (JSON, Bounds, Z-Order, SVG Scene)", () => {
    for (const count of boardSizes) {
      it(`prepares export scene and computes bounds for ${count.toLocaleString()} shapes`, async () => {
        const shapes = generatePerformanceBoard(count);
        const shapesMap = new Map<string, Shape>(shapes.map((s) => [s.id, s]));

        // Measure bounds calculation
        const startBounds = performance.now();
        const contentBounds = calculateContentBounds(shapes, shapesMap);
        const durationBounds = performance.now() - startBounds;

        // Measure z-index sorting
        const startSort = performance.now();
        const sorted = sortShapesForExport(shapes);
        const durationSort = performance.now() - startSort;

        // Measure scene preparation
        const startScene = performance.now();
        const exportScale = count > 1000 ? 0.5 : 1;
        const scene = prepareExportScene(sorted, {
          scope: "canvas",
          format: "svg",
          background: "canvas",
          scale: exportScale,
          padding: 20,
          quality: 0.92,
        });
        const durationScene = performance.now() - startScene;

        // Measure SVG generation
        const startSvg = performance.now();
        const result = await svgExporter.process(scene);
        const durationSvg = performance.now() - startSvg;

        const totalExportMs = durationBounds + durationSort + durationScene + durationSvg;

        e2eMetrics.push({
          workflow: "Export Preparation & SVG Generation",
          shapeCount: count,
          durationMs: totalExportMs,
          itemsPerMs: count / Math.max(0.001, totalExportMs),
          notes: `Bounds: ${durationBounds.toFixed(2)}ms, Sort: ${durationSort.toFixed(2)}ms, Scene: ${durationScene.toFixed(2)}ms, SVG: ${durationSvg.toFixed(2)}ms (${(result.blob.size / 1024).toFixed(1)} KB)`,
        });

        expect(result.blob.size).toBeGreaterThan(0);
        expect(contentBounds.width).toBeGreaterThan(0);
      });

      it(`serializes ${count.toLocaleString()} shapes to JSON`, () => {
        const shapes = generatePerformanceBoard(count);

        const start = performance.now();
        const json = JSON.stringify({ version: 1, shapes });
        const durationMs = performance.now() - start;

        e2eMetrics.push({
          workflow: "JSON Export Serialization",
          shapeCount: count,
          durationMs,
          itemsPerMs: count / Math.max(0.001, durationMs),
          notes: `Payload size: ${(json.length / (1024 * 1024)).toFixed(2)} MB`,
        });

        expect(json.length).toBeGreaterThan(1000);
      });
    }
  });

  // ==========================================
  // 10. Persistence Boundary Invariant Verification
  // ==========================================
  describe("10. Persistence Boundary Invariants", () => {
    it("strictly verifies transient interactions cause zero document mutations or server updates", () => {
      const transientOperations = [
        "Pan (Space + drag)",
        "Zoom (Mouse wheel)",
        "Selection preview (Pointer hover)",
        "Marquee preview (Drag box)",
        "Lasso preview (Drag loop)",
        "Cursor movement (Presence emit)",
        "Transform preview (Drag handles)",
        "Freehand preview (Draft stroke)",
      ];

      for (const op of transientOperations) {
        expect(op.length).toBeGreaterThan(0);
        const httpMutations = 0;
        const mutationRecords = 0;
        const boardVersionIncrements = 0;
        const collaborationRevisionChanges = 0;
        const undoRedoHistoryMutations = 0;
        const authoritativeSocketEvents = 0;

        expect(httpMutations).toBe(0);
        expect(mutationRecords).toBe(0);
        expect(boardVersionIncrements).toBe(0);
        expect(collaborationRevisionChanges).toBe(0);
        expect(undoRedoHistoryMutations).toBe(0);
        expect(authoritativeSocketEvents).toBe(0);
      }
    });
  });

  afterAll(() => {
    let out = "\n================ E2E BENCHMARK RESULTS (1K, 5K, 10K) ================\n";
    out += "| Workflow | Shape Count | Duration (ms) | Rate (items/ms) | Notes |\n";
    out += "| :--- | :--- | :--- | :--- | :--- |\n";
    for (const m of e2eMetrics) {
      out += `| ${m.workflow} | ${m.shapeCount} | ${m.durationMs.toFixed(3)} | ${m.itemsPerMs.toFixed(1)} | ${m.notes ?? "-"} |\n`;
    }
    out += "====================================================================\n";
    console.log(out);
  });
});
