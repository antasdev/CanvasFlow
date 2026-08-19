import type Konva from "konva";
import { useEffect, useRef } from "react";
import { Rect, Transformer } from "react-konva";
import { toast } from "sonner";

import { CANVAS_TOOLS } from "../constants";
import { useUpdateShape } from "../hooks";
import { useCanvasStore } from "../store";
import type { RectangleShape } from "../types";

type RectangleNodeProps = {
    shape: RectangleShape;
};

export default function RectangleNode({
    shape,
}: RectangleNodeProps): React.JSX.Element {
    const updateShapeMutation = useUpdateShape();
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

    const selectShape = useCanvasStore(
        (state) => state.selectShape,
    );

    const toggleShapeSelection = useCanvasStore(
        (state) => state.toggleShapeSelection,
    );

    // const updateShapePosition = useCanvasStore(
    //     (state) => state.updateShapePosition,
    // );

    const updateRectangleTransform = useCanvasStore(
        (state) => state.updateRectangleTransform,
    );

    const moveSelectedShapes = useCanvasStore(
        (state) => state.moveSelectedShapes,
    );

    const isSelected = selectedShapeIds.includes(shape.id);

    useEffect(() => {
        const transformer = transformerRef.current;
        const rect = rectRef.current;

        if (!transformer || !rect) {
            return;
        }

        if (
            !isSelected ||
            activeTool !== CANVAS_TOOLS.SELECT
        ) {
            transformer.nodes([]);
            transformer.getLayer()?.batchDraw();
            return;
        }

        transformer.nodes([rect]);
        transformer.getLayer()?.batchDraw();
    }, [activeTool, isSelected]);

    return (
        <>
            <Rect
                ref={rectRef}
                x={shape.x}
                y={shape.y}
                width={shape.width}
                height={shape.height}
                rotation={shape.rotation}
                opacity={shape.opacity}
                fill={shape.fill}
                stroke={shape.stroke}
                strokeWidth={shape.strokeWidth}
                draggable={
                    activeTool === CANVAS_TOOLS.SELECT
                }
                onMouseDown={(event) => {
                    event.cancelBubble = true;

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

                    const isAlreadySelected =
                        selectedShapeIds.includes(shape.id);

                    if (!isAlreadySelected) {
                        selectShape(shape.id);
                    }

                    dragStartRef.current = {
                        x: event.target.x(),
                        y: event.target.y(),
                    };
                }}

                onDragEnd={(event) => {
                    event.cancelBubble = true;

                    const dragStart = dragStartRef.current;

                    if (!dragStart) {
                        return;
                    }

                    const currentX = event.target.x();
                    const currentY = event.target.y();

                    const deltaX = currentX - dragStart.x;
                    const deltaY = currentY - dragStart.y;

                    moveSelectedShapes(deltaX, deltaY);

                    dragStartRef.current = null;

                    updateShapeMutation.mutate(
                        {
                            id: shape.id,
                            data: {
                                x: shape.x + deltaX,
                                y: shape.y + deltaY,
                            },
                        },
                        {
                            onError: (err) => {
                                toast.error(
                                    err instanceof Error
                                        ? err.message
                                        : "Failed to save shape position.",
                                );
                            },
                        },
                    );
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

                    updateShapeMutation.mutate(
                        {
                            id: shape.id,
                            data: {
                                x,
                                y,
                                width,
                                height,
                                rotation,
                            },
                        },
                        {
                            onError: (err) => {
                                toast.error(
                                    err instanceof Error
                                        ? err.message
                                        : "Failed to save shape transform.",
                                );
                            },
                        },
                    );
                }}
            />

            {isSelected &&
                activeTool === CANVAS_TOOLS.SELECT ? (
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