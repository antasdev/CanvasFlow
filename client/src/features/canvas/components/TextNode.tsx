import type Konva from "konva";
import { useEffect, useRef } from "react";
import { Text, Transformer } from "react-konva";
import { toast } from "sonner";

import { CANVAS_TOOLS } from "../constants";
import { useShapeTransform } from "../hooks";
import { useCanvasStore } from "../store";
import type { TextShape } from "../types";
import { getKonvaFontStyle } from "../utils/text.utils";

type TextNodeProps = {
  shape: TextShape;
  boardId?: string;
  canEditCanvas?: boolean;
  onStartEditing: (shape: TextShape) => void;
};

export default function TextNode({
  shape,
  boardId,
  canEditCanvas = true,
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
    handleSelectionClick,
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

    if (!canEditCanvas || !isSelected || activeTool !== CANVAS_TOOLS.SELECT || isLockedByOther) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      return;
    }

    transformer.nodes([node]);
    transformer.getLayer()?.batchDraw();
  }, [activeTool, isSelected, isLockedByOther, canEditCanvas]);

  const handleDoubleClick = async (
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>
  ): Promise<void> => {
    event.cancelBubble = true;

    if (!canEditCanvas) {
      return;
    }

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
        fontStyle={getKonvaFontStyle(shape.fontWeight, shape.fontStyle)}
        textDecoration={shape.textDecoration || "none"}
        align={shape.textAlign || "left"}
        verticalAlign={shape.verticalAlign || "top"}
        padding={typeof shape.padding === "number" ? shape.padding : 4}
        lineHeight={typeof shape.lineHeight === "number" ? shape.lineHeight : 1.2}
        wrap="word"
        fill={shape.text ? shape.fill : "#9ca3af"}
        opacity={isLockedByOther ? (shape.opacity ?? 1) * 0.8 : (shape.opacity ?? 1)}
        shadowEnabled={Boolean(shape.shadow?.enabled)}
        shadowColor={shape.shadow?.color ?? "#000000"}
        shadowBlur={typeof shape.shadow?.blur === "number" ? shape.shadow.blur : 10}
        shadowOffsetX={typeof shape.shadow?.offsetX === "number" ? shape.shadow.offsetX : 0}
        shadowOffsetY={typeof shape.shadow?.offsetY === "number" ? shape.shadow.offsetY : 4}
        shadowOpacity={typeof shape.shadow?.opacity === "number" ? shape.shadow.opacity : 0.3}
        draggable={canEditCanvas && activeTool === CANVAS_TOOLS.SELECT && !isLockedByOther}
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
