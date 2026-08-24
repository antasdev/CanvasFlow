import type Konva from "konva";
import { useEffect, useRef } from "react";
import { Text, Transformer } from "react-konva";
import { toast } from "sonner";

import { CANVAS_TOOLS } from "../constants";
import { useShapeTransform } from "../hooks";
import { useCanvasStore } from "../store";
import type { TextShape } from "../types";

type TextNodeProps = {
  shape: TextShape;
  boardId?: string;
  onStartEditing: (shape: TextShape) => void;
};

export default function TextNode({
  shape,
  boardId,
  onStartEditing,
}: TextNodeProps): React.JSX.Element {
  const textRef = useRef<Konva.Text | null>(null);
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
    const node = textRef.current;

    if (!transformer || !node) {
      return;
    }

    if (!isSelected || activeTool !== CANVAS_TOOLS.SELECT || isLockedByOther) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      return;
    }

    transformer.nodes([node]);
    transformer.getLayer()?.batchDraw();
  }, [activeTool, isSelected, isLockedByOther]);

  const handleDoubleClick = async (
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>
  ): Promise<void> => {
    event.cancelBubble = true;

    if (isLockedByOther) {
      toast.info(
        `${remoteLock?.fullName || "Another collaborator"} is currently editing this shape.`
      );
      return;
    }

    const lockAcquired = await acquireLock();
    if (!lockAcquired) {
      return;
    }

    onStartEditing(shape);
  };

  return (
    <>
      <Text
        ref={textRef}
        x={displayTransform.x}
        y={displayTransform.y}
        width={displayTransform.width > 0 ? displayTransform.width : undefined}
        height={displayTransform.height > 0 ? displayTransform.height : undefined}
        rotation={displayTransform.rotation}
        text={shape.text || "Type something..."}
        fontSize={shape.fontSize}
        fontFamily={shape.fontFamily || "Inter, sans-serif"}
        fontStyle={shape.fontStyle || "normal"}
        align={shape.textAlign || "left"}
        fill={shape.text ? shape.fill : "#9ca3af"}
        opacity={isLockedByOther ? (shape.opacity ?? 1) * 0.8 : shape.opacity}
        draggable={activeTool === CANVAS_TOOLS.SELECT && !isLockedByOther}
        onDblClick={handleDoubleClick}
        onDblTap={handleDoubleClick}
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

          if (activeTool !== CANVAS_TOOLS.SELECT) {
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
          const node = textRef.current;
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
          const node = textRef.current;

          if (!node) {
            return;
          }

          const scaleX = node.scaleX();
          const scaleY = node.scaleY();

          node.scaleX(1);
          node.scaleY(1);

          const nextWidth = Math.max(5, node.width() * scaleX);
          const nextHeight = Math.max(5, node.height() * scaleY);
          const nextRotation = node.rotation();
          const nextX = node.x();
          const nextY = node.y();

          endTransform({
            x: nextX,
            y: nextY,
            width: nextWidth,
            height: nextHeight,
            rotation: nextRotation,
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
