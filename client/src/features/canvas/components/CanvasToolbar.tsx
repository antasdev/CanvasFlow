import React, { useMemo } from "react";
import { MessageSquare } from "lucide-react";

import { CANVAS_TOOLS } from "../constants";
import { useCanvasStore } from "../store";
import { useCommentStore } from "@/features/comments";

export default function CanvasToolbar(): React.JSX.Element {
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
    <div className="absolute left-4 top-4 z-10 flex gap-2 rounded-lg bg-white p-2 shadow-md border border-gray-200">
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