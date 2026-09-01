import type Konva from "konva";
import { useEffect, useMemo, useRef, useState } from "react";
import { Arrow, Circle, Ellipse, Group, Layer, Line, Rect, Stage } from "react-konva";
import { toast } from "sonner";

import {
    useComments,
    useCommentSocket,
    useCommentStore,
    CommentBadge,
    CommentPanel,
} from "@/features/comments";
import { socketClientService } from "@/services/socket";

import { mapShapeResponseToShape, shapeApi, type CreateShapeRequest } from "../api";
import { CANVAS_TOOLS, type CanvasTool } from "../constants";
import {
    useCanvasHistory,
    useCanvasSocket,
    useCanvasClipboard,
    useShapes,
    useBoardRecovery,
    usePresenceSocket,
    useInteractionSocket,
    useCanvasSelection,
    useCanvasViewport,
} from "../hooks";
import { CanvasInteractionController } from "../services/canvas-interaction.controller";
import { mutationManager } from "../services/mutation-manager";
import { useCanvasStore, usePresenceStore } from "../store";
import type { TextShape, StickyNoteShape, ShapeStyle } from "../types";
import { findNearestAnchor, type AnchorPosition } from "../utils/anchor.utils";
import { screenToWorld } from "../utils/canvas.coordinates";
import {
    normalizeShapeBounds,
    calculateCircleGeometry,
    calculateEllipseGeometry,
    calculateTrianglePoints,
    calculatePolygonPoints,
    calculateStarPoints,
} from "../utils/shape-geometry.utils";
import { getShapeStyle } from "../utils/shape-style.utils";
import {
    simplifyStroke,
    computeBoundingBox,
    normalizePointsToLocal,
} from "../utils/stroke-simplification";
import { DEFAULT_TEXT_STYLE, estimateTextDimensions } from "../utils/text.utils";

import CanvasGrid from "./CanvasGrid";
import CanvasZoomControls from "./CanvasZoomControls";
import CollaboratorCursor from "./CollaboratorCursor";
import CollaboratorSelection from "./CollaboratorSelection";
import CollaboratorShapeLock from "./CollaboratorShapeLock";
import KeyboardShortcutsModal from "./KeyboardShortcutsModal";
import { RecoveryStatusIndicator } from "./RecoveryStatusIndicator";
import RemoteCursorLayer from "./RemoteCursorLayer";
import ShapeRenderer from "./ShapeRenderer";
import ShapeStyleToolbar from "./ShapeStyleToolbar";
import { SmartGuideOverlay } from "./SmartGuideOverlay";
import TextEditorOverlay from "./TextEditorOverlay";
import TextFormattingToolbar from "./TextFormattingToolbar";


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
    tool: "rectangle" | "circle" | "ellipse" | "triangle" | "polygon" | "star";
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

    const {
        zoom,
        pan,
        formattedZoom,
        isPanning,
        startPan,
        updatePan,
        endPan,
        cancelPan,
        handleWheel,
        zoomIn,
        zoomOut,
        resetZoom,
    } = useCanvasViewport({ stageRef });

    const interactionController = useMemo(() => new CanvasInteractionController(), []);
    const previousToolRef = useRef<CanvasTool>(activeTool);

    const addShape = useCanvasStore(
        (state) => state.addShape,
    );

    const deleteShape = useCanvasStore(
        (state) => state.deleteShape,
    );

    const selectAllShapes = useCanvasStore(
        (state) => state.selectAllShapes,
    );

    const moveSelectedShapes = useCanvasStore(
        (state) => state.moveSelectedShapes,
    );

    const [isShortcutsOpen, setIsShortcutsOpen] = useState<boolean>(false);

    const {
        marquee,
        lasso,
        isSelecting,
        startSelection,
        updateSelection,
        endSelection,
    } = useCanvasSelection({
        boardId,
        canEditCanvas,
        emitActivity,
    });

    const [isSpacePressed, setIsSpacePressed] = useState<boolean>(false);
    useEffect(() => {
        const handleSpaceDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            const isTyping =
                target.tagName === "INPUT" ||
                target.tagName === "TEXTAREA" ||
                target.isContentEditable;
            if (isTyping) return;

            if (e.code === "Space") {
                setIsSpacePressed(true);
            }
        };
        const handleSpaceUp = (e: KeyboardEvent) => {
            if (e.code === "Space") {
                setIsSpacePressed(false);
            }
        };
        window.addEventListener("keydown", handleSpaceDown);
        window.addEventListener("keyup", handleSpaceUp);
        return () => {
            window.removeEventListener("keydown", handleSpaceDown);
            window.removeEventListener("keyup", handleSpaceUp);
        };
    }, []);

    const setSelectedShapeIds = useCanvasStore(
        (state) => state.setSelectedShapeIds,
    );

    const clearSelection = useCanvasStore(
        (state) => state.clearSelection,
    );

    const editingGroupId = useCanvasStore(
        (state) => state.editingGroupId,
    );

    const enterGroup = useCanvasStore(
        (state) => state.enterGroup,
    );

    const exitGroup = useCanvasStore(
        (state) => state.exitGroup,
    );

    const groupShapes = useCanvasStore(
        (state) => state.groupShapes,
    );

    const ungroupShapes = useCanvasStore(
        (state) => state.ungroupShapes,
    );

    const [textCreationContext, setTextCreationContext] =
        useState<{ x: number; y: number } | null>(null);

    const { handleCopy, handlePaste, handleDuplicate } = useCanvasClipboard({
        boardId,
        canvasId,
        canEditCanvas,
        isEditingText: Boolean(textCreationContext),
    });

    /*
     * Tool switching cleanup: safely abort in-flight gestures when tool changes.
     */
    useEffect(() => {
        const cleanup = interactionController.handleToolSwitch(
            previousToolRef.current,
            activeTool,
        );
        previousToolRef.current = activeTool;

        if (cleanup.shouldCancelDrawing) {
            queueMicrotask(() => {
                setDrawing(null);
                setVectorDraft(null);
                setSnapIndicator(null);
                setFreehandDrawing(null);
            });
            if (freehandDrawing) {
                if (boardId && activeDrawingInteractionIdRef.current) {
                    endInteraction(activeDrawingInteractionIdRef.current).catch(() => {});
                    activeDrawingInteractionIdRef.current = null;
                }
                unstreamedPointsRef.current = [];
            }
        }
        if (cleanup.shouldCancelSelection && isSelecting) {
            endSelection();
        }
        if (cleanup.shouldCancelPan && isPanning) {
            endPan();
        }
        if (cleanup.shouldDiscardText && textCreationContext) {
            setTextCreationContext(null);
        }
    }, [activeTool, isSelecting, isPanning, endSelection, endPan, freehandDrawing, boardId, textCreationContext, interactionController, endInteraction]);

    /*
     * Window-level release safety: ensure drags do not get stuck when released outside canvas.
     */
    useEffect(() => {
        const handleWindowPointerUp = (): void => {
            if (isPanning) {
                endPan();
                interactionController.endInteraction();
            }
        };
        const handleWindowPointerCancel = (): void => {
            if (isPanning) {
                cancelPan();
                interactionController.endInteraction();
            }
        };

        window.addEventListener("pointerup", handleWindowPointerUp);
        window.addEventListener("pointercancel", handleWindowPointerCancel);
        return () => {
            window.removeEventListener("pointerup", handleWindowPointerUp);
            window.removeEventListener("pointercancel", handleWindowPointerCancel);
        };
    }, [isPanning, endPan, cancelPan, interactionController]);

    const selectedTextShape = useMemo(() => {
        if (selectedShapeIds.length !== 1) return null;
        const found = shapes.find((s) => s.id === selectedShapeIds[0]);
        if (found && found.type === "text") return found as TextShape;
        return null;
    }, [selectedShapeIds, shapes]);

    const selectedShapes = useMemo(() => {
        if (selectedShapeIds.length === 0) return [];
        const idSet = new Set(selectedShapeIds);
        return shapes.filter((s) => idSet.has(s.id));
    }, [selectedShapeIds, shapes]);

    const updateMultipleShapesStyle = useCanvasStore(
        (state) => state.updateMultipleShapesStyle
    );

    const handleCommitShapesStyle = async (
        shapeIds: string[],
        style: Partial<ShapeStyle>
    ): Promise<void> => {
        const idSet = new Set(shapeIds);
        const targetShapes = shapes.filter((s) => idSet.has(s.id));

        await Promise.all(
            targetShapes.map(async (targetShape) => {
                try {
                    await socketClientService.updateShape(
                        targetShape.id,
                        {
                            style: {
                                ...getShapeStyle(targetShape),
                                ...style,
                            },
                        },
                        targetShape.version
                    );
                } catch (err) {
                    toast.error(
                        err instanceof Error
                            ? err.message
                            : "Failed to persist shape style change."
                    );
                }
            })
        );
    };

    // Automatically enforce SELECT tool and clear transient drawing when user lacks edit permissions
    useEffect(() => {
        if (!canEditCanvas) {
            if (activeTool !== CANVAS_TOOLS.SELECT) {
                queueMicrotask(() => setActiveTool(CANVAS_TOOLS.SELECT));
            }
            if (freehandDrawing) {
                if (boardId && activeDrawingInteractionIdRef.current) {
                    endInteraction(activeDrawingInteractionIdRef.current);
                }
                queueMicrotask(() => setFreehandDrawing(null));
                activeDrawingInteractionIdRef.current = null;
                unstreamedPointsRef.current = [];
            }
        }
    }, [canEditCanvas, activeTool, setActiveTool, freehandDrawing, boardId, endInteraction]);

    // Clear stale ephemeral drawing state on board recovery / reconnection
    useEffect(() => {
        if (recoveryStatus === "recovering") {
            queueMicrotask(() => setFreehandDrawing(null));
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
                target.isContentEditable ||
                (typeof target.closest === "function" && target.closest('[role="dialog"]') !== null);

            if (
                isTyping ||
                isShortcutsOpen ||
                editingShape !== null ||
                textCreationContext !== null
            ) {
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
                const action = interactionController.evaluateEscape({
                    hasActiveDrawing: Boolean(drawing),
                    hasActiveVector: Boolean(vectorDraft),
                    hasActiveFreehand: Boolean(freehandDrawing),
                    isSelecting,
                    isPanning,
                    hasTextCreation: Boolean(textCreationContext),
                    editingGroupId,
                    selectedCount: selectedShapeIds.length,
                    activeTool,
                });

                switch (action) {
                    case "cancel_drawing":
                        setDrawing(null);
                        setVectorDraft(null);
                        setSnapIndicator(null);
                        if (freehandDrawing) {
                            setFreehandDrawing(null);
                            if (boardId && activeDrawingInteractionIdRef.current) {
                                endInteraction(activeDrawingInteractionIdRef.current).catch(() => {});
                                activeDrawingInteractionIdRef.current = null;
                            }
                            unstreamedPointsRef.current = [];
                        }
                        interactionController.endInteraction();
                        return;
                    case "cancel_selection":
                        endSelection();
                        interactionController.endInteraction();
                        return;
                    case "cancel_pan":
                        cancelPan();
                        interactionController.endInteraction();
                        return;
                    case "discard_text":
                        setTextCreationContext(null);
                        interactionController.endInteraction();
                        return;
                    case "exit_group":
                        exitGroup();
                        return;
                    case "clear_selection":
                        clearSelection();
                        return;
                    case "reset_tool":
                        setActiveTool(CANVAS_TOOLS.SELECT);
                        return;
                    default:
                        return;
                }
            }

            if (event.key === "Enter" && selectedShapeIds.length === 1) {
                const selected = shapes.find((s) => s.id === selectedShapeIds[0]);
                if (selected && selected.type === "group" && canEditCanvas) {
                    event.preventDefault();
                    enterGroup(selected.id);
                    return;
                }
            }

            if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === "g") {
                event.preventDefault();
                if (!canEditCanvas) return;
                const groupToUngroup = shapes.find(
                    (s) => selectedShapeIds.includes(s.id) && s.type === "group"
                );
                if (groupToUngroup && canvasId) {
                    ungroupShapes(groupToUngroup.id);
                    socketClientService.ungroupShape(canvasId, groupToUngroup.id, groupToUngroup.version).catch((err) => {
                        toast.error(err instanceof Error ? err.message : "Failed to ungroup shapes.");
                    });
                }
                return;
            }

            if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === "g") {
                event.preventDefault();
                if (!canEditCanvas || selectedShapeIds.length < 2) return;
                const shapesToGroup = shapes.filter((s) => selectedShapeIds.includes(s.id));
                if (shapesToGroup.length >= 2 && canvasId) {
                    const firstParent = shapesToGroup[0].parentId ?? null;
                    if (shapesToGroup.every((s) => (s.parentId ?? null) === firstParent)) {
                        const expectedVersions: Record<string, number> = {};
                        for (const s of shapesToGroup) {
                            if (s.version) expectedVersions[s.id] = s.version;
                        }
                        const group = groupShapes(selectedShapeIds);
                        if (group) {
                            socketClientService.groupShapes(canvasId, selectedShapeIds, expectedVersions).catch((err) => {
                                toast.error(err instanceof Error ? err.message : "Failed to group shapes.");
                            });
                        }
                    }
                }
                return;
            }

            if (
                (event.ctrlKey || event.metaKey) &&
                event.key.toLowerCase() === "a"
            ) {
                event.preventDefault();
                selectAllShapes();
                return;
            }

            // Keyboard Shortcuts Modal Toggle: ? or Shift + /
            if (event.key === "?" || (event.shiftKey && event.key === "/")) {
                event.preventDefault();
                setIsShortcutsOpen((prev) => !prev);
                return;
            }

            // Keyboard Zoom Shortcuts
            if ((event.ctrlKey || event.metaKey) && (event.key === "=" || event.key === "+")) {
                event.preventDefault();
                zoomIn();
                return;
            }
            if ((event.ctrlKey || event.metaKey) && (event.key === "-" || event.key === "_")) {
                event.preventDefault();
                zoomOut();
                return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key === "0") {
                event.preventDefault();
                resetZoom();
                return;
            }

            // Arrow Key Nudge for Selected Shapes
            if (
                ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(
                    event.key,
                )
            ) {
                if (!canEditCanvas || selectedShapeIds.length === 0) {
                    return;
                }

                event.preventDefault();
                const step = event.shiftKey ? 10 : 1;
                let deltaX = 0;
                let deltaY = 0;

                if (event.key === "ArrowLeft") deltaX = -step;
                else if (event.key === "ArrowRight") deltaX = step;
                else if (event.key === "ArrowUp") deltaY = -step;
                else if (event.key === "ArrowDown") deltaY = step;

                // 1. Move shapes locally and record an undo snapshot in history
                moveSelectedShapes(deltaX, deltaY);

                // 2. Authoritative persistence through existing mutation pipeline with OCC & journal tracking
                if (boardId) {
                    const currentShapes = useCanvasStore.getState().shapes;
                    for (const id of selectedShapeIds) {
                        if (isTargetLockedByPeer("shape", id)) continue;
                        const moved = currentShapes.find((s) => s.id === id);
                        if (moved) {
                            mutationManager
                                .executeShapeUpdate(
                                    boardId,
                                    moved.id,
                                    {
                                        x: moved.x,
                                        y: moved.y,
                                    },
                                    moved.version
                                )
                                .catch((err) => {
                                    toast.error(
                                        err instanceof Error
                                            ? err.message
                                            : "Failed to persist shape movement."
                                    );
                                });
                        }
                    }
                }
                return;
            }

            // Single-key tool switches (when no modifier key is active)
            if (!event.ctrlKey && !event.metaKey && !event.altKey) {
                const key = event.key.toLowerCase();
                if (key === "v") {
                    setActiveTool(CANVAS_TOOLS.SELECT);
                    return;
                }
                if (key === "h") {
                    setActiveTool(CANVAS_TOOLS.HAND);
                    return;
                }
                if (key === "c") {
                    toggleCommentPanel();
                    return;
                }
                if (canEditCanvas) {
                    if (key === "r") {
                        setActiveTool(CANVAS_TOOLS.RECTANGLE);
                        return;
                    }
                    if (key === "o") {
                        setActiveTool(CANVAS_TOOLS.CIRCLE);
                        return;
                    }
                    if (key === "t") {
                        setActiveTool(CANVAS_TOOLS.TEXT);
                        return;
                    }
                    if (key === "l") {
                        setActiveTool(CANVAS_TOOLS.LINE);
                        return;
                    }
                    if (key === "a") {
                        setActiveTool(CANVAS_TOOLS.ARROW);
                        return;
                    }
                    if (key === "p" || key === "d") {
                        setActiveTool(CANVAS_TOOLS.FREEHAND);
                        return;
                    }
                    if (key === "s") {
                        setActiveTool(CANVAS_TOOLS.STICKY_NOTE);
                        return;
                    }
                }
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
        editingGroupId,
        exitGroup,
        enterGroup,
        groupShapes,
        ungroupShapes,
        shapes,
        canEditCanvas,
        canvasId,
        drawing,
        vectorDraft,
        freehandDrawing,
        isSelecting,
        isPanning,
        textCreationContext,
        editingShape,
        isShortcutsOpen,
        activeTool,
        boardId,
        cancelPan,
        endSelection,
        interactionController,
        setActiveTool,
        moveSelectedShapes,
        zoomIn,
        zoomOut,
        resetZoom,
        isTargetLockedByPeer,
        toggleCommentPanel,
        endInteraction,
        setShapes,
    ]);

    /*
     * Start drawing a rectangle.
     */
    const handlePointerDown = (
        event: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
    ): void => {
        const stage = stageRef.current;

        if (!stage) {
            return;
        }

        const nativeEvt = event.evt;
        const isTouch = "touches" in nativeEvt;
        const clientX = isTouch
            ? nativeEvt.touches[0]?.clientX ?? 0
            : (nativeEvt as MouseEvent).clientX;
        const clientY = isTouch
            ? nativeEvt.touches[0]?.clientY ?? 0
            : (nativeEvt as MouseEvent).clientY;
        const button = isTouch ? 0 : (nativeEvt as MouseEvent).button;
        const isMiddleMouse = button === 1;

        const isEmptyCanvas = event.target === stage;
        const isTransformerHandle = Boolean(
            event.target.getParent()?.className === "Transformer" ||
            event.target.className === "Transformer"
        );

        const mode = interactionController.determineInteractionOwner(
            {
                button,
                isSpacePressed,
                isMiddleMouse,
                isEmptyCanvas,
                isTransformerHandle,
            },
            activeTool,
            canEditCanvas,
        );

        if (mode === "panning") {
            event.evt.preventDefault();
            startPan({ x: clientX, y: clientY });
            interactionController.startInteraction("panning");
            return;
        }

        if (mode === "transforming") {
            interactionController.startInteraction("transforming");
            return;
        }

        if (mode === "marquee_selecting" || mode === "lasso_selecting") {
            const pointer = stage.getPointerPosition();
            if (!pointer) {
                return;
            }

            const worldPoint = screenToWorld(pointer, {
                pan,
                zoom,
            });

            const started = startSelection(
                worldPoint,
                event as Konva.KonvaEventObject<MouseEvent>,
            );
            if (started) {
                interactionController.startInteraction(mode);
                return;
            }
        }

        if (isEmptyCanvas) {
            if (editingGroupId) {
                exitGroup();
            }
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

        const isBasicShapeTool =
            activeTool === CANVAS_TOOLS.RECTANGLE ||
            activeTool === CANVAS_TOOLS.CIRCLE ||
            activeTool === CANVAS_TOOLS.ELLIPSE ||
            activeTool === CANVAS_TOOLS.TRIANGLE ||
            activeTool === CANVAS_TOOLS.POLYGON ||
            activeTool === CANVAS_TOOLS.STAR;

        if (!isBasicShapeTool) {
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
            tool: activeTool as "rectangle" | "circle" | "ellipse" | "triangle" | "polygon" | "star",
            startX: worldPoint.x,
            startY: worldPoint.y,
            currentX: worldPoint.x,
            currentY: worldPoint.y,
        });
    };

    /*
     * Update gesture / preview while moving pointer.
     */
    const handlePointerMove = (
        event?: Konva.KonvaEventObject<MouseEvent | TouchEvent>,
    ): void => {
        const stage = stageRef.current;

        if (!stage) {
            return;
        }

        if (isPanning && event) {
            const nativeEvt = event.evt;
            const isTouch = "touches" in nativeEvt;
            const clientX = isTouch
                ? nativeEvt.touches[0]?.clientX ?? 0
                : (nativeEvt as MouseEvent).clientX;
            const clientY = isTouch
                ? nativeEvt.touches[0]?.clientY ?? 0
                : (nativeEvt as MouseEvent).clientY;
            updatePan({ x: clientX, y: clientY });
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

        if (isSelecting) {
            updateSelection(worldPoint);
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
        if (isPanning) {
            endPan();
            interactionController.endInteraction();
            return;
        }

        /*
         * Finish multi-selection.
         */
        if (isSelecting) {
            endSelection();
            interactionController.endInteraction();
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
            interactionController.endInteraction();

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
            interactionController.endInteraction();

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
         * No shape is being drawn.
         */
        if (!drawing) {
            return;
        }

        const bounds = normalizeShapeBounds(
            drawing.startX,
            drawing.startY,
            drawing.currentX,
            drawing.currentY
        );

        const currentTool = drawing.tool;
        setDrawing(null);
        interactionController.endInteraction();

        /*
         * Ignore accidental clicks / sub-threshold drags.
         */
        if (bounds.width < 5 || bounds.height < 5) {
            return;
        }

        if (!canvasId) {
            toast.error("No active canvas available.");
            return;
        }

        const createPayload: CreateShapeRequest = {
            canvasId,
            type: currentTool,
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
            rotation: 0,
            style: {
                fill: "#ffffff",
                stroke: "#1f2937",
                strokeWidth: 2,
                opacity: 1,
            },
        };

        if (currentTool === "polygon") {
            createPayload.shapeConfig = { sides: 5 };
        } else if (currentTool === "star") {
            createPayload.shapeConfig = { points: 5, innerRadiusRatio: 0.5 };
        }

        socketClientService
            .createShape(createPayload)
            .then((savedShape) => {
                const mappedShape =
                    mapShapeResponseToShape(
                        savedShape,
                    );
                addShape(mappedShape);
            })
            .catch((err) => {
                toast.error(
                    err instanceof Error
                        ? err.message
                        : "Failed to create shape.",
                );
            });
    };
    const stageCursor = useMemo(() => {
        if (isPanning) return "grabbing";
        if (isSpacePressed || activeTool === CANVAS_TOOLS.HAND) return "grab";
        if (activeTool === CANVAS_TOOLS.TEXT) return "text";
        if (activeTool === CANVAS_TOOLS.SELECT) return "default";
        return "crosshair";
    }, [isPanning, isSpacePressed, activeTool]);

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

            {selectedShapes.length > 0 &&
                !selectedTextShape &&
                activeTool === CANVAS_TOOLS.SELECT &&
                !editingShape &&
                !textCreationContext && (
                    <ShapeStyleToolbar
                        selectedShapes={selectedShapes}
                        pan={pan}
                        zoom={zoom}
                        canvasId={canvasId}
                        canEditCanvas={canEditCanvas}
                        onUpdateStyle={(shapeIds, style, isLivePreview) => {
                            updateMultipleShapesStyle(shapeIds, style, isLivePreview);
                        }}
                        onCommitStyle={handleCommitShapesStyle}
                        onCopy={handleCopy}
                        onPaste={handlePaste}
                        onDuplicate={handleDuplicate}
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
                    style={{ cursor: stageCursor }}
                    onWheel={handleWheel}
                    onMouseDown={handlePointerDown}
                    onMouseMove={handlePointerMove}
                    onMouseUp={handlePointerUp}
                    onTouchStart={handlePointerDown}
                    onTouchMove={handlePointerMove}
                    onTouchEnd={handlePointerUp}
                >
                    <Layer>
                        <CanvasGrid
                            width={size.width}
                            height={size.height}
                            pan={pan}
                            zoom={zoom}
                        />

                        {shapes
                            .filter((shape) => !shape.parentId)
                            .map((shape) => (
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

                        {marquee ? (
                            <Rect
                                x={Math.min(
                                    marquee.startX,
                                    marquee.currentX,
                                )}
                                y={Math.min(
                                    marquee.startY,
                                    marquee.currentY,
                                )}
                                width={Math.max(
                                    1,
                                    Math.abs(
                                        marquee.currentX -
                                        marquee.startX,
                                    ),
                                )}
                                height={Math.max(
                                    1,
                                    Math.abs(
                                        marquee.currentY -
                                        marquee.startY,
                                    ),
                                )}
                                fill={
                                    marquee.direction === "left-to-right"
                                        ? "#3b82f6"
                                        : "#10b981"
                                }
                                opacity={0.12}
                                stroke={
                                    marquee.direction === "left-to-right"
                                        ? "#3b82f6"
                                        : "#10b981"
                                }
                                strokeWidth={
                                    marquee.direction === "left-to-right"
                                        ? 1
                                        : 1.5
                                }
                                dash={
                                    marquee.direction === "left-to-right"
                                        ? undefined
                                        : [6, 4]
                                }
                                listening={false}
                            />
                        ) : null}

                        {lasso && lasso.points.length >= 2 ? (
                            <Line
                                points={lasso.points.flatMap((p) => [p.x, p.y])}
                                closed={true}
                                fill="#8b5cf6"
                                opacity={0.1}
                                stroke="#8b5cf6"
                                strokeWidth={1.5}
                                dash={[5, 5]}
                                listening={false}
                            />
                        ) : null}

                        {drawing ? (() => {
                            const bounds = normalizeShapeBounds(
                                drawing.startX,
                                drawing.startY,
                                drawing.currentX,
                                drawing.currentY
                            );

                            if (drawing.tool === "circle") {
                                const geom = calculateCircleGeometry(bounds.width, bounds.height);
                                return (
                                    <Circle
                                        x={bounds.x + geom.centerX}
                                        y={bounds.y + geom.centerY}
                                        radius={geom.radius}
                                        fill="#ffffff"
                                        stroke="#1f2937"
                                        strokeWidth={2}
                                        opacity={0.7}
                                        listening={false}
                                    />
                                );
                            }

                            if (drawing.tool === "ellipse") {
                                const geom = calculateEllipseGeometry(bounds.width, bounds.height);
                                return (
                                    <Ellipse
                                        x={bounds.x + geom.centerX}
                                        y={bounds.y + geom.centerY}
                                        radiusX={geom.radiusX}
                                        radiusY={geom.radiusY}
                                        fill="#ffffff"
                                        stroke="#1f2937"
                                        strokeWidth={2}
                                        opacity={0.7}
                                        listening={false}
                                    />
                                );
                            }

                            if (drawing.tool === "triangle") {
                                const points = calculateTrianglePoints(bounds.width, bounds.height);
                                return (
                                    <Group x={bounds.x} y={bounds.y} listening={false}>
                                        <Line
                                            points={points}
                                            closed
                                            fill="#ffffff"
                                            stroke="#1f2937"
                                            strokeWidth={2}
                                            opacity={0.7}
                                            lineCap="round"
                                            lineJoin="round"
                                        />
                                    </Group>
                                );
                            }

                            if (drawing.tool === "polygon") {
                                const points = calculatePolygonPoints(bounds.width, bounds.height, 5);
                                return (
                                    <Group x={bounds.x} y={bounds.y} listening={false}>
                                        <Line
                                            points={points}
                                            closed
                                            fill="#ffffff"
                                            stroke="#1f2937"
                                            strokeWidth={2}
                                            opacity={0.7}
                                            lineCap="round"
                                            lineJoin="round"
                                        />
                                    </Group>
                                );
                            }

                            if (drawing.tool === "star") {
                                const points = calculateStarPoints(bounds.width, bounds.height, 5, 0.5);
                                return (
                                    <Group x={bounds.x} y={bounds.y} listening={false}>
                                        <Line
                                            points={points}
                                            closed
                                            fill="#ffffff"
                                            stroke="#1f2937"
                                            strokeWidth={2}
                                            opacity={0.7}
                                            lineCap="round"
                                            lineJoin="round"
                                        />
                                    </Group>
                                );
                            }

                            return (
                                <Rect
                                    x={bounds.x}
                                    y={bounds.y}
                                    width={bounds.width}
                                    height={bounds.height}
                                    fill="#ffffff"
                                    stroke="#1f2937"
                                    strokeWidth={2}
                                    opacity={0.7}
                                    listening={false}
                                />
                            );
                        })() : null}

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

                        {/* Ephemeral Smart Guides Overlay */}
                        <SmartGuideOverlay />
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

            {/* Floating Bottom-Right Canvas Zoom Controls */}
            <div className="absolute right-4 bottom-4 z-10">
                <CanvasZoomControls
                    zoom={zoom}
                    formattedZoom={formattedZoom}
                    onZoomIn={zoomIn}
                    onZoomOut={zoomOut}
                    onResetZoom={resetZoom}
                    onToggleHelp={() => setIsShortcutsOpen((prev) => !prev)}
                />
            </div>

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

            {/* Keyboard Shortcuts Cheatsheet Modal */}
            <KeyboardShortcutsModal
                isOpen={isShortcutsOpen}
                onClose={() => setIsShortcutsOpen(false)}
            />
        </div>
    );
}