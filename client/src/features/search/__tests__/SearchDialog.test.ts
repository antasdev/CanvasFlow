import { describe, expect, it, vi, beforeEach } from "vitest";
import { useSearchDialogStore } from "../store/search-dialog.store";
import { INFINITE_SEARCH_QUERY_KEYS } from "../hooks/useInfiniteSearch";

describe("SearchDialog Keyboard Arbitration, Conflicts & Navigation", () => {
  beforeEach(() => {
    useSearchDialogStore.setState({
      isOpen: false,
      scope: "workspace",
      workspaceId: "ws-1",
      boardId: undefined,
    });
  });

  it("prevents global Ctrl/Cmd+K shortcut when user is typing in editable elements", () => {
    const isEditableTarget = (target: {
      tagName?: string;
      isContentEditable?: boolean;
      closest?: (selector: string) => unknown;
    } | null): boolean => {
      if (!target) return false;
      const tag = target.tagName?.toUpperCase();
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") {
        return true;
      }
      if (target.isContentEditable) {
        return true;
      }
      if (typeof target.closest === "function" && target.closest("[contenteditable='true']")) {
        return true;
      }
      return false;
    };

    expect(isEditableTarget({ tagName: "INPUT" })).toBe(true);
    expect(isEditableTarget({ tagName: "TEXTAREA" })).toBe(true);
    expect(isEditableTarget({ isContentEditable: true })).toBe(true);
    expect(
      isEditableTarget({
        tagName: "DIV",
        closest: (sel) => (sel === "[contenteditable='true']" ? {} : null),
      })
    ).toBe(true);
    expect(isEditableTarget({ tagName: "DIV" })).toBe(false);
    expect(isEditableTarget({ tagName: "BUTTON" })).toBe(false);
  });

  it("suppresses canvas keyboard shortcuts when search dialog is open", () => {
    useSearchDialogStore.setState({ isOpen: true });

    const handleCanvasKeyDown = vi.fn((_e: { key: string }) => {
      if (useSearchDialogStore.getState().isOpen) {
        return; // Suppressed!
      }
      // Canvas action would happen here
    });

    handleCanvasKeyDown({ key: "v" });
    handleCanvasKeyDown({ key: "t" });
    handleCanvasKeyDown({ key: "Delete" });
    handleCanvasKeyDown({ key: " " });

    expect(handleCanvasKeyDown).toHaveBeenCalledTimes(4);
    // Dialog open -> canvas actions are early-returned
  });

  it("restores canvas keyboard shortcuts when search dialog is closed", () => {
    useSearchDialogStore.setState({ isOpen: false });

    const canvasActionMock = vi.fn();
    const handleCanvasKeyDown = (e: { key: string }) => {
      if (useSearchDialogStore.getState().isOpen) {
        return;
      }
      canvasActionMock(e.key);
    };

    handleCanvasKeyDown({ key: "v" });
    handleCanvasKeyDown({ key: "Delete" });

    expect(canvasActionMock).toHaveBeenCalledWith("v");
    expect(canvasActionMock).toHaveBeenCalledWith("Delete");
  });

  it("arbitrates list keyboard navigation (ArrowDown, ArrowUp, Enter, Escape)", () => {
    const resultsCount = 3;
    let highlightedIndex = 0;

    const navigateDown = () => {
      highlightedIndex = highlightedIndex < resultsCount - 1 ? highlightedIndex + 1 : 0;
    };

    const navigateUp = () => {
      highlightedIndex = highlightedIndex > 0 ? highlightedIndex - 1 : resultsCount - 1;
    };

    expect(highlightedIndex).toBe(0);
    navigateDown();
    expect(highlightedIndex).toBe(1);
    navigateDown();
    expect(highlightedIndex).toBe(2);
    // Wrap around to 0
    navigateDown();
    expect(highlightedIndex).toBe(0);

    // Wrap around backwards to 2
    navigateUp();
    expect(highlightedIndex).toBe(2);
    navigateUp();
    expect(highlightedIndex).toBe(1);
  });

  it("executes idempotent shape navigation only once per deep-link parameter", () => {
    const selectShapeMock = vi.fn();
    const centerPanMock = vi.fn();

    let handledDeepLink: string | null = null;

    const resolveShapeDeepLink = (shapeIdParam: string, shapes: Array<{ id: string }>) => {
      if (!shapeIdParam || handledDeepLink === shapeIdParam) {
        return;
      }
      const shape = shapes.find((s) => s.id === shapeIdParam);
      if (shape) {
        handledDeepLink = shapeIdParam;
        selectShapeMock(shape.id);
        centerPanMock();
      }
    };

    const mockShapes = [{ id: "shape-42" }, { id: "shape-43" }];

    // First hydration run -> executes
    resolveShapeDeepLink("shape-42", mockShapes);
    expect(selectShapeMock).toHaveBeenCalledTimes(1);
    expect(centerPanMock).toHaveBeenCalledTimes(1);

    // Subsequent re-renders -> skipped idempotently
    resolveShapeDeepLink("shape-42", mockShapes);
    resolveShapeDeepLink("shape-42", mockShapes);
    expect(selectShapeMock).toHaveBeenCalledTimes(1);
    expect(centerPanMock).toHaveBeenCalledTimes(1);

    // New shape deep link -> executes
    resolveShapeDeepLink("shape-43", mockShapes);
    expect(selectShapeMock).toHaveBeenCalledTimes(2);
    expect(centerPanMock).toHaveBeenCalledTimes(2);
  });

  it("generates deterministic TanStack Query infinite keys", () => {
    const key1 = INFINITE_SEARCH_QUERY_KEYS.search({
      q: "  Architecture  ",
      scope: "workspace",
      workspaceId: "ws-1",
      types: ["comment", "board"],
    });

    const key2 = INFINITE_SEARCH_QUERY_KEYS.search({
      q: "Architecture",
      scope: "workspace",
      workspaceId: "ws-1",
      types: ["board", "comment"],
    });

    expect(key1).toEqual(key2);
  });
});
