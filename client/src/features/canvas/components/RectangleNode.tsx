import type Konva from "konva";
import { useEffect, useRef } from "react";
import { Rect, Transformer } from "react-konva";
import { toast } from "sonner";

import { CANVAS_TOOLS } from "../constants";
import { socketClientService } from "@/services/socket";
import { useCanvasStore } from "../store";
import type { RectangleShape } from "../types";

type RectangleNodeProps = {
    shape: RectangleShape;
    boardId?: string;
};

export default function RectangleNode({
    shape,
    boardId,
}: RectangleNodeProps): React.JSX.Element {
    const rectRef = useRef<Konva.Rect | null>(null);
    const transformerRef =
        useRef<Konva.Transformer | null>(null);

    const dragStartRef = useRef<{
        x: number;
        y: number;
    } | null>(null);

    const activeTool = useCanvasStore(
        (state) => state.activeTool,
    );

    const selectedShapeIds = useCanvasStore(
        (state) => state.selectedShapeIds,
    );

    const remoteShapeLocks = useCanvasStore(
        (state) => state.remoteShapeLocks,
    );

    const selectShape = useCanvasStore(
        (state) => state.selectShape,
    );

    const toggleShapeSelection = useCanvasStore(
        (state) => state.toggleShapeSelection,
    );

    const updateRectangleTransform = useCanvasStore(
        (state) => state.updateRectangleTransform,
    );

    const moveSelectedShapes = useCanvasStore(
        (state) => state.moveSelectedShapes,
    );

    const isSelected = selectedShapeIds.includes(shape.id);
    const remoteLock = remoteShapeLocks[shape.id];
    const isLockedByOther = Boolean(remoteLock);

    useEffect(() => {
        const transformer = transformerRef.current;
        const rect = rectRef.current;

        if (!transformer || !rect) {
            return;
        }

        if (
            !isSelected ||
            activeTool !== CANVAS_TOOLS.SELECT ||
            isLockedByOther
        ) {
            transformer.nodes([]);
            transformer.getLayer()?.batchDraw();
            return;
        }

        transformer.nodes([rect]);
        transformer.getLayer()?.batchDraw();
    }, [activeTool, isSelected, isLockedByOther]);

    return (
        <>
            <Rect
                ref={rectRef}
                x={shape.x}
                y={shape.y}
                width={shape.width}
                height={shape.height}
                rotation={shape.rotation}
                opacity={isLockedByOther ? (shape.opacity ?? 1) * 0.8 : shape.opacity}
                fill={shape.fill}
                stroke={shape.stroke}
                strokeWidth={shape.strokeWidth}
                draggable={
                    activeTool === CANVAS_TOOLS.SELECT && !isLockedByOther
                }
                onMouseDown={(event) => {
                    event.cancelBubble = true;

                    if (isLockedByOther) {
                        toast.info(
                            `${remoteLock.fullName || "Another collaborator"} is currently editing this shape.`,
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
                            `${remoteLock.fullName || "Another collaborator"} is currently editing this shape.`,
                        );
                        return;
                    }

                    const isAlreadySelected =
                        selectedShapeIds.includes(shape.id);

                    if (!isAlreadySelected) {
                        selectShape(shape.id);
                    }

                    dragStartRef.current = {
                        x: event.target.x(),
                        y: event.target.y(),
                    };

                    // Acquire exclusive ephemeral soft-lock
                    if (boardId) {
                        socketClientService
                            .lockShape(boardId, shape.id)
                            .catch((err) => {
                                event.target.stopDrag();
                                toast.error(
                                    err instanceof Error
                                        ? err.message
                                        : "Shape is currently being edited by another collaborator.",
                                );
                            });
                    }
                }}
                onDragEnd={(event) => {
                    event.cancelBubble = true;

                    const dragStart = dragStartRef.current;

                    if (!dragStart) {
                        if (boardId) {
                            socketClientService
                                .unlockShape(boardId, shape.id)
                                .catch(() => {});
                        }
                        return;
                    }

                    const currentX = event.target.x();
                    const currentY = event.target.y();

                    const deltaX = currentX - dragStart.x;
                    const deltaY = currentY - dragStart.y;

                    moveSelectedShapes(deltaX, deltaY);

                    dragStartRef.current = null;

                    socketClientService
                        .updateShape(shape.id, {
                            x: shape.x + deltaX,
                            y: shape.y + deltaY,
                        })
                        .catch((err) => {
                            toast.error(
                                err instanceof Error
                                    ? err.message
                                    : "Failed to save shape position.",
                            );
                        })
                        .finally(() => {
                            // Release soft-lock on drag completion
                            if (boardId) {
                                socketClientService
                                    .unlockShape(boardId, shape.id)
                                    .catch(() => {});
                            }
                        });
                }}
                onTransformStart={(event) => {
                    event.cancelBubble = true;

                    if (boardId) {
                        socketClientService
                            .lockShape(boardId, shape.id)
                            .catch((err) => {
                                toast.error(
                                    err instanceof Error
                                        ? err.message
                                        : "Shape is currently being edited by another collaborator.",
                                );
                            });
                    }
                }}
                onTransformEnd={(event) => {
                    event.cancelBubble = true;

                    const node = event.target as Konva.Rect;

                    const scaleX = node.scaleX();
                    const scaleY = node.scaleY();

                    const width = Math.max(
                        5,
                        node.width() * scaleX,
                    );

                    const height = Math.max(
                        5,
                        node.height() * scaleY,
                    );

                    const x = node.x();
                    const y = node.y();
                    const rotation = node.rotation();

                    node.scaleX(1);
                    node.scaleY(1);

                    updateRectangleTransform(shape.id, {
                        x,
                        y,
                        width,
                        height,
                        rotation,
                    });

                    socketClientService
                        .updateShape(shape.id, {
                            x,
                            y,
                            width,
                            height,
                            rotation,
                        })
                        .catch((err) => {
                            toast.error(
                                err instanceof Error
                                    ? err.message
                                    : "Failed to save shape transform.",
                            );
                        })
                        .finally(() => {
                            // Release soft-lock on transform completion
                            if (boardId) {
                                socketClientService
                                    .unlockShape(boardId, shape.id)
                                    .catch(() => {});
                            }
                        });
                }}
            />

            {isSelected &&
                activeTool === CANVAS_TOOLS.SELECT &&
                !isLockedByOther ? (
                <Transformer
                    ref={transformerRef}
                    rotateEnabled
                    enabledAnchors={[
                        "top-left",
                        "top-right",
                        "bottom-left",
                        "bottom-right",
                    ]}
                    boundBoxFunc={(oldBox, newBox) => {
                        if (
                            newBox.width < 5 ||
                            newBox.height < 5
                        ) {
                            return oldBox;
                        }

                        return newBox;
                    }}
                />
            ) : null}
        </>
    );
}