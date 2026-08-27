import type Konva from "konva";
import { useEffect, useMemo, useRef, useState } from "react";
import { Arrow, Circle, Layer, Line, Rect, Stage } from "react-konva";
import { toast } from "sonner";

import { mapShapeResponseToShape, shapeApi } from "../api";
import { CANVAS_TOOLS } from "../constants";
import {
    useCanvasHistory,
    useCanvasSocket,
    useShapes,
    useBoardRecovery,
    usePresenceSocket,
    useInteractionSocket,
} from "../hooks";
import { socketClientService } from "@/services/socket";
import { useCanvasStore, usePresenceStore } from "../store";
import type { TextShape, StickyNoteShape } from "../types";
import { screenToWorld } from "../utils/canvas.coordinates";
import {
    simplifyStroke,
    computeBoundingBox,
    normalizePointsToLocal,
} from "../utils/stroke-simplification";
import { findNearestAnchor, type AnchorPosition } from "../utils/anchor.utils";

import CanvasGrid from "./CanvasGrid";
import CollaboratorCursor from "./CollaboratorCursor";
import CollaboratorSelection from "./CollaboratorSelection";
import CollaboratorShapeLock from "./CollaboratorShapeLock";
import RemoteCursorLayer from "./RemoteCursorLayer";
import TextEditorOverlay from "./TextEditorOverlay";
import TextFormattingToolbar from "./TextFormattingToolbar";
import ShapeRenderer from "./ShapeRenderer";
import { RecoveryStatusIndicator } from "./RecoveryStatusIndicator";
import { DEFAULT_TEXT_STYLE, estimateTextDimensions } from "../utils/text.utils";
import {
    useComments,
    useCommentSocket,
    useCommentStore,
    CommentBadge,
    CommentPanel,
} from "@/features/comments";

type CanvasEditorProps = {
    canvasId?: string;
    boardId?: string;
    className?: string;
    canEditCanvas?: boolean;
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

type FreehandDrawingState = {
    points: number[];
    stroke: string;
    strokeWidth: number;
};

type VectorDraftState = {
    tool: "line" | "arrow" | "connector";
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    sourceAnchor?: { shapeId: string; anchor: AnchorPosition; point: { x: number; y: number } } | null;
    targetAnchor?: { shapeId: string; anchor: AnchorPosition; point: { x: number; y: number } } | null;
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
    boardId,
    className,
    canEditCanvas = true,
}: CanvasEditorProps): React.JSX.Element {
    const stageRef = useRef<Konva.Stage | null>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const activeTextInteractionIdRef = useRef<string | null>(null);

    const hydratedCanvasIdRef =
        useRef<string | null>(null);

    const lastCursorEmitTimeRef =
        useRef<number>(0);

    const lastBroadcastSelectionRef =
        useRef<string>("");

    const [editingShape, setEditingShape] =
        useState<TextShape | StickyNoteShape | null>(null);

    // Initialize real-time board socket handlers
    useCanvasSocket(boardId, canvasId);

    // Initialize real-time board state recovery and reconnect synchronization
    const {
        status: recoveryStatus,
        error: recoveryError,
        triggerRecovery,
    } = useBoardRecovery(boardId, canvasId);

    // Initialize real-time comments subscriptions and data loading
    useComments(boardId);
    useCommentSocket(boardId);

    // Initialize collaborative presence & session lifecycle
    const { emitCursor, emitActivity } = usePresenceSocket(boardId);

    // Initialize collaborative interaction state & gesture coordination
    const {
        startInteraction,
        updateInteraction,
        endInteraction,
        isTargetLockedByPeer,
        getTargetOwner,
    } = useInteractionSocket(boardId);

    // Initialize keyboard undo/redo shortcuts
    useCanvasHistory();

    const comments = useCommentStore((state) => state.comments);
    const toggleCommentPanel = useCommentStore((state) => state.togglePanel);
    const setCommentSelectedShapeId = useCommentStore(
        (state) => state.setSelectedShapeId
    );
    const selectShape = useCanvasStore((state) => state.selectShape);

    const shapeCommentsMap = useMemo(() => {
        const map: Record<string, { count: number; hasUnresolved: boolean }> = {};
        for (const c of Object.values(comments)) {
            if (c.shapeId && !c.isDeleted) {
                if (!map[c.shapeId]) {
                    map[c.shapeId] = { count: 0, hasUnresolved: false };
                }
                map[c.shapeId].count++;
                if (!c.isResolved) {
                    map[c.shapeId].hasUnresolved = true;
                }
            }
        }
        return map;
    }, [comments]);

    const {
        data: serverShapes,
    } = useShapes(canvasId);

    const setShapes = useCanvasStore(
        (state) => state.setShapes,
    );

    const selectedShapeIds = useCanvasStore(
        (state) => state.selectedShapeIds,
    );

    const remoteCursors = useCanvasStore(
        (state) => state.remoteCursors,
    );

    const remoteSelections = useCanvasStore(
        (state) => state.remoteSelections,
    );

    const remoteShapeLocks = useCanvasStore(
        (state) => state.remoteShapeLocks,
    );

    const setActiveTool = useCanvasStore(
        (state) => state.setActiveTool,
    );

    const updateShapeText = useCanvasStore(
        (state) => state.updateShapeText,
    );

    const updateShapeFormatting = useCanvasStore(
        (state) => state.updateShapeFormatting,
    );

    // Broadcast selection changes to other collaborators over Socket.IO
    useEffect(() => {
        if (!boardId) {
            return;
        }

        const currentKey = selectedShapeIds.slice().sort().join(",");
        if (currentKey !== lastBroadcastSelectionRef.current) {
            lastBroadcastSelectionRef.current = currentKey;
            socketClientService.changeSelection(boardId, selectedShapeIds);
        }
    }, [boardId, selectedShapeIds]);

    const [size, setSize] = useState<CanvasSize>({
        width: 0,
        height: 0,
    });

    const [drawing, setDrawing] =
        useState<DrawingState | null>(null);

    // Transient local freehand drawing stroke state (ephemeral, not in Zustand shapes)
    const [freehandDrawing, setFreehandDrawing] =
        useState<FreehandDrawingState | null>(null);

    // Transient local vector drafting state (line, arrow, connector)
    const [vectorDraft, setVectorDraft] =
        useState<VectorDraftState | null>(null);

    // Transient anchor snap indicator position
    const [snapIndicator, setSnapIndicator] =
        useState<{ x: number; y: number } | null>(null);

    const activeDrawingInteractionIdRef =
        useRef<string | null>(null);

    const unstreamedPointsRef =
        useRef<number[]>([]);

    const lastFreehandEmitTimeRef =
        useRef<number>(0);

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

    const [textCreationContext, setTextCreationContext] =
        useState<{ x: number; y: number } | null>(null);

    const selectedTextShape = useMemo(() => {
        if (selectedShapeIds.length !== 1) return null;
        const found = shapes.find((s) => s.id === selectedShapeIds[0]);
        if (found && found.type === "text") return found as TextShape;
        return null;
    }, [selectedShapeIds, shapes]);

    // Automatically enforce SELECT tool and clear transient drawing when user lacks edit permissions
    useEffect(() => {
        if (!canEditCanvas) {
            if (activeTool !== CANVAS_TOOLS.SELECT) {
                setActiveTool(CANVAS_TOOLS.SELECT);
            }
            if (freehandDrawing) {
                if (boardId && activeDrawingInteractionIdRef.current) {
                    endInteraction(activeDrawingInteractionIdRef.current);
                }
                setFreehandDrawing(null);
                activeDrawingInteractionIdRef.current = null;
                unstreamedPointsRef.current = [];
            }
        }
    }, [canEditCanvas, activeTool, setActiveTool, freehandDrawing, boardId, endInteraction]);

    // Clear stale ephemeral drawing state on board recovery / reconnection
    useEffect(() => {
        if (recoveryStatus === "recovering") {
            setFreehandDrawing(null);
            activeDrawingInteractionIdRef.current = null;
            unstreamedPointsRef.current = [];
        }
    }, [recoveryStatus]);

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
                mapShapeResponseToShape,
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
                if (!canEditCanvas || selectedShapeIds.length === 0) {
                    return;
                }

                event.preventDefault();

                selectedShapeIds.forEach(async (shapeId) => {
                    deleteShape(shapeId);
                    try {
                        await socketClientService.deleteShape(shapeId);
                    } catch (err) {
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
                                        mapShapeResponseToShape,
                                    ),
                                );
                            } catch {
                                // Ignore secondary fetch errors
                            }
                        }
                    }
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

        if (!canEditCanvas && activeTool !== CANVAS_TOOLS.SELECT) {
            return;
        }

        if (activeTool === CANVAS_TOOLS.TEXT && isEmptyCanvas) {
            if (!canvasId) {
                toast.error("No active canvas available.");
                return;
            }

            const pointer = stage.getPointerPosition();
            if (!pointer) return;

            const worldPoint = screenToWorld(pointer, { pan, zoom });
            setTextCreationContext({ x: worldPoint.x, y: worldPoint.y });
            setActiveTool(CANVAS_TOOLS.SELECT);
            return;
        }

        if (activeTool === CANVAS_TOOLS.STICKY_NOTE && isEmptyCanvas) {
            if (!canvasId) {
                toast.error("No active canvas available.");
                return;
            }

            const pointer = stage.getPointerPosition();
            if (!pointer) return;

            const worldPoint = screenToWorld(pointer, { pan, zoom });

            socketClientService
                .createShape({
                    canvasId,
                    type: "sticky_note",
                    x: worldPoint.x,
                    y: worldPoint.y,
                    width: 180,
                    height: 180,
                    rotation: 0,
                    style: {
                        text: "New note",
                        fontSize: 18,
                        backgroundColor: "#fef08a",
                        textColor: "#1f2937",
                        opacity: 1,
                    },
                })
                .then((savedShape) => {
                    const shape = mapShapeResponseToShape(savedShape);
                    addShape(shape);
                    setSelectedShapeIds([shape.id]);
                    setActiveTool(CANVAS_TOOLS.SELECT);
                })
                .catch((err) => {
                    toast.error(
                        err instanceof Error
                            ? err.message
                            : "Failed to create sticky note."
                    );
                });
            return;
        }

        if (activeTool === CANVAS_TOOLS.FREEHAND && isEmptyCanvas) {
            if (!canEditCanvas) {
                return;
            }

            const pointer = stage.getPointerPosition();
            if (!pointer) return;

            const worldPoint = screenToWorld(pointer, { pan, zoom });
            const initialPoints = [worldPoint.x, worldPoint.y];

            setFreehandDrawing({
                points: initialPoints,
                stroke: "#1f2937",
                strokeWidth: 2,
            });

            unstreamedPointsRef.current = [...initialPoints];

            if (boardId) {
                startInteraction("drawing", [], {
                    points: initialPoints,
                    stroke: "#1f2937",
                    strokeWidth: 2,
                })
                    .then((res) => {
                        if (res.success && res.interactionId) {
                            activeDrawingInteractionIdRef.current = res.interactionId;
                        }
                    })
                    .catch(() => {});
            }
            return;
        }

        if (
            (activeTool === CANVAS_TOOLS.LINE ||
                activeTool === CANVAS_TOOLS.ARROW ||
                activeTool === CANVAS_TOOLS.CONNECTOR) &&
            canEditCanvas
        ) {
            const pointer = stage.getPointerPosition();
            if (!pointer) return;

            const worldPoint = screenToWorld(pointer, { pan, zoom });

            if (activeTool === CANVAS_TOOLS.CONNECTOR) {
                const nearest = findNearestAnchor(worldPoint, shapes, 20);
                const startX = nearest ? nearest.point.x : worldPoint.x;
                const startY = nearest ? nearest.point.y : worldPoint.y;

                setVectorDraft({
                    tool: "connector",
                    startX,
                    startY,
                    currentX: startX,
                    currentY: startY,
                    sourceAnchor: nearest
                        ? { shapeId: nearest.shapeId, anchor: nearest.anchor, point: nearest.point }
                        : null,
                    targetAnchor: null,
                });
                if (nearest) {
                    setSnapIndicator(nearest.point);
                }
            } else {
                setVectorDraft({
                    tool: activeTool === CANVAS_TOOLS.LINE ? "line" : "arrow",
                    startX: worldPoint.x,
                    startY: worldPoint.y,
                    currentX: worldPoint.x,
                    currentY: worldPoint.y,
                });
            }
            return;
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

        // Throttle cursor:move emissions to ~30 fps (~33ms)
        const now = Date.now();
        if (boardId && now - lastCursorEmitTimeRef.current >= 33) {
            lastCursorEmitTimeRef.current = now;
            socketClientService.moveCursor(boardId, {
                x: worldPoint.x,
                y: worldPoint.y,
            });
            emitCursor({
                x: worldPoint.x,
                y: worldPoint.y,
            });
        }

        if (selectionBox) {
            emitActivity("selecting");
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

        if (freehandDrawing) {
            emitActivity("drawing");
            setFreehandDrawing((current) => {
                if (!current) return null;
                const len = current.points.length;
                const lastX = current.points[len - 2];
                const lastY = current.points[len - 1];
                const dx = worldPoint.x - lastX;
                const dy = worldPoint.y - lastY;
                // Only record point if moved at least 1px to reduce memory overhead
                if (dx * dx + dy * dy < 1.0) {
                    return current;
                }

                unstreamedPointsRef.current.push(worldPoint.x, worldPoint.y);

                return {
                    ...current,
                    points: [...current.points, worldPoint.x, worldPoint.y],
                };
            });

            // Throttle ephemeral interaction:update emissions to ~30 FPS (~33ms)
            const now = Date.now();
            if (
                boardId &&
                activeDrawingInteractionIdRef.current &&
                unstreamedPointsRef.current.length >= 2 &&
                now - lastFreehandEmitTimeRef.current >= 33
            ) {
                lastFreehandEmitTimeRef.current = now;
                const pointsBatch = [...unstreamedPointsRef.current];
                unstreamedPointsRef.current = [];

                updateInteraction(activeDrawingInteractionIdRef.current, {
                    pointsBatch,
                    stroke: freehandDrawing.stroke,
                    strokeWidth: freehandDrawing.strokeWidth,
                }).catch(() => {});
            }

            return;
        }

        if (vectorDraft) {
            emitActivity("drawing");
            if (vectorDraft.tool === "connector") {
                const nearest = findNearestAnchor(worldPoint, shapes, 20);
                if (nearest) {
                    setSnapIndicator(nearest.point);
                    setVectorDraft((curr) =>
                        curr
                            ? {
                                  ...curr,
                                  currentX: nearest.point.x,
                                  currentY: nearest.point.y,
                                  targetAnchor: {
                                      shapeId: nearest.shapeId,
                                      anchor: nearest.anchor,
                                      point: nearest.point,
                                  },
                              }
                            : null
                    );
                } else {
                    setSnapIndicator(null);
                    setVectorDraft((curr) =>
                        curr
                            ? {
                                  ...curr,
                                  currentX: worldPoint.x,
                                  currentY: worldPoint.y,
                                  targetAnchor: null,
                              }
                            : null
                    );
                }
            } else {
                setVectorDraft((curr) =>
                    curr
                        ? {
                              ...curr,
                              currentX: worldPoint.x,
                              currentY: worldPoint.y,
                          }
                        : null
                );
            }
            return;
        }

        if (!drawing) {
            return;
        }

        emitActivity("moving");
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
                    const shapeWidth = shape.width || 100;
                    const shapeHeight = shape.height || 40;
                    const shapeRight = shape.x + shapeWidth;
                    const shapeBottom = shape.y + shapeHeight;

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

        if (freehandDrawing) {
            const strokePoints = freehandDrawing.points;
            const strokeColor = freehandDrawing.stroke;
            const strokeThickness = freehandDrawing.strokeWidth;
            const interactionId = activeDrawingInteractionIdRef.current;

            // Reset transient local state immediately
            setFreehandDrawing(null);
            activeDrawingInteractionIdRef.current = null;
            unstreamedPointsRef.current = [];

            // End ephemeral collaborative interaction
            if (boardId && interactionId) {
                endInteraction(interactionId).catch(() => {});
            }

            // Reject single clicks or too-short strokes (< 4 coordinates = 2 points)
            if (strokePoints.length < 4) {
                return;
            }

            if (!canvasId) {
                toast.error("No active canvas available.");
                return;
            }

            // Step 1: Simplify stroke using RDP algorithm
            const simplifiedPoints = simplifyStroke(strokePoints, 1.2, 1.0);
            if (simplifiedPoints.length < 4) {
                return;
            }

            // Step 2: Calculate tight bounding box
            const bbox = computeBoundingBox(simplifiedPoints, strokeThickness);

            // Step 3: Normalize points to local shape coordinates relative to (bbox.x, bbox.y)
            const localPoints = normalizePointsToLocal(simplifiedPoints, bbox.x, bbox.y);

            // Step 4: Durable shape:create commit over Socket.IO
            socketClientService
                .createShape({
                    canvasId,
                    type: "freehand",
                    x: bbox.x,
                    y: bbox.y,
                    width: bbox.width,
                    height: bbox.height,
                    rotation: 0,
                    points: localPoints,
                    style: {
                        stroke: strokeColor,
                        strokeWidth: strokeThickness,
                        opacity: 1,
                    },
                })
                .then((savedShape) => {
                    const freehandShape = mapShapeResponseToShape(savedShape);
                    addShape(freehandShape);
                })
                .catch((err) => {
                    toast.error(
                        err instanceof Error
                            ? err.message
                            : "Failed to create freehand stroke."
                    );
                });

            return;
        }

        if (vectorDraft) {
            const draft = vectorDraft;
            setVectorDraft(null);
            setSnapIndicator(null);

            const dx = draft.currentX - draft.startX;
            const dy = draft.currentY - draft.startY;
            const distance = Math.hypot(dx, dy);

            // Sub-threshold gesture: discard without creating shape or undo history
            if (distance < 5) {
                return;
            }

            if (!canvasId) {
                toast.error("No active canvas available.");
                return;
            }

            const startX = draft.startX;
            const startY = draft.startY;
            const endX = draft.currentX;
            const endY = draft.currentY;

            const x = Math.min(startX, endX);
            const y = Math.min(startY, endY);
            const width = Math.max(Math.abs(endX - startX), 1);
            const height = Math.max(Math.abs(endY - startY), 1);
            const localPoints = [startX - x, startY - y, endX - x, endY - y];

            if (draft.tool === "line") {
                socketClientService
                    .createShape({
                        canvasId,
                        type: "line",
                        x,
                        y,
                        width,
                        height,
                        rotation: 0,
                        points: localPoints,
                        style: {
                            stroke: "#1f2937",
                            strokeWidth: 2,
                            strokeStyle: "solid",
                            opacity: 1,
                        },
                    })
                    .then((savedShape) => {
                        const shape = mapShapeResponseToShape(savedShape);
                        addShape(shape);
                        setSelectedShapeIds([shape.id]);
                        setActiveTool(CANVAS_TOOLS.SELECT);
                    })
                    .catch((err) => {
                        toast.error(
                            err instanceof Error
                                ? err.message
                                : "Failed to create line."
                        );
                    });
            } else if (draft.tool === "arrow") {
                socketClientService
                    .createShape({
                        canvasId,
                        type: "arrow",
                        x,
                        y,
                        width,
                        height,
                        rotation: 0,
                        points: localPoints,
                        style: {
                            stroke: "#1f2937",
                            strokeWidth: 2,
                            arrowHeadEnd: true,
                            pointerLength: 10,
                            pointerWidth: 10,
                            opacity: 1,
                        },
                    })
                    .then((savedShape) => {
                        const shape = mapShapeResponseToShape(savedShape);
                        addShape(shape);
                        setSelectedShapeIds([shape.id]);
                        setActiveTool(CANVAS_TOOLS.SELECT);
                    })
                    .catch((err) => {
                        toast.error(
                            err instanceof Error
                                ? err.message
                                : "Failed to create arrow."
                        );
                    });
            } else if (draft.tool === "connector") {
                const sourceId = draft.sourceAnchor?.shapeId ?? null;
                const targetId = draft.targetAnchor?.shapeId ?? null;
                const validTargetId = sourceId && targetId && sourceId === targetId ? null : targetId;
                const validTargetAnchor = sourceId && targetId && sourceId === targetId ? null : (draft.targetAnchor?.anchor ?? null);

                socketClientService
                    .createShape({
                        canvasId,
                        type: "connector",
                        x,
                        y,
                        width,
                        height,
                        rotation: 0,
                        points: localPoints,
                        connector: {
                            sourceShapeId: sourceId,
                            sourceAnchor: draft.sourceAnchor?.anchor ?? null,
                            targetShapeId: validTargetId,
                            targetAnchor: validTargetAnchor,
                            routing: "straight",
                        },
                        style: {
                            stroke: "#1f2937",
                            strokeWidth: 2,
                            arrowHeadEnd: true,
                            pointerLength: 10,
                            pointerWidth: 10,
                            opacity: 1,
                        },
                    })
                    .then((savedShape) => {
                        const shape = mapShapeResponseToShape(savedShape);
                        addShape(shape);
                        setSelectedShapeIds([shape.id]);
                        setActiveTool(CANVAS_TOOLS.SELECT);
                    })
                    .catch((err) => {
                        toast.error(
                            err instanceof Error
                                ? err.message
                                : "Failed to create connector."
                        );
                    });
            }

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

        socketClientService
            .createShape({
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
            })
            .then((savedShape) => {
                const rectangle =
                    mapShapeResponseToShape(
                        savedShape,
                    );
                addShape(rectangle);
            })
            .catch((err) => {
                toast.error(
                    err instanceof Error
                        ? err.message
                        : "Failed to create shape.",
                );
            });
    };



    return (
        <div
            ref={containerRef}
            className={`h-full w-full overflow-hidden relative ${className ?? ""
                }`}
        >
            {editingShape && (
                <TextEditorOverlay
                    shape={editingShape}
                    pan={pan}
                    zoom={zoom}
                    boardId={boardId}
                    onCommit={(newText) => {
                        const trimmedText = newText;
                        if (editingShape.text !== trimmedText) {
                            updateShapeText(editingShape.id, trimmedText);
                            if (boardId) {
                                if (editingShape.type === "sticky_note") {
                                    socketClientService
                                        .updateShape(
                                            editingShape.id,
                                            {
                                                style: {
                                                    text: trimmedText,
                                                },
                                            },
                                            editingShape.version,
                                        )
                                        .catch((err) => {
                                            toast.error(
                                                err instanceof Error
                                                    ? err.message
                                                    : "Failed to persist sticky note update."
                                            );
                                        });
                                } else {
                                    socketClientService
                                        .updateShape(
                                            editingShape.id,
                                            {
                                                text: trimmedText,
                                            },
                                            editingShape.version,
                                        )
                                        .catch((err) => {
                                            toast.error(
                                                err instanceof Error
                                                    ? err.message
                                                    : "Failed to persist text update."
                                            );
                                        });
                                }
                            }
                        }
                        if (activeTextInteractionIdRef.current) {
                            endInteraction(activeTextInteractionIdRef.current);
                            activeTextInteractionIdRef.current = null;
                        }
                        setEditingShape(null);
                    }}
                    onDiscard={() => {
                        if (activeTextInteractionIdRef.current) {
                            endInteraction(activeTextInteractionIdRef.current);
                            activeTextInteractionIdRef.current = null;
                        }
                        setEditingShape(null);
                    }}
                />
            )}

            {textCreationContext && (
                <TextEditorOverlay
                    worldPosition={textCreationContext}
                    pan={pan}
                    zoom={zoom}
                    boardId={boardId}
                    onCommit={(enteredText) => {
                        const trimmed = enteredText.trim();
                        if (!trimmed || !canvasId) {
                            setTextCreationContext(null);
                            return;
                        }

                        const dims = estimateTextDimensions(trimmed, {
                            fontSize: DEFAULT_TEXT_STYLE.fontSize,
                            lineHeight: DEFAULT_TEXT_STYLE.lineHeight,
                            padding: DEFAULT_TEXT_STYLE.padding,
                        });

                        socketClientService
                            .createShape({
                                canvasId,
                                type: "text",
                                x: textCreationContext.x,
                                y: textCreationContext.y,
                                width: dims.width,
                                height: dims.height,
                                rotation: 0,
                                text: trimmed,
                                style: {
                                    fontSize: DEFAULT_TEXT_STYLE.fontSize,
                                    fontFamily: DEFAULT_TEXT_STYLE.fontFamily,
                                    fontWeight: DEFAULT_TEXT_STYLE.fontWeight,
                                    fontStyle: DEFAULT_TEXT_STYLE.fontStyle,
                                    textDecoration: DEFAULT_TEXT_STYLE.textDecoration,
                                    textAlign: DEFAULT_TEXT_STYLE.textAlign,
                                    verticalAlign: DEFAULT_TEXT_STYLE.verticalAlign,
                                    fill: DEFAULT_TEXT_STYLE.fill,
                                    opacity: DEFAULT_TEXT_STYLE.opacity,
                                    padding: DEFAULT_TEXT_STYLE.padding,
                                    lineHeight: DEFAULT_TEXT_STYLE.lineHeight,
                                },
                            })
                            .then((savedShape) => {
                                const shape = mapShapeResponseToShape(savedShape);
                                addShape(shape);
                                setSelectedShapeIds([shape.id]);
                            })
                            .catch((err) => {
                                toast.error(
                                    err instanceof Error
                                        ? err.message
                                        : "Failed to create text shape."
                                );
                            })
                            .finally(() => {
                                setTextCreationContext(null);
                            });
                    }}
                    onDiscard={() => {
                        setTextCreationContext(null);
                    }}
                />
            )}

            {selectedTextShape && activeTool === CANVAS_TOOLS.SELECT && !editingShape && !textCreationContext && (
                <TextFormattingToolbar
                    shape={selectedTextShape}
                    pan={pan}
                    zoom={zoom}
                    canEditCanvas={canEditCanvas}
                    onUpdateFormatting={(shapeId, formatting) => {
                        updateShapeFormatting(shapeId, formatting);
                    }}
                />
            )}

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
                                boardId={boardId}
                                canEditCanvas={canEditCanvas}
                                onStartEditing={(targetShape) => {
                                    if (!canEditCanvas) {
                                        return;
                                    }
                                    if (isTargetLockedByPeer("shape", targetShape.id)) {
                                        const ownerId = getTargetOwner("shape", targetShape.id);
                                        const ownerName = ownerId
                                            ? (usePresenceStore.getState().users[ownerId]?.fullName || "Another collaborator")
                                            : "Another collaborator";
                                        toast.info(`${ownerName} is currently editing this shape.`);
                                        return;
                                    }
                                    startInteraction("editing-text", [{ type: "shape", id: targetShape.id }]).then((res) => {
                                        if (res.success && res.interactionId) {
                                            activeTextInteractionIdRef.current = res.interactionId;
                                        }
                                    });
                                    setEditingShape(targetShape);
                                }}
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

                        {/* Transient local freehand drawing stroke preview */}
                        {freehandDrawing && freehandDrawing.points.length >= 2 ? (
                            <Line
                                points={freehandDrawing.points}
                                stroke={freehandDrawing.stroke}
                                strokeWidth={freehandDrawing.strokeWidth}
                                lineCap="round"
                                lineJoin="round"
                                tension={0.2}
                                listening={false}
                            />
                        ) : null}

                        {/* Transient local vector draft preview (line, arrow, connector) */}
                        {vectorDraft ? (
                            vectorDraft.tool === "line" ? (
                                <Line
                                    points={[
                                        vectorDraft.startX,
                                        vectorDraft.startY,
                                        vectorDraft.currentX,
                                        vectorDraft.currentY,
                                    ]}
                                    stroke="#1f2937"
                                    strokeWidth={2}
                                    lineCap="round"
                                    lineJoin="round"
                                    listening={false}
                                />
                            ) : (
                                <Arrow
                                    points={[
                                        vectorDraft.startX,
                                        vectorDraft.startY,
                                        vectorDraft.currentX,
                                        vectorDraft.currentY,
                                    ]}
                                    stroke="#1f2937"
                                    fill="#1f2937"
                                    strokeWidth={2}
                                    pointerLength={10}
                                    pointerWidth={10}
                                    lineCap="round"
                                    lineJoin="round"
                                    listening={false}
                                />
                            )
                        ) : null}

                        {/* Transient anchor snap indicator */}
                        {snapIndicator ? (
                            <Circle
                                x={snapIndicator.x}
                                y={snapIndicator.y}
                                radius={6}
                                stroke="#3b82f6"
                                strokeWidth={2}
                                fill="rgba(59, 130, 246, 0.3)"
                                listening={false}
                            />
                        ) : null}
                    </Layer>

                    {/* Dedicated Collaborator Overlay Layer */}
                    <Layer listening={false}>
                        {Object.values(remoteSelections).map((selection) => (
                            <CollaboratorSelection
                                key={selection.userId}
                                selection={selection}
                                shapes={shapes}
                            />
                        ))}

                        {Object.values(remoteShapeLocks).map((lock) => (
                            <CollaboratorShapeLock
                                key={lock.shapeId}
                                lock={lock}
                                shapes={shapes}
                            />
                        ))}

                        {Object.values(remoteCursors).map((cursor) => (
                            <CollaboratorCursor
                                key={cursor.userId}
                                cursor={cursor}
                            />
                        ))}

                        <RemoteCursorLayer />
                    </Layer>
                </Stage>
            ) : null}

            {/* Shape Comment Badges Overlay */}
            {shapes.map((shape) => {
                const info = shapeCommentsMap[shape.id];
                if (!info || info.count <= 0) return null;

                // Calculate screen position for badge at top-right of shape
                const badgeScreenX = (shape.x + shape.width) * zoom + pan.x;
                const badgeScreenY = shape.y * zoom + pan.y;

                return (
                    <CommentBadge
                        key={`comment-badge-${shape.id}`}
                        x={badgeScreenX}
                        y={badgeScreenY}
                        count={info.count}
                        hasUnresolved={info.hasUnresolved}
                        onClick={(e) => {
                            e.stopPropagation();
                            selectShape(shape.id);
                            setCommentSelectedShapeId(shape.id);
                            toggleCommentPanel(true);
                        }}
                    />
                );
            })}

            {/* Real-time Connection & Board State Recovery Status Indicator */}
            <RecoveryStatusIndicator
                status={recoveryStatus}
                error={recoveryError}
                onRetry={() => {
                    if (boardId && canvasId) {
                        triggerRecovery(boardId, canvasId);
                    }
                }}
            />

            {/* Real-time Collaborative Comments Panel */}
            <CommentPanel boardId={boardId} />
        </div>
    );
}