import type Konva from "konva";
import React, { memo, useEffect, useRef } from "react";
import { Arrow, Transformer } from "react-konva";
import { toast } from "sonner";

import { CANVAS_TOOLS } from "../constants";
import { useShapeTransform } from "../hooks";
import { useCanvasStore } from "../store";
import type { ConnectorShape } from "../types";
import { getShapeAnchorPoint } from "../utils/anchor.utils";
import { computeBoundingBox, normalizePointsToLocal } from "../utils/stroke-simplification";

type ConnectorNodeProps = {
  shape: ConnectorShape;
  boardId?: string;
  canEditCanvas?: boolean;
};

function ConnectorNodeComponent({
  shape,
  boardId,
  canEditCanvas = true,
}: ConnectorNodeProps): React.JSX.Element {
  const arrowRef = useRef<Konva.Arrow | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const shapes = useCanvasStore((state) => state.shapes);
  const selectedShapeIds = useCanvasStore((state) => state.selectedShapeIds);
  const moveSelectedShapes = useCanvasStore((state) => state.moveSelectedShapes);

  const {
    activeTool,
    isSelected,
    isLockedByOther,
    remoteLock,
    displayTransform,
    selectShape,
    toggleShapeSelection,
    acquireLock,
    emitTransformFrame,
    endTransform,
  } = useShapeTransform({ shape, boardId });

  // Resolve connected source and target shapes from canvas store
  const connector = shape.connector;
  const sourceShape = connector?.sourceShapeId
    ? shapes.find((s) => s.id === connector.sourceShapeId)
    : undefined;
  const targetShape = connector?.targetShapeId
    ? shapes.find((s) => s.id === connector.targetShapeId)
    : undefined;

  const hasSourceAttachment = Boolean(sourceShape && connector?.sourceAnchor);
  const hasTargetAttachment = Boolean(targetShape && connector?.targetAnchor);
  const isAttached = hasSourceAttachment || hasTargetAttachment;

  // Derive start and end endpoints
  // If attached to a valid shape, derive dynamically from anchor position; otherwise fallback to stored geometry
  const fallbackStartX = shape.x + (shape.points[0] ?? 0);
  const fallbackStartY = shape.y + (shape.points[1] ?? 0);
  const fallbackEndX = shape.x + (shape.points[2] ?? shape.width);
  const fallbackEndY = shape.y + (shape.points[3] ?? shape.height);

  const startWorld = hasSourceAttachment && sourceShape && connector?.sourceAnchor
    ? getShapeAnchorPoint(sourceShape, connector.sourceAnchor)
    : { x: fallbackStartX, y: fallbackStartY };

  const endWorld = hasTargetAttachment && targetShape && connector?.targetAnchor
    ? getShapeAnchorPoint(targetShape, connector.targetAnchor)
    : { x: fallbackEndX, y: fallbackEndY };

  // Attach Transformer when selected and completely unattached
  useEffect(() => {
    const transformer = transformerRef.current;
    const arrow = arrowRef.current;

    if (!transformer || !arrow) {
      return;
    }

    if (
      !canEditCanvas ||
      !isSelected ||
      activeTool !== CANVAS_TOOLS.SELECT ||
      isLockedByOther ||
      isAttached
    ) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      return;
    }

    transformer.nodes([arrow]);
    transformer.getLayer()?.batchDraw();
  }, [activeTool, isSelected, isLockedByOther, isAttached, canEditCanvas]);

  const strokeColor = shape.stroke || "#1f2937";
  const strokeWidth = shape.strokeWidth || 2;
  const pointerLength = shape.pointerLength ?? 10;
  const pointerWidth = shape.pointerWidth ?? 10;
  const pointerAtEnding = shape.arrowHeadEnd !== false;
  const pointerAtBeginning = Boolean(shape.arrowHeadStart);

  // If completely unattached, render using local coordinates and displayTransform (supports dragging/transformer)
  // If attached to at least one shape, render directly using derived world coordinates at (0, 0)
  if (isAttached) {
    const derivedPoints = [startWorld.x, startWorld.y, endWorld.x, endWorld.y];

    return (
      <Arrow
        ref={arrowRef}
        x={0}
        y={0}
        points={derivedPoints}
        stroke={strokeColor}
        fill={strokeColor}
        strokeWidth={strokeWidth}
        hitStrokeWidth={Math.max(strokeWidth + 12, 16)}
        pointerLength={pointerLength}
        pointerWidth={pointerWidth}
        pointerAtEnding={pointerAtEnding}
        pointerAtBeginning={pointerAtBeginning}
        lineCap="round"
        lineJoin="round"
        opacity={isLockedByOther ? (shape.opacity ?? 1) * 0.8 : shape.opacity ?? 1}
        draggable={false}
        onMouseDown={(event) => {
          event.cancelBubble = true;

          if (isLockedByOther) {
            toast.info(
              `${remoteLock?.fullName || "Another collaborator"} is currently editing this connector.`
            );
            return;
          }

          if (activeTool !== CANVAS_TOOLS.SELECT) {
            return;
          }

          if (event.evt.shiftKey) {
            toggleShapeSelection(shape.id);
            return;
          }

          if (!selectedShapeIds.includes(shape.id)) {
            selectShape(shape.id);
          }
        }}
      />
    );
  }

  // Unattached fallback: fully draggable and transformable vector arrow
  const remoteScaleX =
    displayTransform.width && shape.width ? displayTransform.width / shape.width : 1;
  const remoteScaleY =
    displayTransform.height && shape.height ? displayTransform.height / shape.height : 1;

  return (
    <>
      <Arrow
        ref={arrowRef}
        x={displayTransform.x}
        y={displayTransform.y}
        points={shape.points}
        stroke={strokeColor}
        fill={strokeColor}
        strokeWidth={strokeWidth}
        hitStrokeWidth={Math.max(strokeWidth + 12, 16)}
        pointerLength={pointerLength}
        pointerWidth={pointerWidth}
        pointerAtEnding={pointerAtEnding}
        pointerAtBeginning={pointerAtBeginning}
        lineCap="round"
        lineJoin="round"
        rotation={displayTransform.rotation}
        scaleX={isLockedByOther ? remoteScaleX : 1}
        scaleY={isLockedByOther ? remoteScaleY : 1}
        opacity={isLockedByOther ? (shape.opacity ?? 1) * 0.8 : shape.opacity ?? 1}
        draggable={canEditCanvas && activeTool === CANVAS_TOOLS.SELECT && !isLockedByOther}
        onMouseDown={(event) => {
          event.cancelBubble = true;

          if (isLockedByOther) {
            toast.info(
              `${remoteLock?.fullName || "Another collaborator"} is currently editing this connector.`
            );
            return;
          }

          if (activeTool !== CANVAS_TOOLS.SELECT) {
            return;
          }

          if (event.evt.shiftKey) {
            toggleShapeSelection(shape.id);
            return;
          }

          if (!selectedShapeIds.includes(shape.id)) {
            selectShape(shape.id);
          }
        }}
        onDragStart={async (event) => {
          event.cancelBubble = true;

          if (!canEditCanvas || activeTool !== CANVAS_TOOLS.SELECT) {
            event.target.stopDrag();
            return;
          }

          if (isLockedByOther) {
            event.target.stopDrag();
            toast.info(
              `${remoteLock?.fullName || "Another collaborator"} is currently editing this connector.`
            );
            return;
          }

          if (!selectedShapeIds.includes(shape.id)) {
            selectShape(shape.id);
          }

          const node = arrowRef.current;
          if (node) {
            dragStartRef.current = { x: node.x(), y: node.y() };
          }

          await acquireLock();
        }}
        onDragMove={(event) => {
          event.cancelBubble = true;
          const node = arrowRef.current;
          const dragStart = dragStartRef.current;

          if (!node || !dragStart) {
            return;
          }

          const currentX = node.x();
          const currentY = node.y();
          const dx = currentX - dragStart.x;
          const dy = currentY - dragStart.y;

          if (selectedShapeIds.length > 1) {
            moveSelectedShapes(dx, dy);
            dragStartRef.current = { x: currentX, y: currentY };
          }

          emitTransformFrame({
            x: currentX,
            y: currentY,
            width: shape.width,
            height: shape.height,
            rotation: shape.rotation,
          });
        }}
        onDragEnd={(event) => {
          event.cancelBubble = true;
          const node = arrowRef.current;
          if (!node) {
            return;
          }

          const currentX = node.x();
          const currentY = node.y();
          const dragStart = dragStartRef.current;
          dragStartRef.current = null;

          const delta = dragStart
            ? { x: currentX - dragStart.x, y: currentY - dragStart.y }
            : undefined;

          endTransform(
            {
              x: currentX,
              y: currentY,
              width: shape.width,
              height: shape.height,
              rotation: shape.rotation,
            },
            delta
          );
        }}
        onTransformStart={async (event) => {
          event.cancelBubble = true;
          await acquireLock();
        }}
        onTransform={(event) => {
          event.cancelBubble = true;
          const node = arrowRef.current;
          if (!node) {
            return;
          }

          const scaleX = node.scaleX();
          const scaleY = node.scaleY();

          const nextWidth = Math.max(1, shape.width * Math.abs(scaleX));
          const nextHeight = Math.max(1, shape.height * Math.abs(scaleY));

          emitTransformFrame({
            x: node.x(),
            y: node.y(),
            width: nextWidth,
            height: nextHeight,
            rotation: node.rotation(),
          });
        }}
        onTransformEnd={(event) => {
          event.cancelBubble = true;
          const node = arrowRef.current;
          if (!node) {
            return;
          }

          const scaleX = node.scaleX();
          const scaleY = node.scaleY();

          node.scaleX(1);
          node.scaleY(1);

          const rescaledPoints = shape.points.map((val, i) =>
            i % 2 === 0 ? val * scaleX : val * scaleY
          );

          const bbox = computeBoundingBox(rescaledPoints, strokeWidth);
          const normalizedLocalPoints = normalizePointsToLocal(rescaledPoints, bbox.x, bbox.y);

          const finalX = node.x() + bbox.x;
          const finalY = node.y() + bbox.y;
          const finalRotation = node.rotation();

          endTransform({
            x: finalX,
            y: finalY,
            width: bbox.width,
            height: bbox.height,
            rotation: finalRotation,
            points: normalizedLocalPoints,
          });
        }}
      />

      {isSelected && activeTool === CANVAS_TOOLS.SELECT && !isLockedByOther && (
        <Transformer
          ref={transformerRef}
          rotateEnabled={true}
          keepRatio={false}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 5 || newBox.height < 5) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
}

export const ConnectorNode = memo(ConnectorNodeComponent);
export default ConnectorNode;
