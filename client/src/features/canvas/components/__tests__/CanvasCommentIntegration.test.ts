import { beforeEach, describe, expect, it } from "vitest";

import { CANVAS_TOOLS } from "@/features/canvas/constants";
import { CanvasInteractionController } from "@/features/canvas/services/canvas-interaction.controller";
import { useCanvasStore } from "@/features/canvas/store";
import {
  screenToWorld,
  worldToScreen,
  type CanvasTransform,
} from "@/features/canvas/utils/canvas.coordinates";
import { useCommentStore } from "@/features/comments/store";
import type { Comment } from "@/features/comments/types";

describe("Canvas Comment Anchoring & UI Integration Flow", () => {
  let interactionController: CanvasInteractionController;

  beforeEach(() => {
    interactionController = new CanvasInteractionController();
    useCommentStore.getState().clearComments();
    useCanvasStore.getState().resetCanvas();
  });

  it("completes the full flow: click canvas -> convert to world coordinate -> anchor comment -> render marker -> pan/zoom stability", () => {
    // 1. User activates Comment Tool
    useCanvasStore.getState().setActiveTool(CANVAS_TOOLS.COMMENT);
    expect(useCanvasStore.getState().activeTool).toBe("comment");

    // 2. Interaction Controller determines interaction owner
    const mode = interactionController.determineInteractionOwner(
      {
        button: 0,
        isSpacePressed: false,
        isMiddleMouse: false,
        isEmptyCanvas: true,
        isTransformerHandle: false,
      },
      CANVAS_TOOLS.COMMENT,
    );
    expect(mode).toBe("commenting");

    // 3. User clicks on canvas at screen coordinate (500, 300) with viewport (zoom=1.5, pan=(50, 60))
    const viewport: CanvasTransform = {
      zoom: 1.5,
      pan: { x: 50, y: 60 },
    };
    const screenPointer = { x: 500, y: 300 };
    const worldPoint = screenToWorld(screenPointer, viewport);

    expect(worldPoint.x).toBeCloseTo(300, 2);
    expect(worldPoint.y).toBeCloseTo(160, 2);

    // 4. Draft position is anchored in world coordinates
    useCommentStore.getState().setDraftPosition(worldPoint);
    expect(useCommentStore.getState().draftPosition).toEqual(worldPoint);

    // 5. User submits comment -> Persisted comment entity created with world-coordinate anchor
    const authoritativeComment: Comment = {
      id: "comment-anchor-1",
      boardId: "board-1",
      canvasId: "canvas-1",
      shapeId: null,
      authorId: "user-author",
      author: {
        id: "user-author",
        fullName: "Alex Whiteboarder",
      },
      parentCommentId: null,
      position: worldPoint,
      content: "Let's align this diagram with the backend architecture.",
      isResolved: false,
      isEdited: false,
      isDeleted: false,
      createdAt: "2026-09-08T12:00:00.000Z",
      updatedAt: "2026-09-08T12:00:00.000Z",
    };

    useCommentStore.getState().addComment(authoritativeComment);
    useCommentStore.getState().clearDraftPosition();
    useCommentStore.getState().setActiveThreadId(authoritativeComment.id);
    useCommentStore.getState().togglePanel(true);
    useCanvasStore.getState().setActiveTool(CANVAS_TOOLS.SELECT);

    // 6. Verify comment store state
    expect(useCommentStore.getState().comments["comment-anchor-1"]).toBeDefined();
    expect(useCommentStore.getState().comments["comment-anchor-1"].position).toEqual(worldPoint);
    expect(useCommentStore.getState().activeThreadId).toBe("comment-anchor-1");
    expect(useCommentStore.getState().isPanelOpen).toBe(true);
    expect(useCommentStore.getState().draftPosition).toBeNull();
    expect(useCanvasStore.getState().activeTool).toBe("select");

    // 7. Verify marker screen rendering under initial viewport
    const renderedScreenPos1 = worldToScreen(authoritativeComment.position!, viewport);
    expect(renderedScreenPos1.x).toBeCloseTo(screenPointer.x, 2);
    expect(renderedScreenPos1.y).toBeCloseTo(screenPointer.y, 2);

    // 8. Viewport Pans: pan shifts by (100, -50)
    const pannedViewport: CanvasTransform = {
      zoom: 1.5,
      pan: { x: 150, y: 10 },
    };
    const renderedScreenPosPanned = worldToScreen(authoritativeComment.position!, pannedViewport);
    expect(renderedScreenPosPanned.x).toBeCloseTo(600, 2);
    expect(renderedScreenPosPanned.y).toBeCloseTo(250, 2);

    // Persistent world coordinate anchor is unchanged
    expect(useCommentStore.getState().comments["comment-anchor-1"].position).toEqual(worldPoint);

    // 9. Viewport Zooms: zoom changes to 2.0
    const zoomedViewport: CanvasTransform = {
      zoom: 2.0,
      pan: { x: 0, y: 0 },
    };
    const renderedScreenPosZoomed = worldToScreen(authoritativeComment.position!, zoomedViewport);
    expect(renderedScreenPosZoomed.x).toBeCloseTo(600, 2);
    expect(renderedScreenPosZoomed.y).toBeCloseTo(320, 2);

    // Persistent world coordinate anchor remains completely invariant
    expect(useCommentStore.getState().comments["comment-anchor-1"].position).toEqual(worldPoint);

    // 10. Marker click selects comment thread without modifying canvas shape selection
    useCanvasStore.getState().setSelectedShapeIds(["shape-1"]);
    expect(useCanvasStore.getState().selectedShapeIds).toEqual(["shape-1"]);

    // Marker clicked for comment-anchor-1
    useCommentStore.getState().setActiveThreadId("comment-anchor-1");

    // Shape selection remains completely untouched
    expect(useCanvasStore.getState().selectedShapeIds).toEqual(["shape-1"]);
    expect(useCommentStore.getState().activeThreadId).toBe("comment-anchor-1");
  });

  it("handles Escape cancellation of draft comment without resetting canvas selection", () => {
    useCanvasStore.getState().setSelectedShapeIds(["shape-100"]);
    useCommentStore.getState().setDraftPosition({ x: 50, y: 50 });

    const escapeAction = interactionController.evaluateEscape({
      hasActiveCommentDraft: Boolean(useCommentStore.getState().draftPosition),
      selectedCount: useCanvasStore.getState().selectedShapeIds.length,
      activeTool: CANVAS_TOOLS.COMMENT,
    });

    expect(escapeAction).toBe("cancel_comment");

    // Execute cancel action
    useCommentStore.getState().clearDraftPosition();
    expect(useCommentStore.getState().draftPosition).toBeNull();
    // Shape selection preserved
    expect(useCanvasStore.getState().selectedShapeIds).toEqual(["shape-100"]);
  });

  it("ensures comment tool takes precedence over shape click without selecting shape", () => {
    // Clicking on top of a shape while COMMENT tool is active
    const mode = interactionController.determineInteractionOwner(
      {
        button: 0,
        isSpacePressed: false,
        isMiddleMouse: false,
        isEmptyCanvas: false, // clicked over shape
        isTransformerHandle: false,
      },
      CANVAS_TOOLS.COMMENT,
      true,
    );

    expect(mode).toBe("commenting");
  });
});
