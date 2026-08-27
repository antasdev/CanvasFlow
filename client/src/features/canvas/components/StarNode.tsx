import type Konva from "konva";
import { useEffect, useRef } from "react";
import { Group, Line, Transformer } from "react-konva";
import { toast } from "sonner";

import { CANVAS_TOOLS } from "../constants";
import { useShapeTransform } from "../hooks";
import { useCanvasStore } from "../store";
import type { StarShape } from "../types";
import { calculateStarPoints } from "../utils/shape-geometry.utils";

type StarNodeProps = {
  shape: StarShape;
  boardId?: string;
  canEditCanvas?: boolean;
};

export default function StarNode({
  shape,
  boardId,
  canEditCanvas = true,
}: StarNodeProps): React.JSX.Element {
  const groupRef = useRef<Konva.Group | null>(null);
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

  useEffect(() => {
    const transformer = transformerRef.current;
    const group = groupRef.current;

    if (!transformer || !group) {
      return;
    }

    if (!canEditCanvas || !isSelected || activeTool !== CANVAS_TOOLS.SELECT || isLockedByOther) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      return;
    }

    transformer.nodes([group]);
    transformer.getLayer()?.batchDraw();
  }, [activeTool, isSelected, isLockedByOther, canEditCanvas]);

  const starPoints = calculateStarPoints(
    displayTransform.width,
    displayTransform.height,
    shape.shapeConfig?.points ?? 5,
    shape.shapeConfig?.innerRadiusRatio ?? 0.5
  );

  return (
    <>
      <Group
        ref={groupRef}
        x={displayTransform.x}
        y={displayTransform.y}
        width={displayTransform.width}
        height={displayTransform.height}
        rotation={displayTransform.rotation}
        opacity={isLockedByOther ? (shape.opacity ?? 1) * 0.8 : shape.opacity}
        draggable={canEditCanvas && activeTool === CANVAS_TOOLS.SELECT && !isLockedByOther}
        onMouseDown={(event) => {
          event.cancelBubble = true;

          if (isLockedByOther) {
            toast.info(
              `${remoteLock?.fullName || "Another collaborator"} is currently editing this shape.`
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
              `${remoteLock?.fullName || "Another collaborator"} is currently editing this shape.`
            );
            return;
          }

          const isAlreadySelected = selectedShapeIds.includes(shape.id);
          if (!isAlreadySelected) {
            selectShape(shape.id);
          }

          dragStartRef.current = {
            x: event.target.x(),
            y: event.target.y(),
          };

          const lockAcquired = await acquireLock();
          if (!lockAcquired) {
            event.target.stopDrag();
          }
        }}
        onDragMove={(event) => {
          event.cancelBubble = true;

          const currentX = event.target.x();
          const currentY = event.target.y();

          if (selectedShapeIds.length > 1 && dragStartRef.current) {
            const deltaX = currentX - dragStartRef.current.x;
            const deltaY = currentY - dragStartRef.current.y;

            dragStartRef.current = {
              x: currentX,
              y: currentY,
            };

            moveSelectedShapes(deltaX, deltaY);
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
          const node = groupRef.current;
          if (!node) {
            return;
          }

          const scaleX = node.scaleX();
          const scaleY = node.scaleY();

          const nextWidth = Math.max(5, node.width() * scaleX);
          const nextHeight = Math.max(5, node.height() * scaleY);

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
          const node = groupRef.current;

          if (!node) {
            return;
          }

          const scaleX = node.scaleX();
          const scaleY = node.scaleY();

          node.scaleX(1);
          node.scaleY(1);

          const nextWidth = Math.max(5, Math.round(node.width() * scaleX));
          const nextHeight = Math.max(5, Math.round(node.height() * scaleY));
          const nextRotation = node.rotation();
          const nextX = node.x();
          const nextY = node.y();

          node.width(nextWidth);
          node.height(nextHeight);

          endTransform({
            x: nextX,
            y: nextY,
            width: nextWidth,
            height: nextHeight,
            rotation: nextRotation,
          });
        }}
      >
        <Line
          points={starPoints}
          closed
          fill={shape.fill}
          stroke={shape.stroke}
          strokeWidth={shape.strokeWidth}
          lineCap="round"
          lineJoin="round"
        />
      </Group>

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
