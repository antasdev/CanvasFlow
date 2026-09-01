import { ZoomIn, ZoomOut, RotateCcw, HelpCircle } from "lucide-react";
import React from "react";

import { MIN_ZOOM, MAX_ZOOM } from "../constants";

export type CanvasZoomControlsProps = {
  zoom: number;
  formattedZoom: string;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onToggleHelp?: () => void;
  className?: string;
};

export default function CanvasZoomControls({
  zoom,
  formattedZoom,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onToggleHelp,
  className = "",
}: CanvasZoomControlsProps): React.JSX.Element {
  const isMinZoom = zoom <= MIN_ZOOM;
  const isMaxZoom = zoom >= MAX_ZOOM;

  return (
    <div
      className={`flex items-center gap-1 rounded-lg bg-white/95 backdrop-blur-sm p-1.5 shadow-md border border-gray-200 text-gray-700 select-none ${className}`}
      role="toolbar"
      aria-label="Canvas zoom controls"
    >
      <button
        type="button"
        onClick={onZoomOut}
        disabled={isMinZoom}
        title="Zoom Out (Ctrl + Scroll Down or Ctrl -)"
        aria-label="Zoom Out"
        className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <ZoomOut className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={onResetZoom}
        title="Reset Zoom to 100% (Ctrl 0)"
        aria-label={`Current Zoom: ${formattedZoom}. Click to reset to 100%.`}
        className="px-2 py-1 text-xs font-semibold rounded hover:bg-gray-100 transition-colors tabular-nums min-w-[48px] text-center focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        {formattedZoom}
      </button>

      <button
        type="button"
        onClick={onZoomIn}
        disabled={isMaxZoom}
        title="Zoom In (Ctrl + Scroll Up or Ctrl +)"
        aria-label="Zoom In"
        className="rounded p-1.5 hover:bg-gray-100 disabled:opacity-40 disabled:hover:bg-transparent transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <ZoomIn className="h-4 w-4" />
      </button>

      <div className="h-4 w-px bg-gray-200 mx-0.5" />

      <button
        type="button"
        onClick={onResetZoom}
        title="Reset View"
        aria-label="Reset View"
        className="rounded p-1.5 hover:bg-gray-100 transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500"
      >
        <RotateCcw className="h-3.5 w-3.5 text-gray-500" />
      </button>

      {onToggleHelp && (
        <>
          <div className="h-4 w-px bg-gray-200 mx-0.5" />
          <button
            type="button"
            onClick={onToggleHelp}
            title="Keyboard Shortcuts (?)"
            aria-label="Keyboard Shortcuts"
            className="rounded p-1.5 hover:bg-gray-100 text-gray-500 hover:text-gray-900 transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <HelpCircle className="h-3.5 w-3.5" />
          </button>
        </>
      )}
    </div>
  );
}
