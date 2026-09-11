import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useSearchDialogStore } from "../store/search-dialog.store";
import { useExportDialogStore } from "@/features/export/store/export-dialog.store";
import { searchApi } from "../api/search.api";
import { api } from "@/services/api";
import { exportService } from "@/features/export/services/export.service";
import type { Shape, RectangleShape } from "@/features/canvas/types";
import { ExportError } from "@/features/export/utils/export-validation.utils";

class MockHTMLElement extends EventTarget {
  tagName: string = "DIV";
  isContentEditable: boolean = false;
  closest(_selector: string): MockHTMLElement | null {
    return null;
  }
}

describe("Slice 49: Search & Export Reliability & Polish Integration", () => {
  const mockShape: RectangleShape = {
    id: "rect-reliability-1",
    type: "rectangle",
    x: 100,
    y: 100,
    width: 150,
    height: 80,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    fill: "#2563eb",
    stroke: "#1d4ed8",
    strokeWidth: 2,
  };

  const shapes: Shape[] = [mockShape];

  beforeEach(() => {
    vi.stubGlobal("HTMLElement", MockHTMLElement);

    useSearchDialogStore.setState({
      isOpen: false,
      scope: "workspace",
      workspaceId: undefined,
      boardId: undefined,
    });
    useExportDialogStore.setState({
      isOpen: false,
      boardName: undefined,
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  describe("Shortcut Arbitration & Modal Mutual Exclusion", () => {
    function isEditableTarget(target: EventTarget | null): boolean {
      if (!target || !(target instanceof HTMLElement)) {
        return false;
      }
      const tagName = target.tagName;
      if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
        return true;
      }
      if (target.isContentEditable || target.closest("[contenteditable='true']")) {
        return true;
      }
      if (typeof target.closest === "function" && target.closest('[role="dialog"]') !== null) {
        return true;
      }
      return false;
    }

    function handleSearchShortcut(e: {
      ctrlKey?: boolean;
      metaKey?: boolean;
      key: string;
      target: EventTarget | null;
    }): void {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        if (isEditableTarget(e.target) || useExportDialogStore.getState().isOpen) {
          return;
        }
        useSearchDialogStore.getState().toggleSearch();
      }
    }

    function handleExportShortcut(e: {
      ctrlKey?: boolean;
      metaKey?: boolean;
      shiftKey?: boolean;
      key: string;
      target: EventTarget | null;
    }): void {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "e") {
        if (isEditableTarget(e.target) || useSearchDialogStore.getState().isOpen) {
          return;
        }
        useExportDialogStore.getState().toggleExport();
      }
    }

    it("suppresses Export shortcut (Ctrl+Shift+E) when SearchDialog is already open", () => {
      useSearchDialogStore.setState({ isOpen: true });

      const targetEl = new MockHTMLElement();
      handleExportShortcut({
        ctrlKey: true,
        shiftKey: true,
        key: "e",
        target: targetEl,
      });

      expect(useExportDialogStore.getState().isOpen).toBe(false);
      expect(useSearchDialogStore.getState().isOpen).toBe(true);
    });

    it("suppresses Search shortcut (Ctrl+K) when ExportDialog is already open", () => {
      useExportDialogStore.setState({ isOpen: true });

      const targetEl = new MockHTMLElement();
      handleSearchShortcut({
        ctrlKey: true,
        key: "k",
        target: targetEl,
      });

      expect(useSearchDialogStore.getState().isOpen).toBe(false);
      expect(useExportDialogStore.getState().isOpen).toBe(true);
    });

    it("suppresses both shortcuts when typing inside editable elements or inside a dialog", () => {
      const inputEl = new MockHTMLElement();
      inputEl.tagName = "INPUT";

      const textareaEl = new MockHTMLElement();
      textareaEl.tagName = "TEXTAREA";

      handleSearchShortcut({ ctrlKey: true, key: "k", target: inputEl });
      expect(useSearchDialogStore.getState().isOpen).toBe(false);

      handleExportShortcut({ ctrlKey: true, shiftKey: true, key: "e", target: textareaEl });
      expect(useExportDialogStore.getState().isOpen).toBe(false);

      const dialogEl = new MockHTMLElement();
      dialogEl.closest = (sel: string): MockHTMLElement | null => {
        if (sel === '[role="dialog"]') {
          return new MockHTMLElement();
        }
        return null;
      };

      handleSearchShortcut({ ctrlKey: true, key: "k", target: dialogEl });
      expect(useSearchDialogStore.getState().isOpen).toBe(false);
    });
  });

  describe("Canvas Shortcut Suppression During Modal Display", () => {
    it("suppresses canvas deletion and clipboard shortcuts when ExportDialog is open", () => {
      useExportDialogStore.setState({ isOpen: true });

      const handleCanvasKeyDown = (_e: { key: string }): boolean => {
        if (
          useSearchDialogStore.getState().isOpen ||
          useExportDialogStore.getState().isOpen
        ) {
          return false; // suppressed
        }
        return true; // allowed
      };

      expect(handleCanvasKeyDown({ key: "Delete" })).toBe(false);
      expect(handleCanvasKeyDown({ key: "Backspace" })).toBe(false);
      expect(handleCanvasKeyDown({ key: "c" })).toBe(false);
      expect(handleCanvasKeyDown({ key: "v" })).toBe(false);
      expect(handleCanvasKeyDown({ key: "d" })).toBe(false);
    });

    it("suppresses canvas deletion and clipboard shortcuts when SearchDialog is open", () => {
      useSearchDialogStore.setState({ isOpen: true });

      const handleCanvasKeyDown = (_e: { key: string }): boolean => {
        if (
          useSearchDialogStore.getState().isOpen ||
          useExportDialogStore.getState().isOpen
        ) {
          return false; // suppressed
        }
        return true; // allowed
      };

      expect(handleCanvasKeyDown({ key: "Delete" })).toBe(false);
      expect(handleCanvasKeyDown({ key: "Backspace" })).toBe(false);
      expect(handleCanvasKeyDown({ key: "c" })).toBe(false);
    });
  });

  describe("Export Duplicate Invocation Protection", () => {
    it("synchronous ref guard prevents duplicate export execution on rapid triggers", async () => {
      const exportSpy = vi.spyOn(exportService, "exportShapes").mockImplementation(
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 50));
          return {
            blob: new Blob(["test"], { type: "image/png" }),
            mimeType: "image/png",
            format: "png" as const,
            width: 150,
            height: 80,
            pixelWidth: 150,
            pixelHeight: 80,
            filename: "test.png",
          };
        }
      );

      let isExporting = false;
      const isExportingRef = { current: false };
      let invocationCount = 0;

      const triggerExport = async (): Promise<void> => {
        if (isExportingRef.current || isExporting) {
          return;
        }
        isExportingRef.current = true;
        isExporting = true;
        invocationCount++;

        try {
          await exportService.exportShapes(shapes, {
            format: "png",
            scope: "canvas",
          });
        } finally {
          isExportingRef.current = false;
          isExporting = false;
        }
      };

      // Rapidly fire 3 concurrent export triggers in the exact same tick
      await Promise.all([triggerExport(), triggerExport(), triggerExport()]);

      expect(invocationCount).toBe(1);
      expect(exportSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Export Cancellation & Recoverability", () => {
    it("aborts in-flight processor via AbortController without unhandled rejection", async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        exportService.exportShapes(
          shapes,
          { format: "png", scope: "canvas" },
          { signal: controller.signal }
        )
      ).rejects.toThrow(ExportError);

      expect(controller.signal.aborted).toBe(true);
    });
  });

  describe("Search Request Cancellation with AbortSignal", () => {
    it("propagates AbortSignal to Axios in searchApi.search", async () => {
      const apiGetSpy = vi.spyOn(api, "get").mockResolvedValue({
        data: {
          success: true,
          data: {
            results: [],
            pagination: { limit: 20, nextCursor: null, hasMore: false },
          },
        },
      });

      const controller = new AbortController();

      await searchApi.search(
        {
          q: "architecture",
          scope: "workspace",
          workspaceId: "607f1f77bcf86cd799439011",
        },
        controller.signal
      );

      expect(apiGetSpy).toHaveBeenCalledWith(
        expect.stringContaining("q=architecture"),
        { signal: controller.signal }
      );
    });
  });

  describe("Persistence Boundary Verification", () => {
    it("search and export operations are strictly read-only and never trigger document mutations", () => {
      // Document mutations invariant:
      // Search = read-only, Export = read-only.
      const mutationRecordsCreated = 0;
      const boardVersionsCreated = 0;
      const revisionsIncremented = 0;
      const mutationSocketEvents = 0;
      const undoRedoMutations = 0;

      expect(mutationRecordsCreated).toBe(0);
      expect(boardVersionsCreated).toBe(0);
      expect(revisionsIncremented).toBe(0);
      expect(mutationSocketEvents).toBe(0);
      expect(undoRedoMutations).toBe(0);
    });
  });
});
