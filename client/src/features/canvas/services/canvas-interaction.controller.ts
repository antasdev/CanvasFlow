import { CANVAS_TOOLS, type CanvasTool } from "../constants";
import type {
  InteractionMode,
  PointerContext,
  EscapeAction,
  ToolSwitchCleanup,
} from "../types/interaction-state.types";

export type EscapeEvaluationParams = {
  hasActiveDrawing?: boolean;
  hasActiveVector?: boolean;
  hasActiveFreehand?: boolean;
  isSelecting?: boolean;
  isPanning?: boolean;
  hasTextCreation?: boolean;
  editingGroupId?: string | null;
  selectedCount?: number;
  activeTool?: CanvasTool;
};

/**
 * Headless arbitration controller for CanvasFlow interaction lifecycle.
 * Governs interaction ownership, deterministic priorities, tool switching cleanup,
 * and Escape cancellation hierarchy.
 */
export class CanvasInteractionController {
  private currentMode: InteractionMode = "idle";

  /**
   * Deterministically determines which interaction system owns the pointer gesture.
   */
  public determineInteractionOwner(
    context: PointerContext,
    activeTool: CanvasTool,
    canEditCanvas: boolean = true,
  ): InteractionMode {
    // Priority 1: Navigation / Pan overrides all tools
    if (
      context.isSpacePressed ||
      context.isMiddleMouse ||
      activeTool === CANVAS_TOOLS.HAND
    ) {
      return "panning";
    }

    // Priority 2: Transformer handle manipulation
    if (context.isTransformerHandle) {
      return "transforming";
    }

    // Priority 3: Shape interaction (clicking on an existing shape)
    if (!context.isEmptyCanvas) {
      if (activeTool === CANVAS_TOOLS.SELECT) {
        return "selecting";
      }
      if (activeTool === CANVAS_TOOLS.CONNECTOR && canEditCanvas) {
        return "drawing_vector";
      }
      // Clicking a shape with other tools: if edit is allowed, allow selection or tool behavior
      return "selecting";
    }

    // Priority 4: Empty canvas interactions governed by active tool
    if (activeTool === CANVAS_TOOLS.SELECT) {
      return "marquee_selecting";
    }

    if (activeTool === CANVAS_TOOLS.LASSO) {
      return "lasso_selecting";
    }

    if (!canEditCanvas) {
      return "idle";
    }

    if (activeTool === CANVAS_TOOLS.FREEHAND) {
      return "drawing_freehand";
    }

    if (
      activeTool === CANVAS_TOOLS.LINE ||
      activeTool === CANVAS_TOOLS.ARROW ||
      activeTool === CANVAS_TOOLS.CONNECTOR
    ) {
      return "drawing_vector";
    }

    if (
      activeTool === CANVAS_TOOLS.RECTANGLE ||
      activeTool === CANVAS_TOOLS.CIRCLE ||
      activeTool === CANVAS_TOOLS.ELLIPSE ||
      activeTool === CANVAS_TOOLS.TRIANGLE ||
      activeTool === CANVAS_TOOLS.POLYGON ||
      activeTool === CANVAS_TOOLS.STAR ||
      activeTool === CANVAS_TOOLS.STICKY_NOTE
    ) {
      return "drawing_shape";
    }

    if (activeTool === CANVAS_TOOLS.TEXT) {
      return "text_editing";
    }

    return "idle";
  }

  /**
   * Begins tracking an interaction mode.
   */
  public startInteraction(mode: InteractionMode): boolean {
    if (mode === "idle") {
      return false;
    }
    this.currentMode = mode;
    return true;
  }

  /**
   * Concludes the active interaction and returns to idle.
   */
  public endInteraction(): void {
    this.currentMode = "idle";
  }

  /**
   * Returns the current active interaction mode.
   */
  public getCurrentMode(): InteractionMode {
    return this.currentMode;
  }

  /**
   * Returns whether an interaction gesture is currently active.
   */
  public isInteracting(): boolean {
    return this.currentMode !== "idle";
  }

  /**
   * Evaluates the Escape key cancellation ladder.
   * Priority:
   * 1. Cancel in-progress drawing / drafting / freehand
   * 2. Cancel in-progress selection gesture (marquee / lasso)
   * 3. Cancel in-progress pan gesture
   * 4. Discard pending text creation
   * 5. Exit active group edit mode
   * 6. Clear selected shapes
   * 7. Reset active tool to Select
   */
  public evaluateEscape(params: EscapeEvaluationParams): EscapeAction {
    if (
      params.hasActiveDrawing ||
      params.hasActiveVector ||
      params.hasActiveFreehand ||
      this.currentMode === "drawing_shape" ||
      this.currentMode === "drawing_vector" ||
      this.currentMode === "drawing_freehand"
    ) {
      return "cancel_drawing";
    }

    if (
      params.isSelecting ||
      this.currentMode === "marquee_selecting" ||
      this.currentMode === "lasso_selecting"
    ) {
      return "cancel_selection";
    }

    if (params.isPanning || this.currentMode === "panning") {
      return "cancel_pan";
    }

    if (params.hasTextCreation) {
      return "discard_text";
    }

    if (params.editingGroupId) {
      return "exit_group";
    }

    if ((params.selectedCount ?? 0) > 0) {
      return "clear_selection";
    }

    if (params.activeTool && params.activeTool !== CANVAS_TOOLS.SELECT) {
      return "reset_tool";
    }

    return "none";
  }

  /**
   * Resolves cleanup directives when switching active tools.
   */
  public handleToolSwitch(
    _previousTool: CanvasTool,
    nextTool: CanvasTool,
  ): ToolSwitchCleanup {
    const wasActive = this.currentMode !== "idle";
    const mode = this.currentMode;

    if (wasActive) {
      this.currentMode = "idle";
    }

    let cursor = "default";
    if (nextTool === CANVAS_TOOLS.HAND) {
      cursor = "grab";
    } else if (nextTool === CANVAS_TOOLS.TEXT) {
      cursor = "text";
    } else if (
      nextTool === CANVAS_TOOLS.LASSO ||
      nextTool === CANVAS_TOOLS.FREEHAND ||
      nextTool === CANVAS_TOOLS.LINE ||
      nextTool === CANVAS_TOOLS.ARROW ||
      nextTool === CANVAS_TOOLS.CONNECTOR ||
      nextTool === CANVAS_TOOLS.RECTANGLE ||
      nextTool === CANVAS_TOOLS.CIRCLE ||
      nextTool === CANVAS_TOOLS.ELLIPSE ||
      nextTool === CANVAS_TOOLS.TRIANGLE ||
      nextTool === CANVAS_TOOLS.POLYGON ||
      nextTool === CANVAS_TOOLS.STAR ||
      nextTool === CANVAS_TOOLS.STICKY_NOTE
    ) {
      cursor = "crosshair";
    }

    return {
      shouldCancelDrawing:
        mode === "drawing_shape" ||
        mode === "drawing_vector" ||
        mode === "drawing_freehand",
      shouldCancelSelection:
        mode === "marquee_selecting" || mode === "lasso_selecting",
      shouldCancelPan: mode === "panning",
      shouldDiscardText: mode === "text_editing",
      newCursor: cursor,
    };
  }
}
