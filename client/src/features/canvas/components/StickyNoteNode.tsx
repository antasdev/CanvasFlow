import type Konva from "konva";
import { useEffect, useRef } from "react";
import { Group, Rect, Text, Transformer } from "react-konva";
import { toast } from "sonner";

import { CANVAS_TOOLS } from "../constants";
import { socketClientService } from "@/services/socket";
import { useCanvasStore } from "../store";
import type { StickyNoteShape } from "../types";

type StickyNoteNodeProps = {
  shape: StickyNoteShape;
  boardId?: string;
  onStartEditing: (shape: StickyNoteShape) => void;
};

export default function StickyNoteNode({
  shape,
  boardId,
  onStartEditing,
}: StickyNoteNodeProps): React.JSX.Element {
  const groupRef = useRef<Konva.Group | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);

  const dragStartRef = useRef<{
    x: number;
    y: number;
  } | null>(null);

  const activeTool = useCanvasStore((state) => state.activeTool);
  const selectedShapeIds = useCanvasStore((state) => state.selectedShapeIds);
  const remoteShapeLocks = useCanvasStore((state) => state.remoteShapeLocks);
  const selectShape = useCanvasStore((state) => state.selectShape);
  const toggleShapeSelection = useCanvasStore((state) => state.toggleShapeSelection);
  const updateShapeTransform = useCanvasStore((state) => state.updateShapeTransform);
  const moveSelectedShapes = useCanvasStore((state) => state.moveSelectedShapes);

  const isSelected = selectedShapeIds.includes(shape.id);
  const remoteLock = remoteShapeLocks[shape.id];
  const isLockedByOther = Boolean(remoteLock);

  useEffect(() => {
    const transformer = transformerRef.current;
    const node = groupRef.current;

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
        `${remoteLock.fullName || "Another collaborator"} is currently editing this shape.`
      );
      return;
    }

    if (boardId) {
      try {
        await socketClientService.lockShape(boardId, shape.id);
      } catch (err) {
        toast.info(
          err instanceof Error
            ? err.message
            : "Shape is currently being edited by another collaborator."
        );
        return;
      }
    }

    onStartEditing(shape);
  };

  return (
    <>
      <Group
        ref={groupRef}
        x={shape.x}
        y={shape.y}
        width={shape.width}
        height={shape.height}
        rotation={shape.rotation}
        opacity={isLockedByOther ? (shape.opacity ?? 1) * 0.8 : shape.opacity}
        draggable={activeTool === CANVAS_TOOLS.SELECT && !isLockedByOther}
        onDblClick={handleDoubleClick}
        onDblTap={handleDoubleClick}
        onMouseDown={(event) => {
          event.cancelBubble = true;

          if (isLockedByOther) {
            toast.info(
              `${remoteLock.fullName || "Another collaborator"} is currently editing this shape.`
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
        onDragStart={(event) => {
          event.cancelBubble = true;

          if (activeTool !== CANVAS_TOOLS.SELECT) {
            return;
          }

          if (isLockedByOther) {
            event.target.stopDrag();
            toast.info(
              `${remoteLock.fullName || "Another collaborator"} is currently editing this shape.`
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

          if (boardId) {
            socketClientService.lockShape(boardId, shape.id).catch((err) => {
              event.target.stopDrag();
              toast.info(
                err instanceof Error
                  ? err.message
                  : "Shape is currently being edited by another collaborator."
              );
            });
          }
        }}
        onDragMove={(event) => {
          event.cancelBubble = true;

          if (selectedShapeIds.length <= 1) {
            return;
          }

          if (!dragStartRef.current) {
            return;
          }

          const currentX = event.target.x();
          const currentY = event.target.y();

          const deltaX = currentX - dragStartRef.current.x;
          const deltaY = currentY - dragStartRef.current.y;

          dragStartRef.current = {
            x: currentX,
            y: currentY,
          };

          moveSelectedShapes(deltaX, deltaY);
        }}
        onDragEnd={(event) => {
          event.cancelBubble = true;

          const targetX = event.target.x();
          const targetY = event.target.y();

          if (selectedShapeIds.length <= 1) {
            updateShapeTransform(shape.id, {
              x: targetX,
              y: targetY,
              width: shape.width,
              height: shape.height,
              rotation: shape.rotation,
            });

            if (boardId) {
              socketClientService
                .updateShape(shape.id, {
                  x: targetX,
                  y: targetY,
                })
                .catch((err) => {
                  toast.error(
                    err instanceof Error
                      ? err.message
                      : "Failed to persist sticky note move."
                  );
                })
                .finally(() => {
                  socketClientService
                    .unlockShape(boardId, shape.id)
                    .catch(() => {});
                });
            }
          } else {
            if (boardId) {
              socketClientService
                .unlockShape(boardId, shape.id)
                .catch(() => {});
            }
          }

          dragStartRef.current = null;
        }}
        onTransformStart={async (event) => {
          event.cancelBubble = true;
          if (boardId) {
            try {
              await socketClientService.lockShape(boardId, shape.id);
            } catch (err) {
              toast.info(
                err instanceof Error
                  ? err.message
                  : "Shape is currently locked by another collaborator."
              );
            }
          }
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

          const nextWidth = Math.max(50, node.width() * scaleX);
          const nextHeight = Math.max(50, node.height() * scaleY);
          const nextRotation = node.rotation();
          const nextX = node.x();
          const nextY = node.y();

          updateShapeTransform(shape.id, {
            x: nextX,
            y: nextY,
            width: nextWidth,
            height: nextHeight,
            rotation: nextRotation,
          });

          if (boardId) {
            socketClientService
              .updateShape(shape.id, {
                x: nextX,
                y: nextY,
                width: nextWidth,
                height: nextHeight,
                rotation: nextRotation,
              })
              .catch((err) => {
                toast.error(
                  err instanceof Error
                    ? err.message
                    : "Failed to persist sticky note transform."
                );
              })
              .finally(() => {
                socketClientService
                  .unlockShape(boardId, shape.id)
                  .catch(() => {});
              });
          }
        }}
      >
        <Rect
          width={shape.width}
          height={shape.height}
          fill={shape.backgroundColor || "#fef08a"}
          cornerRadius={4}
          shadowColor="rgba(0, 0, 0, 0.15)"
          shadowBlur={6}
          shadowOffset={{ x: 2, y: 3 }}
          stroke="rgba(0, 0, 0, 0.08)"
          strokeWidth={1}
        />
        <Text
          x={12}
          y={12}
          width={Math.max(10, shape.width - 24)}
          height={Math.max(10, shape.height - 24)}
          text={shape.text || "New note"}
          fontSize={shape.fontSize || 18}
          fontFamily="Inter, sans-serif"
          fill={shape.text ? shape.textColor || "#1f2937" : "#9ca3af"}
          wrap="word"
          ellipsis={true}
        />
      </Group>

      {isSelected && activeTool === CANVAS_TOOLS.SELECT && !isLockedByOther && (
        <Transformer
          ref={transformerRef}
          rotateEnabled={true}
          keepRatio={false}
          boundBoxFunc={(oldBox, newBox) => {
            if (newBox.width < 50 || newBox.height < 50) {
              return oldBox;
            }
            return newBox;
          }}
        />
      )}
    </>
  );
}
