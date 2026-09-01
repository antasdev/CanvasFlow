import type Konva from "konva";
import React, { memo, useEffect, useRef } from "react";
import { Group, Rect, Transformer } from "react-konva";
import { toast } from "sonner";

import { CANVAS_TOOLS } from "../constants";
import { useShapeTransform } from "../hooks";
import { useCanvasStore } from "../store";
import type { GroupShape, TextShape, StickyNoteShape } from "../types";

import ShapeRenderer from "./ShapeRenderer";

type GroupNodeProps = {
  shape: GroupShape;
  boardId?: string;
  canEditCanvas?: boolean;
  onStartEditing?: (shape: TextShape | StickyNoteShape) => void;
};

function GroupNodeComponent({
  shape,
  boardId,
  canEditCanvas = true,
  onStartEditing,
}: GroupNodeProps): React.JSX.Element {
  const groupRef = useRef<Konva.Group | null>(null);
  const transformerRef = useRef<Konva.Transformer | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const shapes = useCanvasStore((state) => state.shapes);
  const editingGroupId = useCanvasStore((state) => state.editingGroupId);
  const enterGroup = useCanvasStore((state) => state.enterGroup);
  const selectedShapeIds = useCanvasStore((state) => state.selectedShapeIds);
  const moveSelectedShapes = useCanvasStore((state) => state.moveSelectedShapes);
  const updateShapePosition = useCanvasStore((state) => state.updateShapePosition);
  const updateShapeTransform = useCanvasStore((state) => state.updateShapeTransform);

  // Immediate children of this group
  const children = shapes.filter((s) => s.parentId === shape.id);
  const isEditingThisGroup = editingGroupId === shape.id;

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
    startDragGuides,
    updateDragGuides,
    endDragGuides,
  } = useShapeTransform({ shape, boardId });

  // Attach Transformer when selected and not in group edit mode
  useEffect(() => {
    const transformer = transformerRef.current;
    const groupNode = groupRef.current;

    if (!transformer || !groupNode) {
      return;
    }

    if (
      !canEditCanvas ||
      !isSelected ||
      isEditingThisGroup ||
      activeTool !== CANVAS_TOOLS.SELECT ||
      isLockedByOther
    ) {
      transformer.nodes([]);
      transformer.getLayer()?.batchDraw();
      return;
    }

    transformer.nodes([groupNode]);
    transformer.getLayer()?.batchDraw();
  }, [activeTool, isSelected, isEditingThisGroup, isLockedByOther, canEditCanvas]);

  const handleGroupMouseDown = (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>): void => {
    if (isEditingThisGroup) {
      return;
    }

    event.cancelBubble = true;

    if (isLockedByOther) {
      toast.info(
        `${remoteLock?.fullName || "Another collaborator"} is currently editing this group.`
      );
      return;
    }

    if (activeTool !== CANVAS_TOOLS.SELECT) {
      return;
    }

    const isModifier = Boolean(
      ("shiftKey" in event.evt && event.evt.shiftKey) ||
      ("ctrlKey" in event.evt && (event.evt.ctrlKey || event.evt.metaKey))
    );
    if (isModifier || !isSelected) {
      handleSelectionClick(event);
    }
  };

  const handleDblClick = (event: Konva.KonvaEventObject<MouseEvent>): void => {
    event.cancelBubble = true;
    if (canEditCanvas && !isLockedByOther) {
      enterGroup(shape.id);
    }
  };

  return (
    <>
      <Group
        ref={groupRef}
        x={displayTransform.x}
        y={displayTransform.y}
        width={displayTransform.width}
        height={displayTransform.height}
        rotation={displayTransform.rotation}
        draggable={
          canEditCanvas &&
          !isEditingThisGroup &&
          activeTool === CANVAS_TOOLS.SELECT &&
          !isLockedByOther
        }
        onMouseDown={handleGroupMouseDown}
        onDblClick={handleDblClick}
        onDragStart={() => {
          if (isEditingThisGroup) return;
          const node = groupRef.current;
          if (!node) return;

          dragStartRef.current = { x: node.x(), y: node.y() };
          startDragGuides();
          if (canEditCanvas && !isLockedByOther) {
            void acquireLock();
          }
        }}
        onDragMove={() => {
          if (isEditingThisGroup) return;
          const node = groupRef.current;
          if (!node) return;

          const rawX = node.x();
          const rawY = node.y();
          const { snappedX, snappedY } = updateDragGuides(rawX, rawY);
          node.x(snappedX);
          node.y(snappedY);

          if (selectedShapeIds.length > 1 && isSelected && dragStartRef.current) {
            const currentX = snappedX;
            const currentY = snappedY;
            const deltaX = currentX - dragStartRef.current.x;
            const deltaY = currentY - dragStartRef.current.y;

            dragStartRef.current = { x: currentX, y: currentY };
            moveSelectedShapes(deltaX, deltaY);
            return;
          }

          emitTransformFrame({
            x: Math.round(snappedX),
            y: Math.round(snappedY),
            width: shape.width,
            height: shape.height,
            rotation: shape.rotation,
          });
        }}
        onDragEnd={() => {
          if (isEditingThisGroup) return;
          const node = groupRef.current;
          if (!node) return;

          endDragGuides();
          dragStartRef.current = null;
          const finalX = Math.round(node.x());
          const finalY = Math.round(node.y());

          if (selectedShapeIds.length <= 1) {
            updateShapePosition(shape.id, { x: finalX, y: finalY });
          }

          endTransform({
            x: finalX,
            y: finalY,
            width: shape.width,
            height: shape.height,
            rotation: shape.rotation,
          });
        }}
        onTransform={() => {
          if (isEditingThisGroup) return;
          const node = groupRef.current;
          if (!node) return;

          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          const newWidth = Math.max(5, Math.round(node.width() * scaleX));
          const newHeight = Math.max(5, Math.round(node.height() * scaleY));

          emitTransformFrame({
            x: Math.round(node.x()),
            y: Math.round(node.y()),
            width: newWidth,
            height: newHeight,
            rotation: Math.round(node.rotation()),
          });
        }}
        onTransformEnd={() => {
          if (isEditingThisGroup) return;
          const node = groupRef.current;
          if (!node) return;

          const scaleX = node.scaleX();
          const scaleY = node.scaleY();
          const newWidth = Math.max(5, Math.round(node.width() * scaleX));
          const newHeight = Math.max(5, Math.round(node.height() * scaleY));

          node.scaleX(1);
          node.scaleY(1);

          const finalTransform = {
            x: Math.round(node.x()),
            y: Math.round(node.y()),
            width: newWidth,
            height: newHeight,
            rotation: Math.round(node.rotation()),
          };

          updateShapeTransform(shape.id, finalTransform);
          endTransform(finalTransform);
        }}
      >
        {/* Render child shapes inside this group */}
        {children.map((child) => (
          <ShapeRenderer
            key={child.id}
            shape={child}
            boardId={boardId}
            canEditCanvas={canEditCanvas}
            onStartEditing={onStartEditing}
          />
        ))}

        {/* When NOT in edit mode: transparent hit overlay captures clicks for the group */}
        {!isEditingThisGroup && (
          <Rect
            x={0}
            y={0}
            width={shape.width}
            height={shape.height}
            fill="transparent"
            listening={true}
          />
        )}

        {/* When in edit mode: visual indicator bounding box around group */}
        {isEditingThisGroup && (
          <Rect
            x={0}
            y={0}
            width={shape.width}
            height={shape.height}
            stroke="#3b82f6"
            strokeWidth={1.5}
            dash={[6, 4]}
            listening={false}
          />
        )}
      </Group>

      {/* Group Transformer */}
      {canEditCanvas &&
        isSelected &&
        !isEditingThisGroup &&
        activeTool === CANVAS_TOOLS.SELECT &&
        !isLockedByOther && (
          <Transformer
            ref={transformerRef}
            flipEnabled={false}
            boundBoxFunc={(oldBox, newBox) => {
              if (Math.abs(newBox.width) < 5 || Math.abs(newBox.height) < 5) {
                return oldBox;
              }
              return newBox;
            }}
          />
        )}
    </>
  );
}

const GroupNode = memo(GroupNodeComponent);
export default GroupNode;
