import { useCallback, useRef, useState } from "react";
import type Konva from "konva";
import { useCanvasStore } from "../store";
import {
  DEFAULT_ZOOM,
  ZOOM_STEP,
  MIN_ZOOM,
  MAX_ZOOM,
} from "../constants";
import type { CanvasPoint } from "../utils/canvas.coordinates";
import {
  calculatePointerZoom,
  calculateWheelTransform,
  calculatePanDelta,
  formatZoomPercentage,
} from "../utils/viewport.utils";

export type UseCanvasViewportOptions = {
  stageRef?: React.RefObject<Konva.Stage | null>;
};

export function useCanvasViewport({ stageRef }: UseCanvasViewportOptions = {}) {
  const zoom = useCanvasStore((state) => state.zoom);
  const pan = useCanvasStore((state) => state.pan);
  const setZoom = useCanvasStore((state) => state.setZoom);
  const setPan = useCanvasStore((state) => state.setPan);

  const [isPanning, setIsPanning] = useState(false);
  const panStartRef = useRef<{ startPan: CanvasPoint; pointerStart: CanvasPoint } | null>(null);

  const startPan = useCallback(
    (screenPoint: CanvasPoint): void => {
      panStartRef.current = {
        startPan: { ...pan },
        pointerStart: { ...screenPoint },
      };
      setIsPanning(true);
    },
    [pan],
  );

  const updatePan = useCallback(
    (screenPoint: CanvasPoint): void => {
      if (!panStartRef.current) return;
      const nextPan = calculatePanDelta(
        panStartRef.current.startPan,
        panStartRef.current.pointerStart,
        screenPoint,
      );
      setPan(nextPan.x, nextPan.y);
    },
    [setPan],
  );

  const endPan = useCallback((): void => {
    panStartRef.current = null;
    setIsPanning(false);
  }, []);

  const cancelPan = useCallback((): void => {
    if (panStartRef.current) {
      setPan(panStartRef.current.startPan.x, panStartRef.current.startPan.y);
      panStartRef.current = null;
    }
    setIsPanning(false);
  }, [setPan]);

  const handleWheel = useCallback(
    (event: Konva.KonvaEventObject<WheelEvent>): void => {
      event.evt.preventDefault();
      const stage = stageRef?.current;
      if (!stage) return;

      const pointer = stage.getPointerPosition();
      if (!pointer) return;

      const nextTransform = calculateWheelTransform({
        deltaX: event.evt.deltaX,
        deltaY: event.evt.deltaY,
        ctrlKey: event.evt.ctrlKey,
        metaKey: event.evt.metaKey,
        pointer,
        currentZoom: zoom,
        currentPan: pan,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        zoomStep: ZOOM_STEP,
      });

      if (nextTransform.zoom !== zoom) {
        setZoom(nextTransform.zoom);
      }
      if (
        nextTransform.pan.x !== pan.x ||
        nextTransform.pan.y !== pan.y
      ) {
        setPan(nextTransform.pan.x, nextTransform.pan.y);
      }
    },
    [stageRef, zoom, pan, setZoom, setPan],
  );

  const zoomIn = useCallback((): void => {
    const stage = stageRef?.current;
    const center: CanvasPoint = stage
      ? { x: stage.width() / 2, y: stage.height() / 2 }
      : { x: 500, y: 400 };

    const targetZoom = zoom * ZOOM_STEP;
    const nextTransform = calculatePointerZoom(
      center,
      zoom,
      targetZoom,
      pan,
      MIN_ZOOM,
      MAX_ZOOM,
    );

    setZoom(nextTransform.zoom);
    setPan(nextTransform.pan.x, nextTransform.pan.y);
  }, [stageRef, zoom, pan, setZoom, setPan]);

  const zoomOut = useCallback((): void => {
    const stage = stageRef?.current;
    const center: CanvasPoint = stage
      ? { x: stage.width() / 2, y: stage.height() / 2 }
      : { x: 500, y: 400 };

    const targetZoom = zoom / ZOOM_STEP;
    const nextTransform = calculatePointerZoom(
      center,
      zoom,
      targetZoom,
      pan,
      MIN_ZOOM,
      MAX_ZOOM,
    );

    setZoom(nextTransform.zoom);
    setPan(nextTransform.pan.x, nextTransform.pan.y);
  }, [stageRef, zoom, pan, setZoom, setPan]);

  const resetZoom = useCallback((): void => {
    const stage = stageRef?.current;
    const center: CanvasPoint = stage
      ? { x: stage.width() / 2, y: stage.height() / 2 }
      : { x: 500, y: 400 };

    const nextTransform = calculatePointerZoom(
      center,
      zoom,
      DEFAULT_ZOOM,
      pan,
      MIN_ZOOM,
      MAX_ZOOM,
    );

    setZoom(nextTransform.zoom);
    setPan(nextTransform.pan.x, nextTransform.pan.y);
  }, [stageRef, zoom, pan, setZoom, setPan]);

  const zoomTo = useCallback(
    (targetZoom: number): void => {
      const stage = stageRef?.current;
      const center: CanvasPoint = stage
        ? { x: stage.width() / 2, y: stage.height() / 2 }
        : { x: 500, y: 400 };

      const nextTransform = calculatePointerZoom(
        center,
        zoom,
        targetZoom,
        pan,
        MIN_ZOOM,
        MAX_ZOOM,
      );

      setZoom(nextTransform.zoom);
      setPan(nextTransform.pan.x, nextTransform.pan.y);
    },
    [stageRef, zoom, pan, setZoom, setPan],
  );

  return {
    zoom,
    pan,
    formattedZoom: formatZoomPercentage(zoom),
    isPanning,
    startPan,
    updatePan,
    endPan,
    cancelPan,
    handleWheel,
    zoomIn,
    zoomOut,
    resetZoom,
    zoomTo,
  };
}
