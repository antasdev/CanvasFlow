import React, { useMemo } from "react";
import { MessageSquare, Eye, Minus, ArrowRight, GitCommit, Circle, Triangle, Hexagon, Star, Lasso } from "lucide-react";

import { CANVAS_TOOLS } from "../constants";
import { useCanvasStore } from "../store";
import { useCommentStore } from "@/features/comments";

type CanvasToolbarProps = {
  canEditCanvas?: boolean;
};

export default function CanvasToolbar({
  canEditCanvas = true,
}: CanvasToolbarProps): React.JSX.Element {
  const activeTool = useCanvasStore((state) => state.activeTool);
  const setActiveTool = useCanvasStore((state) => state.setActiveTool);

  const isPanelOpen = useCommentStore((state) => state.isPanelOpen);
  const togglePanel = useCommentStore((state) => state.togglePanel);
  const comments = useCommentStore((state) => state.comments);

  const openCommentsCount = useMemo(() => {
    return Object.values(comments).filter(
      (c) => !c.parentCommentId && !c.isResolved && !c.isDeleted
    ).length;
  }, [comments]);

  return (
    <div className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-lg bg-white p-2 shadow-md border border-gray-200">
      {!canEditCanvas && (
        <div className="flex items-center gap-1.5 rounded bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-700 border border-amber-200 mr-1">
          <Eye className="h-3.5 w-3.5" />
          <span>View Only</span>
        </div>
      )}

      <button
        type="button"
        onClick={() => setActiveTool(CANVAS_TOOLS.SELECT)}
        className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
          activeTool === CANVAS_TOOLS.SELECT
            ? "bg-gray-900 text-white shadow-sm"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        Select
      </button>

      <button
        type="button"
        onClick={() => setActiveTool(CANVAS_TOOLS.LASSO)}
        className={`inline-flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition-colors ${
          activeTool === CANVAS_TOOLS.LASSO
            ? "bg-gray-900 text-white shadow-sm"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        <Lasso className="h-3.5 w-3.5" />
        <span>Lasso</span>
      </button>

      {canEditCanvas && (
        <>
          <button
            type="button"
            onClick={() => setActiveTool(CANVAS_TOOLS.RECTANGLE)}
            className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
              activeTool === CANVAS_TOOLS.RECTANGLE
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Rectangle
          </button>

          <button
            type="button"
            onClick={() => setActiveTool(CANVAS_TOOLS.CIRCLE)}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition-colors ${
              activeTool === CANVAS_TOOLS.CIRCLE
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <Circle className="h-3.5 w-3.5" />
            <span>Circle</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool(CANVAS_TOOLS.ELLIPSE)}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition-colors ${
              activeTool === CANVAS_TOOLS.ELLIPSE
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
              <ellipse cx="12" cy="12" rx="10" ry="6" />
            </svg>
            <span>Ellipse</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool(CANVAS_TOOLS.TRIANGLE)}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition-colors ${
              activeTool === CANVAS_TOOLS.TRIANGLE
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <Triangle className="h-3.5 w-3.5" />
            <span>Triangle</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool(CANVAS_TOOLS.POLYGON)}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition-colors ${
              activeTool === CANVAS_TOOLS.POLYGON
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <Hexagon className="h-3.5 w-3.5" />
            <span>Polygon</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool(CANVAS_TOOLS.STAR)}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition-colors ${
              activeTool === CANVAS_TOOLS.STAR
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <Star className="h-3.5 w-3.5" />
            <span>Star</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool(CANVAS_TOOLS.LINE)}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition-colors ${
              activeTool === CANVAS_TOOLS.LINE
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <Minus className="h-3.5 w-3.5" />
            <span>Line</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool(CANVAS_TOOLS.ARROW)}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition-colors ${
              activeTool === CANVAS_TOOLS.ARROW
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <ArrowRight className="h-3.5 w-3.5" />
            <span>Arrow</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool(CANVAS_TOOLS.CONNECTOR)}
            className={`inline-flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition-colors ${
              activeTool === CANVAS_TOOLS.CONNECTOR
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            <GitCommit className="h-3.5 w-3.5" />
            <span>Connector</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTool(CANVAS_TOOLS.TEXT)}
            className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
              activeTool === CANVAS_TOOLS.TEXT
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Text
          </button>

          <button
            type="button"
            onClick={() => setActiveTool(CANVAS_TOOLS.STICKY_NOTE)}
            className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
              activeTool === CANVAS_TOOLS.STICKY_NOTE
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Sticky Note
          </button>

          <button
            type="button"
            onClick={() => setActiveTool(CANVAS_TOOLS.FREEHAND)}
            className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
              activeTool === CANVAS_TOOLS.FREEHAND
                ? "bg-gray-900 text-white shadow-sm"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Draw
          </button>
        </>
      )}

      <div className="h-6 w-px bg-gray-200 self-center mx-1" />

      <button
        type="button"
        onClick={() => togglePanel()}
        title="Toggle Comments Panel"
        className={`relative inline-flex items-center gap-1.5 rounded px-3 py-2 text-sm font-medium transition-colors ${
          isPanelOpen
            ? "bg-blue-600 text-white shadow-sm"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        <MessageSquare className="h-4 w-4" />
        <span>Comments</span>
        {openCommentsCount > 0 && (
          <span
            className={`rounded-full px-1.5 py-0.2 text-[11px] font-bold ${
              isPanelOpen
                ? "bg-white text-blue-700"
                : "bg-blue-600 text-white"
            }`}
          >
            {openCommentsCount}
          </span>
        )}
      </button>
    </div>
  );
}