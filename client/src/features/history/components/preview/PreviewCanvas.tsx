import { RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Layer, Rect, Stage } from "react-konva";

import {
  DEFAULT_ZOOM,
  MAX_ZOOM,
  MIN_ZOOM,
  ZOOM_STEP,
} from "@/features/canvas/constants";
import type { Shape } from "@/features/canvas/types";
import {
  calculateCenterPan,
  calculatePanDelta,
  calculateWheelTransform,
  clampZoom,
  formatZoomPercentage,
} from "@/features/canvas/utils/viewport.utils";

import type { VersionCanvasSnapshot } from "../../types/history.types";
import { mapVersionShapeSnapshotToShape } from "../../utils/history-shape.mapper";
import { PreviewShapeRenderer } from "./PreviewShapeRenderer";

export interface PreviewCanvasProps {
  canvas: VersionCanvasSnapshot;
  className?: string;
}

export function PreviewCanvas({
  canvas,
  className = "",
}: PreviewCanvasProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number }>({
    width: 800,
    height: 600,
  });

  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);

  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Map snapshot shapes to frontend Shape types
  const allShapes = useMemo<Shape[]>(() => {
    return (canvas.shapes ?? []).map((s) => mapVersionShapeSnapshotToShape(s));
  }, [canvas.shapes]);

  // Root shapes (not inside groups), sorted by zIndex ascending
  const rootShapes = useMemo<Shape[]>(() => {
    return allShapes
      .filter((s) => !s.parentId)
      .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  }, [allShapes]);

  // Track container size
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setDimensions({
          width: Math.max(100, Math.floor(entry.contentRect.width)),
          height: Math.max(100, Math.floor(entry.contentRect.height)),
        });
      }
    });

    observer.observe(el);
    return () => {
      observer.disconnect();
    };
  }, []);

  // Initial fit/center when canvas changes
  useEffect(() => {
    if (allShapes.length === 0) {
      setZoom(DEFAULT_ZOOM);
      setPan({ x: 40, y: 40 });
      return;
    }

    // Calculate bounds of all shapes
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const s of allShapes) {
      minX = Math.min(minX, s.x);
      minY = Math.min(minY, s.y);
      maxX = Math.max(maxX, s.x + s.width);
      maxY = Math.max(maxY, s.y + s.height);
    }

    if (minX === Infinity) {
      setZoom(DEFAULT_ZOOM);
      setPan({ x: 40, y: 40 });
      return;
    }

    const contentWidth = Math.max(100, maxX - minX);
    const contentHeight = Math.max(100, maxY - minY);
    const centerX = minX + contentWidth / 2;
    const centerY = minY + contentHeight / 2;

    const padding = 80;
    const availWidth = Math.max(100, dimensions.width - padding * 2);
    const availHeight = Math.max(100, dimensions.height - padding * 2);

    const fitZoom = clampZoom(
      Math.min(availWidth / contentWidth, availHeight / contentHeight, 1)
    );

    const centeredPan = calculateCenterPan(
      { x: centerX, y: centerY },
      fitZoom,
      dimensions
    );

    setZoom(fitZoom);
    setPan(centeredPan);
  }, [canvas.canvasId, dimensions.width, dimensions.height]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle wheel zoom & pan
  const handleWheel = (e: React.WheelEvent<HTMLDivElement>): void => {
    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    const pointerX = rect ? e.clientX - rect.left : dimensions.width / 2;
    const pointerY = rect ? e.clientY - rect.top : dimensions.height / 2;

    const transform = calculateWheelTransform({
      deltaX: e.deltaX,
      deltaY: e.deltaY,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      pointer: { x: pointerX, y: pointerY },
      currentZoom: zoom,
      currentPan: pan,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      zoomStep: ZOOM_STEP,
    });

    setZoom(transform.zoom);
    setPan(transform.pan);
  };

  // Drag to pan
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>): void => {
    // Only pan on left or middle click
    if (e.button !== 0 && e.button !== 1) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY };
    panStartRef.current = { ...pan };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>): void => {
    if (!isDragging || !dragStartRef.current) return;
    const newPan = calculatePanDelta(
      panStartRef.current,
      dragStartRef.current,
      { x: e.clientX, y: e.clientY }
    );
    setPan(newPan);
  };

  const handleMouseUp = (): void => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  // Zoom control buttons
  const handleZoomIn = (): void => {
    const nextZoom = clampZoom(zoom * ZOOM_STEP);
    const centerWorld = {
      x: (dimensions.width / 2 - pan.x) / zoom,
      y: (dimensions.height / 2 - pan.y) / zoom,
    };
    const nextPan = calculateCenterPan(centerWorld, nextZoom, dimensions);
    setZoom(nextZoom);
    setPan(nextPan);
  };

  const handleZoomOut = (): void => {
    const nextZoom = clampZoom(zoom / ZOOM_STEP);
    const centerWorld = {
      x: (dimensions.width / 2 - pan.x) / zoom,
      y: (dimensions.height / 2 - pan.y) / zoom,
    };
    const nextPan = calculateCenterPan(centerWorld, nextZoom, dimensions);
    setZoom(nextZoom);
    setPan(nextPan);
  };

  const handleResetZoom = (): void => {
    setZoom(DEFAULT_ZOOM);
    setPan({ x: 40, y: 40 });
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full h-full overflow-hidden select-none bg-slate-900/50 ${
        isDragging ? "cursor-grabbing" : "cursor-grab"
      } ${className}`}
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      data-testid="version-preview-canvas"
    >
      <Stage
        width={dimensions.width}
        height={dimensions.height}
        x={pan.x}
        y={pan.y}
        scaleX={zoom}
        scaleY={zoom}
        listening={false}
      >
        <Layer listening={false}>
          {/* Canvas sheet / background surface */}
          <Rect
            x={0}
            y={0}
            width={1920}
            height={1080}
            fill={canvas.backgroundColor || "#FFFFFF"}
            shadowColor="#000000"
            shadowBlur={20}
            shadowOffsetX={0}
            shadowOffsetY={4}
            shadowOpacity={0.1}
            listening={false}
          />

          {/* Render all snapshot root shapes */}
          {rootShapes.map((shape) => (
            <PreviewShapeRenderer
              key={shape.id}
              shape={shape}
              allShapes={allShapes}
            />
          ))}
        </Layer>
      </Stage>

      {/* Floating Viewport Zoom Controls */}
      <div className="absolute bottom-4 right-4 z-20 flex items-center gap-1 rounded-lg bg-white/95 backdrop-blur-sm p-1.5 shadow-lg border border-gray-200 text-gray-700">
        <button
          type="button"
          onClick={handleZoomOut}
          disabled={zoom <= MIN_ZOOM}
          title="Zoom Out"
          aria-label="Zoom Out"
          className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <ZoomOut className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={handleResetZoom}
          title="Reset Zoom"
          aria-label={`Current Zoom: ${formatZoomPercentage(zoom)}. Click to reset.`}
          className="px-2 py-1 text-xs font-semibold rounded hover:bg-gray-100 transition-colors tabular-nums min-w-[48px] text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          {formatZoomPercentage(zoom)}
        </button>

        <button
          type="button"
          onClick={handleZoomIn}
          disabled={zoom >= MAX_ZOOM}
          title="Zoom In"
          aria-label="Zoom In"
          className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <ZoomIn className="h-4 w-4" />
        </button>

        <div className="h-4 w-px bg-gray-200 mx-0.5" />

        <button
          type="button"
          onClick={handleResetZoom}
          title="Reset View"
          aria-label="Reset View"
          className="rounded p-1.5 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <RotateCcw className="h-3.5 w-3.5 text-gray-500" />
        </button>
      </div>

      {/* Read-Only Banner Overlay */}
      <div className="absolute top-4 left-4 z-20 flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-medium backdrop-blur-md">
        <span className="h-2 w-2 rounded-full bg-amber-400 animate-pulse" />
        <span>Read-Only Historical Preview — Canvas interactions are disabled</span>
      </div>
    </div>
  );
}
