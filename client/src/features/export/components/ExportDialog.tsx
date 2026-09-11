import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import {
  X,
  Download,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Layers,
  FileImage,
  Palette,
  Maximize2,
  Sliders,
} from "lucide-react";
import { toast } from "sonner";

import { useCanvasStore } from "@/features/canvas/store";
import { useSearchDialogStore } from "@/features/search/store/search-dialog.store";
import type {
  ExportFormat,
  ExportScope,
  ExportBackground,
  ExportOptions,
} from "../types/export.types";
import {
  DEFAULT_EXPORT_SCALE,
  DEFAULT_EXPORT_QUALITY,
  DEFAULT_CANVAS_BACKGROUND_COLOR,
} from "../constants/export.constants";
import { exportService } from "../services/export.service";
import { sanitizeFilename, triggerBlobDownload } from "../utils/download.utils";
import { useExportDialog } from "../hooks/useExportDialog";
import { ExportError } from "../utils/export-validation.utils";

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

export function ExportDialog(): React.JSX.Element | null {
  const { isOpen, boardName, closeExport, toggleExport } = useExportDialog();

  const shapes = useCanvasStore((state) => state.shapes);
  const selectedShapeIds = useCanvasStore((state) => state.selectedShapeIds);
  const zoom = useCanvasStore((state) => state.zoom);
  const pan = useCanvasStore((state) => state.pan);

  // Form configuration state
  const [format, setFormat] = useState<ExportFormat>("png");
  const [scope, setScope] = useState<ExportScope>("canvas");
  const [background, setBackground] = useState<ExportBackground>("canvas");
  const [customBgColor, setCustomBgColor] = useState<string>(DEFAULT_CANVAS_BACKGROUND_COLOR);
  const [scale, setScale] = useState<number>(DEFAULT_EXPORT_SCALE);
  const [quality, setQuality] = useState<number>(DEFAULT_EXPORT_QUALITY);
  const [filenameInput, setFilenameInput] = useState<string>("");

  // Execution state
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const isExportingRef = useRef<boolean>(false);
  const prevIsOpenRef = useRef<boolean>(false);
  const triggerRef = useRef<HTMLElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const filenameInputRef = useRef<HTMLInputElement>(null);

  // Determine whether current canvas has an exportable selection
  const hasSelection = useMemo(() => {
    if (!selectedShapeIds || selectedShapeIds.length === 0) return false;
    const selectedSet = new Set(selectedShapeIds);
    return shapes.some((s) => selectedSet.has(s.id));
  }, [shapes, selectedShapeIds]);

  // Global Ctrl/Cmd + Shift + E shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "e") {
        if (isEditableTarget(e.target) || useSearchDialogStore.getState().isOpen) {
          return;
        }
        e.preventDefault();
        if (!isOpen && document.activeElement instanceof HTMLElement) {
          triggerRef.current = document.activeElement;
        }
        toggleExport();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, toggleExport]);

  // Reset form defaults only on transition from closed to open
  useEffect(() => {
    if (isOpen) {
      if (!prevIsOpenRef.current) {
        setFormat("png");
        setScope(hasSelection ? "selection" : "canvas");
        setBackground("canvas");
        setCustomBgColor(DEFAULT_CANVAS_BACKGROUND_COLOR);
        setScale(DEFAULT_EXPORT_SCALE);
        setQuality(DEFAULT_EXPORT_QUALITY);
        setErrorMessage(null);
        setIsExporting(false);
        isExportingRef.current = false;

        const baseName = boardName?.trim() || "canvasflow-export";
        setFilenameInput(baseName);

        // Focus filename input on open
        setTimeout(() => {
          filenameInputRef.current?.focus();
          filenameInputRef.current?.select();
        }, 50);
      }
    } else {
      // Abort any ongoing export if dialog closes
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      isExportingRef.current = false;
      setIsExporting(false);
      // Restore focus to trigger element
      if (triggerRef.current) {
        triggerRef.current.focus();
        triggerRef.current = null;
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, boardName, hasSelection]);

  // If format changes to JPEG and background was transparent, adapt to canvas default
  useEffect(() => {
    if (format === "jpeg" && background === "transparent") {
      setBackground("canvas");
    }
  }, [format, background]);

  // If selection becomes unavailable while scope is "selection", revert to "canvas"
  useEffect(() => {
    if (scope === "selection" && !hasSelection) {
      setScope("canvas");
    }
  }, [scope, hasSelection]);

  // Cancel in-flight export or close dialog
  const handleCancel = useCallback((): void => {
    if (isExporting) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    } else {
      closeExport();
    }
  }, [isExporting, closeExport]);

  // Handle Escape key inside dialog
  const handleDialogKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>): void => {
      if (e.key === "Escape") {
        e.stopPropagation();
        handleCancel();
      }
    },
    [handleCancel]
  );

  // Execute export and trigger browser download
  const handleExport = async (): Promise<void> => {
    if (isExportingRef.current || isExporting) return;
    isExportingRef.current = true;
    setIsExporting(true);
    setErrorMessage(null);

    if (!shapes || shapes.length === 0) {
      setErrorMessage("Cannot export an empty canvas. Add shapes before exporting.");
      isExportingRef.current = false;
      setIsExporting(false);
      return;
    }

    if (scope === "selection" && !hasSelection) {
      setErrorMessage("No shapes selected. Select shapes or switch to Full Canvas scope.");
      isExportingRef.current = false;
      setIsExporting(false);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const finalFilename = sanitizeFilename(
      filenameInput.trim() || boardName || "canvasflow-export",
      format
    );

    const exportOptions: ExportOptions = {
      format,
      scope,
      scale,
      quality: format === "jpeg" ? quality : undefined,
      background,
      backgroundColor: background === "solid" ? customBgColor : undefined,
      selectedShapeIds: scope === "selection" ? selectedShapeIds : undefined,
      viewport:
        scope === "viewport"
          ? {
              zoom,
              pan,
              screenWidth: typeof window !== "undefined" ? window.innerWidth : 1920,
              screenHeight: typeof window !== "undefined" ? window.innerHeight : 1080,
            }
          : undefined,
    };

    try {
      const result = await exportService.exportShapes(shapes, exportOptions, {
        signal: controller.signal,
        customFilename: finalFilename,
      });

      if (!controller.signal.aborted) {
        triggerBlobDownload(result.blob, result.filename);
        toast.success(`Exported as ${result.filename}`);
        closeExport();
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) {
        toast.info("Export cancelled");
        return;
      }

      if (err instanceof ExportError) {
        setErrorMessage(err.message);
        toast.error(err.message);
      } else if (err instanceof Error) {
        setErrorMessage(err.message);
        toast.error(`Export failed: ${err.message}`);
      } else {
        setErrorMessage("An unexpected error occurred during export.");
        toast.error("Export failed. Please try a smaller scale or different format.");
      }
    } finally {
      isExportingRef.current = false;
      setIsExporting(false);
      abortControllerRef.current = null;
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-150"
      onClick={() => {
        if (!isExporting) closeExport();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
      onKeyDown={handleDialogKeyDown}
    >
      <div
        ref={dialogRef}
        className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 flex flex-col gap-5 text-slate-800 animate-in zoom-in-95 duration-150 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
              <Download className="h-5 w-5" />
            </div>
            <div>
              <h2
                id="export-dialog-title"
                className="text-base font-semibold text-slate-900"
              >
                Export Canvas
              </h2>
              <p className="text-xs text-slate-500">
                Save your whiteboard as an image or vector document
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Close export dialog"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Error Alert Box */}
        {errorMessage && (
          <div
            role="alert"
            className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700 animate-in fade-in duration-150"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
            <div className="flex-1">
              <span className="font-semibold">Export Error:</span> {errorMessage}
            </div>
          </div>
        )}

        {/* Form Body */}
        <div className="flex flex-col gap-4 text-xs max-h-[60vh] overflow-y-auto px-0.5">
          {/* 1. Format Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="font-medium text-slate-700 flex items-center gap-1.5">
              <FileImage className="h-3.5 w-3.5 text-slate-400" />
              Format
            </label>
            <div className="grid grid-cols-4 gap-2">
              {(
                [
                  { id: "png", label: "PNG", hint: "Raster / Alpha" },
                  { id: "jpeg", label: "JPEG", hint: "Compressed" },
                  { id: "svg", label: "SVG", hint: "Vector XML" },
                  { id: "pdf", label: "PDF", hint: "Document" },
                ] as const
              ).map((fmt) => (
                <button
                  key={fmt.id}
                  type="button"
                  onClick={() => setFormat(fmt.id)}
                  disabled={isExporting}
                  className={`
                    flex flex-col items-center justify-center rounded-xl border p-2.5 text-center transition-all
                    ${
                      format === fmt.id
                        ? "border-blue-500 bg-blue-50/70 text-blue-700 font-semibold ring-1 ring-blue-500"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600"
                    }
                  `}
                >
                  <span className="text-sm">{fmt.label}</span>
                  <span className="text-[10px] text-slate-400 font-normal">
                    {fmt.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Scope Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="font-medium text-slate-700 flex items-center gap-1.5">
              <Layers className="h-3.5 w-3.5 text-slate-400" />
              Export Scope
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setScope("canvas")}
                disabled={isExporting}
                className={`
                  flex flex-col items-start rounded-xl border p-2.5 transition-all text-left
                  ${
                    scope === "canvas"
                      ? "border-blue-500 bg-blue-50/70 text-blue-700 font-medium ring-1 ring-blue-500"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600"
                  }
                `}
              >
                <span className="font-semibold">Full Canvas</span>
                <span className="text-[10px] text-slate-400">All {shapes.length} shapes</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (hasSelection) setScope("selection");
                }}
                disabled={isExporting || !hasSelection}
                title={!hasSelection ? "No shapes currently selected" : undefined}
                className={`
                  flex flex-col items-start rounded-xl border p-2.5 transition-all text-left
                  ${
                    scope === "selection"
                      ? "border-blue-500 bg-blue-50/70 text-blue-700 font-medium ring-1 ring-blue-500"
                      : hasSelection
                      ? "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600"
                      : "border-slate-100 bg-slate-50/50 text-slate-300 cursor-not-allowed opacity-60"
                  }
                `}
              >
                <span className="font-semibold">Selection</span>
                <span className="text-[10px]">
                  {hasSelection
                    ? `${selectedShapeIds.length} selected`
                    : "None selected"}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setScope("viewport")}
                disabled={isExporting}
                className={`
                  flex flex-col items-start rounded-xl border p-2.5 transition-all text-left
                  ${
                    scope === "viewport"
                      ? "border-blue-500 bg-blue-50/70 text-blue-700 font-medium ring-1 ring-blue-500"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600"
                  }
                `}
              >
                <span className="font-semibold">Current View</span>
                <span className="text-[10px] text-slate-400">Visible screen</span>
              </button>
            </div>
          </div>

          {/* 3. Background Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="font-medium text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Palette className="h-3.5 w-3.5 text-slate-400" />
                Background
              </span>
              {format === "jpeg" && (
                <span className="text-[10px] text-amber-600 font-normal">
                  JPEG defaults to white (no alpha)
                </span>
              )}
            </label>
            <div className="grid grid-cols-3 gap-2">
              {format !== "jpeg" && (
                <button
                  type="button"
                  onClick={() => setBackground("transparent")}
                  disabled={isExporting}
                  className={`
                    flex items-center justify-center gap-1.5 rounded-lg border p-2 transition-all
                    ${
                      background === "transparent"
                        ? "border-blue-500 bg-blue-50 text-blue-700 font-medium ring-1 ring-blue-500"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600"
                    }
                  `}
                >
                  <span className="h-3 w-3 rounded-full border border-slate-300 bg-white" />
                  <span>Transparent</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setBackground("canvas")}
                disabled={isExporting}
                className={`
                  flex items-center justify-center gap-1.5 rounded-lg border p-2 transition-all
                  ${
                    background === "canvas"
                      ? "border-blue-500 bg-blue-50 text-blue-700 font-medium ring-1 ring-blue-500"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600"
                  }
                `}
              >
                <span className="h-3 w-3 rounded-full border border-slate-300 bg-white" />
                <span>Canvas Default</span>
              </button>

              <button
                type="button"
                onClick={() => setBackground("solid")}
                disabled={isExporting}
                className={`
                  flex items-center justify-center gap-1.5 rounded-lg border p-2 transition-all
                  ${
                    background === "solid"
                      ? "border-blue-500 bg-blue-50 text-blue-700 font-medium ring-1 ring-blue-500"
                      : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600"
                  }
                `}
              >
                <span
                  className="h-3 w-3 rounded-full border border-slate-300"
                  style={{ backgroundColor: customBgColor }}
                />
                <span>Custom Color</span>
              </button>
            </div>

            {background === "solid" && (
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="color"
                  value={customBgColor}
                  onChange={(e) => setCustomBgColor(e.target.value)}
                  disabled={isExporting}
                  className="h-7 w-7 rounded border border-slate-200 cursor-pointer"
                  aria-label="Select custom background color"
                />
                <input
                  type="text"
                  value={customBgColor}
                  onChange={(e) => setCustomBgColor(e.target.value)}
                  disabled={isExporting}
                  placeholder="#ffffff"
                  className="w-24 rounded border border-slate-200 px-2 py-1 font-mono text-xs focus:border-blue-500 focus:outline-none"
                  aria-label="Hex color string"
                />
              </div>
            )}
          </div>

          {/* 4. Scale Selection (For raster & PDF) */}
          <div className="flex flex-col gap-1.5">
            <label className="font-medium text-slate-700 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Maximize2 className="h-3.5 w-3.5 text-slate-400" />
                Resolution / Scale
              </span>
              <span className="text-[10px] text-slate-400">
                {scale === 1
                  ? "Standard (1x)"
                  : scale === 2
                  ? "High resolution (2x)"
                  : scale === 3
                  ? "Ultra HD (3x)"
                  : "Compact (0.5x)"}
              </span>
            </label>
            <div className="grid grid-cols-4 gap-2">
              {[0.5, 1, 2, 3].map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScale(s)}
                  disabled={isExporting}
                  className={`
                    rounded-lg border py-1.5 text-center text-xs font-medium transition-all
                    ${
                      scale === s
                        ? "border-blue-500 bg-blue-50 text-blue-700 ring-1 ring-blue-500"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600"
                    }
                  `}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* 5. Quality Slider (JPEG only) */}
          {format === "jpeg" && (
            <div className="flex flex-col gap-1.5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between">
                <label
                  htmlFor="export-quality-slider"
                  className="font-medium text-slate-700 flex items-center gap-1.5"
                >
                  <Sliders className="h-3.5 w-3.5 text-slate-400" />
                  JPEG Quality
                </label>
                <span className="text-[11px] font-mono font-medium text-slate-600">
                  {Math.round(quality * 100)}%
                </span>
              </div>
              <input
                id="export-quality-slider"
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={quality}
                onChange={(e) => setQuality(parseFloat(e.target.value))}
                disabled={isExporting}
                className="h-1.5 w-full rounded-lg bg-slate-200 accent-blue-600 cursor-pointer"
              />
            </div>
          )}

          {/* 6. Filename */}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="export-filename-input"
              className="font-medium text-slate-700"
            >
              Filename
            </label>
            <div className="flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 focus-within:border-blue-500 focus-within:ring-1 focus-within:ring-blue-500">
              <input
                id="export-filename-input"
                ref={filenameInputRef}
                type="text"
                value={filenameInput}
                onChange={(e) => setFilenameInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleExport();
                  }
                }}
                disabled={isExporting}
                placeholder="canvasflow-export"
                className="w-full text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none"
              />
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-500 uppercase ml-2">
                .{format}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-2.5 border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={handleCancel}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleExport}
            disabled={isExporting}
            className={`
              flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-xs font-medium text-white shadow-xs
              hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/30 transition-all
              ${isExporting ? "opacity-80 cursor-wait" : ""}
            `}
          >
            {isExporting ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                <span>Exporting…</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Export {format.toUpperCase()}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
