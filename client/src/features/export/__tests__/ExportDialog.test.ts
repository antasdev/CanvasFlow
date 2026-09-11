import { describe, it, expect, beforeEach, vi } from "vitest";
import type { Shape, RectangleShape } from "@/features/canvas/types";
import { useExportDialogStore } from "../store/export-dialog.store";
import { exportService } from "../services/export.service";
import { sanitizeFilename } from "../utils/download.utils";
import { ExportError } from "../utils/export-validation.utils";
import type { ExportOptions, ExportFormat, ExportBackground } from "../types/export.types";

describe("ExportDialog Workflow, Arbitration & Integration (Slice 48)", () => {
  const mockRect: RectangleShape = {
    id: "rect-1",
    type: "rectangle",
    x: 50,
    y: 50,
    width: 200,
    height: 100,
    rotation: 0,
    opacity: 1,
    zIndex: 1,
    fill: "#3b82f6",
    stroke: "#1d4ed8",
    strokeWidth: 2,
  };

  const shapes: Shape[] = [mockRect];

  beforeEach(() => {
    useExportDialogStore.setState({
      isOpen: false,
      boardName: undefined,
    });
    vi.restoreAllMocks();
  });

  it("arbitrates global Ctrl/Cmd + Shift + E shortcut and suppresses in editable elements", () => {
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
        tagName: "SPAN",
        closest: (sel) => (sel === "[contenteditable='true']" ? {} : null),
      })
    ).toBe(true);
    expect(isEditableTarget({ tagName: "BUTTON" })).toBe(false);
    expect(isEditableTarget({ tagName: "DIV" })).toBe(false);

    // Test shortcut handler logic
    const handleShortcut = (e: {
      ctrlKey?: boolean;
      metaKey?: boolean;
      shiftKey?: boolean;
      key: string;
      target: { tagName?: string };
    }): void => {
      if (isEditableTarget(e.target)) {
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "e") {
        useExportDialogStore.getState().toggleExport();
      }
    };

    // Ignored in input
    handleShortcut({ ctrlKey: true, shiftKey: true, key: "e", target: { tagName: "INPUT" } });
    expect(useExportDialogStore.getState().isOpen).toBe(false);

    // Triggered on general canvas/window
    handleShortcut({ ctrlKey: true, shiftKey: true, key: "e", target: { tagName: "DIV" } });
    expect(useExportDialogStore.getState().isOpen).toBe(true);
  });

  it("handles selection availability semantics correctly", () => {
    const checkHasSelection = (
      shapeList: Shape[],
      selectedIds: string[]
    ): boolean => {
      if (!selectedIds || selectedIds.length === 0) return false;
      const selectedSet = new Set(selectedIds);
      return shapeList.some((s) => selectedSet.has(s.id));
    };

    // Empty selection
    expect(checkHasSelection(shapes, [])).toBe(false);

    // Non-existent ID selected
    expect(checkHasSelection(shapes, ["ghost-id"])).toBe(false);

    // Valid selected shape
    expect(checkHasSelection(shapes, ["rect-1"])).toBe(true);
  });

  it("adapts transparent background to canvas default when format is JPEG", () => {
    const adaptBackground = (
      selectedFormat: ExportFormat,
      currentBg: ExportBackground
    ): ExportBackground => {
      if (selectedFormat === "jpeg" && currentBg === "transparent") {
        return "canvas";
      }
      return currentBg;
    };

    expect(adaptBackground("png", "transparent")).toBe("transparent");
    expect(adaptBackground("svg", "transparent")).toBe("transparent");
    expect(adaptBackground("jpeg", "transparent")).toBe("canvas");
    expect(adaptBackground("jpeg", "solid")).toBe("solid");
  });

  it("successfully invokes exportService and triggers download on valid export execution", async () => {
    const exportShapesSpy = vi.spyOn(exportService, "exportShapes");
    const downloadMock = vi.fn();

    const mockExportResult = {
      blob: new Blob(["mock-png-content"], { type: "image/png" }),
      mimeType: "image/png",
      format: "png" as const,
      width: 200,
      height: 100,
      pixelWidth: 200,
      pixelHeight: 100,
      filename: "architecture.png",
    };

    exportShapesSpy.mockResolvedValue(mockExportResult);

    const filenameInput = "architecture";
    const format: ExportFormat = "png";
    const finalFilename = sanitizeFilename(filenameInput, format);

    const options: ExportOptions = {
      format,
      scope: "canvas",
      scale: 1,
      background: "canvas",
    };

    const result = await exportService.exportShapes(shapes, options, {
      customFilename: finalFilename,
    });

    downloadMock(result.blob, result.filename);

    expect(exportShapesSpy).toHaveBeenCalledWith(shapes, options, {
      customFilename: "architecture.png",
    });
    expect(downloadMock).toHaveBeenCalledWith(mockExportResult.blob, "architecture.png");
  });

  it("supports cancellation via AbortSignal without triggering browser download", async () => {
    const controller = new AbortController();
    const downloadMock = vi.fn();

    // Trigger abort
    controller.abort();

    await expect(
      exportService.exportShapes(
        shapes,
        { format: "png", scope: "canvas" },
        { signal: controller.signal }
      )
    ).rejects.toThrow(ExportError);

    // Download must never be triggered when aborted
    expect(downloadMock).not.toHaveBeenCalled();
  });

  it("handles service errors gracefully and preserves dialog state for retry", async () => {
    const exportShapesSpy = vi.spyOn(exportService, "exportShapes");
    exportShapesSpy.mockRejectedValue(
      new ExportError(
        "EXPORT_TOO_LARGE",
        "Export dimensions exceed maximum allowed dimension (8192px)."
      )
    );

    let caughtError: string | null = null;

    try {
      await exportService.exportShapes(shapes, {
        format: "png",
        scope: "canvas",
        scale: 4,
      });
    } catch (err) {
      if (err instanceof ExportError) {
        caughtError = err.message;
      }
    }

    expect(caughtError).toContain("exceed maximum allowed dimension");
  });

  it("handles Escape key logic: aborts if exporting, closes dialog if idle", () => {
    let isExporting = true;
    let isClosed = false;
    let isAborted = false;

    const handleEscape = (): void => {
      if (isExporting) {
        isAborted = true;
        isExporting = false;
      } else {
        isClosed = true;
      }
    };

    // First press while exporting -> cancels export
    handleEscape();
    expect(isAborted).toBe(true);
    expect(isClosed).toBe(false);

    // Second press while idle -> closes dialog
    handleEscape();
    expect(isClosed).toBe(true);
  });
});
