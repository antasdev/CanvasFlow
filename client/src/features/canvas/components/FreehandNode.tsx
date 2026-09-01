import type Konva from "konva";
import { useEffect, useRef } from "react";
import { Line, Transformer } from "react-konva";
import { toast } from "sonner";

import { CANVAS_TOOLS } from "../constants";
import { useShapeTransform } from "../hooks";
import { useCanvasStore } from "../store";
import type { FreehandShape } from "../types";
import { getKonvaStyleProps } from "../utils/shape-style.utils";
import { computeBoundingBox, normalizePointsToLocal } from "../utils/stroke-simplification";

type FreehandNodeProps = {
  shape: FreehandShape;
  boardId?: string;
  canEditCanvas?: boolean;
};

export default function FreehandNode({
  shape,
  boardId,
  canEditCanvas = true,
}: FreehandNodeProps): React.JSX.Element {
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
    handleSelectionClick,
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
        tension={0.2}
        lineCap="round"
        lineJoin="round"
        stroke={styleProps.stroke}
        strokeWidth={styleProps.strokeWidth}
        dash={styleProps.dash}
        shadowEnabled={styleProps.shadowEnabled}
        shadowColor={styleProps.shadowColor}
        shadowBlur={styleProps.shadowBlur}
        shadowOffsetX={styleProps.shadowOffset.x}
        shadowOffsetY={styleProps.shadowOffset.y}
        shadowOpacity={styleProps.shadowOpacity}
        hitStrokeWidth={Math.max((styleProps.strokeWidth || 2) + 12, 16)}
        rotation={displayTransform.rotation}
        scaleX={isLockedByOther ? remoteScaleX : 1}
        scaleY={isLockedByOther ? remoteScaleY : 1}
        opacity={styleProps.opacity}
        draggable={canEditCanvas && activeTool === CANVAS_TOOLS.SELECT && !isLockedByOther}
        onMouseDown={(event) => {
          event.cancelBubble = true;

          if (isLockedByOther) {
            toast.info(
              `${remoteLock?.fullName || "Another collaborator"} is currently editing this stroke.`
            );
            return;
          }

          if (activeTool !== CANVAS_TOOLS.SELECT) {
            return;
          }

          const isModifier = Boolean(
            event.evt.shiftKey || event.evt.ctrlKey || event.evt.metaKey
          );
          if (isModifier || !selectedShapeIds.includes(shape.id)) {
            handleSelectionClick(event);
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
              `${remoteLock?.fullName || "Another collaborator"} is currently editing this stroke.`
            );
            return;
          }

          await acquireLock();
          dragStartRef.current = {
            x: event.target.x(),
            y: event.target.y(),
          };
        }}
        onDragMove={(event) => {
          event.cancelBubble = true;
          const currentX = event.target.x();
          const currentY = event.target.y();

          emitTransformFrame({
            x: currentX,
            y: currentY,
            width: shape.width,
            height: shape.height,
            rotation: shape.rotation,
          });

          if (selectedShapeIds.length > 1 && dragStartRef.current) {
            const deltaX = currentX - dragStartRef.current.x;
            const deltaY = currentY - dragStartRef.current.y;
            moveSelectedShapes(deltaX, deltaY);
            dragStartRef.current = { x: currentX, y: currentY };
          }
        }}
        onDragEnd={(event) => {
          event.cancelBubble = true;
          const currentX = event.target.x();
          const currentY = event.target.y();

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
