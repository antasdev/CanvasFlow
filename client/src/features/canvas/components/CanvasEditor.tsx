import type Konva from "konva";
import { useEffect, useRef, useState } from "react";
import { Layer, Rect, Stage } from "react-konva";
import { toast } from "sonner";

import { mapShapeResponseToRectangleShape, shapeApi } from "../api";
import { CANVAS_TOOLS } from "../constants";
import {
    useCanvasHistory,
    useCreateShape,
    useDeleteShape,
    useShapes,
} from "../hooks";
import { useCanvasStore } from "../store";
import { screenToWorld } from "../utils/canvas.coordinates";

import CanvasGrid from "./CanvasGrid";
import ShapeRenderer from "./ShapeRenderer";

type CanvasEditorProps = {
    canvasId?: string;
    className?: string;
};

type CanvasSize = {
    width: number;
    height: number;
};

type DrawingState = {
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
};

type SelectionBox = {
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
};

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 3;
const ZOOM_BY = 1.05;

export default function CanvasEditor({
    canvasId,
    className,
}: CanvasEditorProps): React.JSX.Element {
    useCanvasHistory();
    const containerRef =
        useRef<HTMLDivElement | null>(null);

    const stageRef =
        useRef<Konva.Stage | null>(null);

    const hydratedCanvasIdRef =
        useRef<string | null>(null);

    const { data: serverShapes } = useShapes(canvasId);
    const createShapeMutation = useCreateShape(canvasId);
    const deleteShapeMutation = useDeleteShape(canvasId);

    const setShapes = useCanvasStore(
        (state) => state.setShapes,
    );

    const [size, setSize] = useState<CanvasSize>({
        width: 0,
        height: 0,
    });

    const [drawing, setDrawing] =
        useState<DrawingState | null>(null);

    const activeTool = useCanvasStore(
        (state) => state.activeTool,
    );

    const shapes = useCanvasStore(
        (state) => state.shapes,
    );

    const zoom = useCanvasStore(
        (state) => state.zoom,
    );

    const pan = useCanvasStore(
        (state) => state.pan,
    );

    const addShape = useCanvasStore(
        (state) => state.addShape,
    );

    const setZoom = useCanvasStore(
        (state) => state.setZoom,
    );

    const setPan = useCanvasStore(
        (state) => state.setPan,
    );

    const selectedShapeIds = useCanvasStore(
        (state) => state.selectedShapeIds,
    );

    const deleteShape = useCanvasStore(
        (state) => state.deleteShape,
    );

    const selectAllShapes = useCanvasStore(
        (state) => state.selectAllShapes,
    );

    const [selectionBox, setSelectionBox] =
        useState<SelectionBox | null>(null);

    const setSelectedShapeIds = useCanvasStore(
        (state) => state.setSelectedShapeIds,
    );

    const clearSelection = useCanvasStore(
        (state) => state.clearSelection,
    );

    /*
     * Hydrate server shapes into Zustand store on initial canvas load or canvas switch.
     */
    useEffect(() => {
        if (canvasId !== hydratedCanvasIdRef.current) {
            hydratedCanvasIdRef.current = null;
        }

        if (
            canvasId &&
            serverShapes &&
            hydratedCanvasIdRef.current !== canvasId
        ) {
            hydratedCanvasIdRef.current = canvasId;
            const mapped = serverShapes.map(
                mapShapeResponseToRectangleShape,
            );
            setShapes(mapped);
        }
    }, [canvasId, serverShapes, setShapes]);


    /*
     * Track container size.
     */
    useEffect(() => {
        const container = containerRef.current;

        if (!container) {
            return;
        }

        const updateSize = (): void => {
            setSize({
                width: container.clientWidth,
                height: container.clientHeight,
            });
        };

        updateSize();

        const resizeObserver =
            new ResizeObserver(updateSize);

        resizeObserver.observe(container);

        return (): void => {
            resizeObserver.disconnect();
        };
    }, []);

    useEffect(() => {
        const handleKeyDown = (
            event: KeyboardEvent,
        ): void => {
            const target = event.target as HTMLElement;

            const isTyping =
                target.tagName === "INPUT" ||
                target.tagName === "TEXTAREA" ||
                target.isContentEditable;

            if (isTyping) {
                return;
            }

            if (
                event.key === "Delete" ||
                event.key === "Backspace"
            ) {
                if (selectedShapeIds.length === 0) {
                    return;
                }

                event.preventDefault();

                selectedShapeIds.forEach((shapeId) => {
                    deleteShape(shapeId);
                    deleteShapeMutation.mutate(shapeId, {
                        onError: async (err) => {
                            toast.error(
                                err instanceof Error
                                    ? err.message
                                    : "Failed to delete shape.",
                            );
                            if (canvasId) {
                                try {
                                    const canonical =
                                        await shapeApi.getShapes(
                                            canvasId,
                                        );
                                    setShapes(
                                        canonical.map(
                                            mapShapeResponseToRectangleShape,
                                        ),
                                    );
                                } catch {
                                    // Ignore secondary fetch errors
                                }
                            }
                        },
                    });
                });

                return;
            }

            if (event.key === "Escape") {
                clearSelection();
                return;
            }

            if (
                (event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === "a"
            ) {
                event.preventDefault();
                selectAllShapes();
            }
        };

        window.addEventListener(
            "keydown",
            handleKeyDown,
        );

        return (): void => {
            window.removeEventListener(
                "keydown",
                handleKeyDown,
            );
        };
    }, [
        selectedShapeIds,
        deleteShape,
        clearSelection,
        selectAllShapes,
    ]);

    /*
     * Canvas zoom.
     */
    const handleWheel = (
        event: Konva.KonvaEventObject<WheelEvent>,
    ): void => {
        event.evt.preventDefault();

        const stage = stageRef.current;

        if (!stage) {
            return;
        }

        const pointer = stage.getPointerPosition();

        if (!pointer) {
            return;
        }

        const oldZoom = zoom;

        const direction =
            event.evt.deltaY > 0 ? -1 : 1;

        const zoomFactor =
            direction > 0
                ? ZOOM_BY
                : 1 / ZOOM_BY;

        const newZoom = Math.min(
            MAX_ZOOM,
            Math.max(
                MIN_ZOOM,
                oldZoom * zoomFactor,
            ),
        );

        /*
         * Keep the point under the mouse
         * in the same world position.
         */
        const mousePointTo = {
            x: (pointer.x - pan.x) / oldZoom,
            y: (pointer.y - pan.y) / oldZoom,
        };

        const newPan = {
            x:
                pointer.x -
                mousePointTo.x * newZoom,

            y:
                pointer.y -
                mousePointTo.y * newZoom,
        };

        setZoom(newZoom);
        setPan(newPan.x, newPan.y);
    };

    /*
     * Start drawing a rectangle.
     */
    const handlePointerDown = (
        event: Konva.KonvaEventObject<MouseEvent>,
    ): void => {
        const stage = stageRef.current;

        if (!stage) {
            return;
        }

        const isEmptyCanvas =
            event.target === stage;

        if (
            activeTool === CANVAS_TOOLS.SELECT &&
            isEmptyCanvas &&
            event.evt.shiftKey
        ) {
            const pointer = stage.getPointerPosition();

            if (!pointer) {
                return;
            }

            const worldPoint = screenToWorld(pointer, {
                pan,
                zoom,
            });

            setSelectionBox({
                startX: worldPoint.x,
                startY: worldPoint.y,
                currentX: worldPoint.x,
                currentY: worldPoint.y,
            });

            return;
        }

        if (isEmptyCanvas) {
            clearSelection();
        }

        if (activeTool !== CANVAS_TOOLS.RECTANGLE) {
            return;
        }

        const pointer = stage.getPointerPosition();

        if (!pointer) {
            return;
        }

        const worldPoint = screenToWorld(pointer, {
            pan,
            zoom,
        });

        setDrawing({
            startX: worldPoint.x,
            startY: worldPoint.y,
            currentX: worldPoint.x,
            currentY: worldPoint.y,
        });
    };

    /*
     * Update rectangle preview while dragging.
     */
    const handlePointerMove = (): void => {
        const stage = stageRef.current;

        if (!stage) {
            return;
        }

        const pointer = stage.getPointerPosition();

        if (!pointer) {
            return;
        }

        const worldPoint = screenToWorld(pointer, {
            pan,
            zoom,
        });

        if (selectionBox) {
            setSelectionBox((current) => {
                if (!current) {
                    return null;
                }

                return {
                    ...current,
                    currentX: worldPoint.x,
                    currentY: worldPoint.y,
                };
            });

            return;
        }

        if (!drawing) {
            return;
        }

        setDrawing((current) => {
            if (!current) {
                return null;
            }

            return {
                ...current,
                currentX: worldPoint.x,
                currentY: worldPoint.y,
            };
        });
    };

    /*
     * Finish rectangle drawing.
     */
    const handlePointerUp = (): void => {
        /*
         * Finish multi-selection.
         */
        if (selectionBox) {
            const selection = selectionBox;

            const selectionLeft = Math.min(
                selection.startX,
                selection.currentX,
            );

            const selectionRight = Math.max(
                selection.startX,
                selection.currentX,
            );

            const selectionTop = Math.min(
                selection.startY,
                selection.currentY,
            );

            const selectionBottom = Math.max(
                selection.startY,
                selection.currentY,
            );

            const selectedIds = shapes
                .filter((shape) => {
                    if (shape.type !== "rectangle") {
                        return false;
                    }

                    const shapeRight =
                        shape.x + shape.width;

                    const shapeBottom =
                        shape.y + shape.height;

                    return (
                        shape.x >= selectionLeft &&
                        shapeRight <= selectionRight &&
                        shape.y >= selectionTop &&
                        shapeBottom <= selectionBottom
                    );
                })
                .map((shape) => shape.id);

            setSelectedShapeIds(selectedIds);
            setSelectionBox(null);

            return;
        }

        /*
         * No rectangle is being drawn.
         */
        if (!drawing) {
            return;
        }

        const x = Math.min(
            drawing.startX,
            drawing.currentX,
        );

        const y = Math.min(
            drawing.startY,
            drawing.currentY,
        );

        const width = Math.abs(
            drawing.currentX - drawing.startX,
        );

        const height = Math.abs(
            drawing.currentY - drawing.startY,
        );

        setDrawing(null);

        /*
         * Ignore accidental clicks.
         */
        if (width < 5 || height < 5) {
            return;
        }

        if (!canvasId) {
            toast.error("No active canvas available.");
            return;
        }

        createShapeMutation.mutate(
            {
                canvasId,
                type: "rectangle",
                x,
                y,
                width,
                height,
                rotation: 0,
                style: {
                    fill: "#ffffff",
                    stroke: "#1f2937",
                    strokeWidth: 2,
                    opacity: 1,
                },
            },
            {
                onSuccess: (savedShape) => {
                    const rectangle =
                        mapShapeResponseToRectangleShape(
                            savedShape,
                        );
                    addShape(rectangle);
                },
                onError: (err) => {
                    toast.error(
                        err instanceof Error
                            ? err.message
                            : "Failed to create shape.",
                    );
                },
            },
        );
    };



    return (
        <div
            ref={containerRef}
            className={`h-full w-full overflow-hidden ${className ?? ""
                }`}
        >
            {size.width > 0 &&
                size.height > 0 ? (
                <Stage
                    ref={stageRef}
                    width={size.width}
                    height={size.height}
                    x={pan.x}
                    y={pan.y}
                    scaleX={zoom}
                    scaleY={zoom}
                    draggable={
                        activeTool === CANVAS_TOOLS.SELECT &&
                        selectionBox === null
                    }
                    onDragEnd={(event) => {
                        setPan(
                            event.target.x(),
                            event.target.y(),
                        );
                    }}
                    onWheel={handleWheel}
                    onMouseDown={
                        handlePointerDown
                    }
                    onMouseMove={
                        handlePointerMove
                    }
                    onMouseUp={
                        handlePointerUp
                    }
                >
                    <Layer>
                        <CanvasGrid
                            width={size.width}
                            height={size.height}
                        />

                        {shapes.map((shape) => (
                            <ShapeRenderer
                                key={shape.id}
                                shape={shape}
                            />
                        ))}

                        {selectionBox ? (
                            <Rect
                                x={Math.min(
                                    selectionBox.startX,
                                    selectionBox.currentX,
                                )}
                                y={Math.min(
                                    selectionBox.startY,
                                    selectionBox.currentY,
                                )}
                                width={Math.abs(
                                    selectionBox.currentX -
                                    selectionBox.startX,
                                )}
                                height={Math.abs(
                                    selectionBox.currentY -
                                    selectionBox.startY,
                                )}
                                fill="#3b82f6"
                                opacity={0.15}
                                stroke="#3b82f6"
                                strokeWidth={1}
                                listening={false}
                            />
                        ) : null}

                        {drawing ? (
                            <Rect
                                x={Math.min(
                                    drawing.startX,
                                    drawing.currentX,
                                )}
                                y={Math.min(
                                    drawing.startY,
                                    drawing.currentY,
                                )}
                                width={Math.abs(
                                    drawing.currentX -
                                    drawing.startX,
                                )}
                                height={Math.abs(
                                    drawing.currentY -
                                    drawing.startY,
                                )}
                                fill="#ffffff"
                                stroke="#1f2937"
                                strokeWidth={2}
                                opacity={0.7}
                            />
                        ) : null}
                    </Layer>
                </Stage>
            ) : null}
        </div>
    );
}