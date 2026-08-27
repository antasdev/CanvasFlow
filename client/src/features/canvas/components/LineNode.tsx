import type Konva from "konva";
import React, { memo, useEffect, useRef } from "react";
import { Line, Transformer } from "react-konva";
import { toast } from "sonner";

import { CANVAS_TOOLS } from "../constants";
import { useShapeTransform } from "../hooks";
import { useCanvasStore } from "../store";
import type { LineShape } from "../types";
import { computeBoundingBox, normalizePointsToLocal } from "../utils/stroke-simplification";
import { getKonvaStyleProps } from "../utils/shape-style.utils";

type LineNodeProps = {
  shape: LineShape;
  boardId?: string;
  canEditCanvas?: boolean;
};

function LineNodeComponent({
  shape,
  boardId,
  canEditCanvas = true,
}: LineNodeProps): React.JSX.Element {
  const lineRef = useRef<Konva.Line | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

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

  const styleProps = getKonvaStyleProps(shape, isLockedByOther);

  // Attach Transformer when selected
  useEffect(() => {
    const transformer = transformerRef.current;
    const line = lineRef.current;

    if (!transformer || !line) {
      return;
    }

    if (!canEditCanvas || !isSelected || activeTool !== CANVAS_TOOLS.SELECT || isLockedByOther) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      return;
    }

    transformer.nodes([line]);
    transformer.getLayer()?.batchDraw();
  }, [activeTool, isSelected, isLockedByOther, canEditCanvas]);

  // If remote transform is active, calculate scale factors from displayTransform
  const remoteScaleX =
    displayTransform.width && shape.width ? displayTransform.width / shape.width : 1;
  const remoteScaleY =
    displayTransform.height && shape.height ? displayTransform.height / shape.height : 1;

  return (
    <>
      <Line
        ref={lineRef}
        x={displayTransform.x}
        y={displayTransform.y}
        points={shape.points}
        stroke={styleProps.stroke}
        strokeWidth={styleProps.strokeWidth}
        hitStrokeWidth={Math.max((styleProps.strokeWidth || 2) + 12, 16)}
        lineCap="round"
        lineJoin="round"
        dash={styleProps.dash}
        shadowEnabled={styleProps.shadowEnabled}
        shadowColor={styleProps.shadowColor}
        shadowBlur={styleProps.shadowBlur}
        shadowOffsetX={styleProps.shadowOffset.x}
        shadowOffsetY={styleProps.shadowOffset.y}
        shadowOpacity={styleProps.shadowOpacity}
        rotation={displayTransform.rotation}
        scaleX={isLockedByOther ? remoteScaleX : 1}
        scaleY={isLockedByOther ? remoteScaleY : 1}
        opacity={styleProps.opacity}
        draggable={canEditCanvas && activeTool === CANVAS_TOOLS.SELECT && !isLockedByOther}
        onMouseDown={(event) => {
          event.cancelBubble = true;

          if (isLockedByOther) {
            toast.info(
              `${remoteLock?.fullName || "Another collaborator"} is currently editing this line.`
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
              `${remoteLock?.fullName || "Another collaborator"} is currently editing this line.`
            );
            return;
          }

          if (!selectedShapeIds.includes(shape.id)) {
            selectShape(shape.id);
          }

          const node = lineRef.current;
          if (node) {
            dragStartRef.current = { x: node.x(), y: node.y() };
          }

          await acquireLock();
        }}
        onDragMove={(event) => {
          event.cancelBubble = true;
          const node = lineRef.current;
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
          const node = lineRef.current;
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
          const node = lineRef.current;
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
          const node = lineRef.current;
          if (!node) {
            return;
          }

          const scaleX = node.scaleX();
          const scaleY = node.scaleY();

          // Reset Konva node scale to 1 for normalized geometry
          node.scaleX(1);
          node.scaleY(1);

          // Rescale local points using scale factors
          const rescaledPoints = shape.points.map((val, i) =>
            i % 2 === 0 ? val * scaleX : val * scaleY
          );

          // Calculate normalized bounding box (handling flipping/negative scale)
          const bbox = computeBoundingBox(rescaledPoints, shape.strokeWidth);
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

export const LineNode = memo(LineNodeComponent);
export default LineNode;
