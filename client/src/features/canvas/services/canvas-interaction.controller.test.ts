import { describe, expect, it, beforeEach } from "vitest";
import { CanvasInteractionController } from "./canvas-interaction.controller";
import { CANVAS_TOOLS } from "../constants";

describe("CanvasInteractionController", () => {
  let controller: CanvasInteractionController;

  beforeEach(() => {
    controller = new CanvasInteractionController();
  });

  describe("Interaction Ownership & Priorities", () => {
    it("prioritizes panning when Spacebar is pressed regardless of tool", () => {
      const mode = controller.determineInteractionOwner(
        {
          button: 0,
          isSpacePressed: true,
          isMiddleMouse: false,
          isEmptyCanvas: true,
          isTransformerHandle: false,
        },
        CANVAS_TOOLS.RECTANGLE,
      );
      expect(mode).toBe("panning");
    });

    it("prioritizes panning when middle mouse button is pressed", () => {
      const mode = controller.determineInteractionOwner(
        {
          button: 1,
          isSpacePressed: false,
          isMiddleMouse: true,
          isEmptyCanvas: true,
          isTransformerHandle: false,
        },
        CANVAS_TOOLS.FREEHAND,
      );
      expect(mode).toBe("panning");
    });

    it("pans when HAND tool is active", () => {
      const mode = controller.determineInteractionOwner(
        {
          button: 0,
          isSpacePressed: false,
          isMiddleMouse: false,
          isEmptyCanvas: true,
          isTransformerHandle: false,
        },
        CANVAS_TOOLS.HAND,
      );
      expect(mode).toBe("panning");
    });

    it("prioritizes transformer handles over canvas shapes and tools", () => {
      const mode = controller.determineInteractionOwner(
        {
          button: 0,
          isSpacePressed: false,
          isMiddleMouse: false,
          isEmptyCanvas: false,
          isTransformerHandle: true,
        },
        CANVAS_TOOLS.SELECT,
      );
      expect(mode).toBe("transforming");
    });

    it("selects shapes when clicking on a shape with SELECT tool", () => {
      const mode = controller.determineInteractionOwner(
        {
          button: 0,
          isSpacePressed: false,
          isMiddleMouse: false,
          isEmptyCanvas: false,
          isTransformerHandle: false,
        },
        CANVAS_TOOLS.SELECT,
      );
      expect(mode).toBe("selecting");
    });

    it("starts marquee selection on empty canvas with SELECT tool", () => {
      const mode = controller.determineInteractionOwner(
        {
          button: 0,
          isSpacePressed: false,
          isMiddleMouse: false,
          isEmptyCanvas: true,
          isTransformerHandle: false,
        },
        CANVAS_TOOLS.SELECT,
      );
      expect(mode).toBe("marquee_selecting");
    });

    it("starts lasso selection on empty canvas with LASSO tool", () => {
      const mode = controller.determineInteractionOwner(
        {
          button: 0,
          isSpacePressed: false,
          isMiddleMouse: false,
          isEmptyCanvas: true,
          isTransformerHandle: false,
        },
        CANVAS_TOOLS.LASSO,
      );
      expect(mode).toBe("lasso_selecting");
    });

    it("starts freehand drawing on empty canvas with FREEHAND tool", () => {
      const mode = controller.determineInteractionOwner(
        {
          button: 0,
          isSpacePressed: false,
          isMiddleMouse: false,
          isEmptyCanvas: true,
          isTransformerHandle: false,
        },
        CANVAS_TOOLS.FREEHAND,
      );
      expect(mode).toBe("drawing_freehand");
    });

    it("starts vector drawing with LINE, ARROW, or CONNECTOR", () => {
      const lineMode = controller.determineInteractionOwner(
        {
          button: 0,
          isSpacePressed: false,
          isMiddleMouse: false,
          isEmptyCanvas: true,
          isTransformerHandle: false,
        },
        CANVAS_TOOLS.LINE,
      );
      expect(lineMode).toBe("drawing_vector");

      const arrowMode = controller.determineInteractionOwner(
        {
          button: 0,
          isSpacePressed: false,
          isMiddleMouse: false,
          isEmptyCanvas: true,
          isTransformerHandle: false,
        },
        CANVAS_TOOLS.ARROW,
      );
      expect(arrowMode).toBe("drawing_vector");
    });

    it("starts shape drawing with basic shape tools", () => {
      const rect = controller.determineInteractionOwner(
        {
          button: 0,
          isSpacePressed: false,
          isMiddleMouse: false,
          isEmptyCanvas: true,
          isTransformerHandle: false,
        },
        CANVAS_TOOLS.RECTANGLE,
      );
      expect(rect).toBe("drawing_shape");

      const circle = controller.determineInteractionOwner(
        {
          button: 0,
          isSpacePressed: false,
          isMiddleMouse: false,
          isEmptyCanvas: true,
          isTransformerHandle: false,
        },
        CANVAS_TOOLS.CIRCLE,
      );
      expect(circle).toBe("drawing_shape");
    });

    it("disallows drawing interactions when canEditCanvas is false", () => {
      const mode = controller.determineInteractionOwner(
        {
          button: 0,
          isSpacePressed: false,
          isMiddleMouse: false,
          isEmptyCanvas: true,
          isTransformerHandle: false,
        },
        CANVAS_TOOLS.RECTANGLE,
        false, // canEditCanvas
      );
      expect(mode).toBe("idle");
    });
  });

  describe("State Lifecycle Management", () => {
    it("starts and ends interactions accurately", () => {
      expect(controller.isInteracting()).toBe(false);
      expect(controller.getCurrentMode()).toBe("idle");

      controller.startInteraction("drawing_shape");
      expect(controller.isInteracting()).toBe(true);
      expect(controller.getCurrentMode()).toBe("drawing_shape");

      controller.endInteraction();
      expect(controller.isInteracting()).toBe(false);
      expect(controller.getCurrentMode()).toBe("idle");
    });
  });

  describe("Escape Key Cancellation Hierarchy", () => {
    it("cancels in-progress drawing first", () => {
      controller.startInteraction("drawing_shape");
      const action = controller.evaluateEscape({
        hasActiveDrawing: true,
        isSelecting: true,
        selectedCount: 3,
      });
      expect(action).toBe("cancel_drawing");
    });

    it("cancels in-progress selection gesture when no drawing is active", () => {
      const action = controller.evaluateEscape({
        isSelecting: true,
        selectedCount: 2,
      });
      expect(action).toBe("cancel_selection");
    });

    it("cancels in-progress panning when no drawing or selection is active", () => {
      controller.startInteraction("panning");
      const action = controller.evaluateEscape({
        isPanning: true,
      });
      expect(action).toBe("cancel_pan");
    });

    it("discards text creation context before clearing selection", () => {
      const action = controller.evaluateEscape({
        hasTextCreation: true,
        selectedCount: 1,
      });
      expect(action).toBe("discard_text");
    });

    it("exits editing group before clearing root selection", () => {
      const action = controller.evaluateEscape({
        editingGroupId: "group-1",
        selectedCount: 1,
      });
      expect(action).toBe("exit_group");
    });

    it("clears selection when shapes are selected", () => {
      const action = controller.evaluateEscape({
        selectedCount: 2,
      });
      expect(action).toBe("clear_selection");
    });

    it("resets active tool to SELECT when nothing is selected", () => {
      const action = controller.evaluateEscape({
        selectedCount: 0,
        activeTool: CANVAS_TOOLS.RECTANGLE,
      });
      expect(action).toBe("reset_tool");
    });

    it("returns none when canvas is completely idle", () => {
      const action = controller.evaluateEscape({
        selectedCount: 0,
        activeTool: CANVAS_TOOLS.SELECT,
      });
      expect(action).toBe("none");
    });
  });

  describe("Tool Switching Cleanup", () => {
    it("resets in-progress gesture and yields appropriate cursor", () => {
      controller.startInteraction("drawing_shape");
      const cleanup = controller.handleToolSwitch(
        CANVAS_TOOLS.RECTANGLE,
        CANVAS_TOOLS.HAND,
      );

      expect(cleanup.shouldCancelDrawing).toBe(true);
      expect(cleanup.newCursor).toBe("grab");
      expect(controller.isInteracting()).toBe(false);
    });

    it("yields crosshair cursor for vector tools and text cursor for TEXT tool", () => {
      const lasso = controller.handleToolSwitch(
        CANVAS_TOOLS.SELECT,
        CANVAS_TOOLS.LASSO,
      );
      expect(lasso.newCursor).toBe("crosshair");

      const text = controller.handleToolSwitch(
        CANVAS_TOOLS.SELECT,
        CANVAS_TOOLS.TEXT,
      );
      expect(text.newCursor).toBe("text");
    });
  });
});
