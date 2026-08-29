import React, { useMemo } from "react";
import {
  MousePointer2,
  Hand,
  Lasso,
  Square,
  Circle,
  Triangle,
  Hexagon,
  Star,
  Minus,
  ArrowRight,
  GitCommit,
  Type,
  StickyNote,
  Pencil,
  Undo2,
  Redo2,
  MessageSquare,
  Eye,
} from "lucide-react";

import { CANVAS_TOOLS, type CanvasTool } from "../constants";
import { useCanvasStore } from "../store";
import { useCommentStore } from "@/features/comments";

type CanvasToolbarProps = {
  canEditCanvas?: boolean;
  className?: string;
};

type ToolItem = {
  tool: CanvasTool;
  label: string;
  hotkey: string;
  icon: React.ReactNode;
};

export default function CanvasToolbar({
  canEditCanvas = true,
  className = "",
}: CanvasToolbarProps): React.JSX.Element {
  const activeTool = useCanvasStore((state) => state.activeTool);
  const setActiveTool = useCanvasStore((state) => state.setActiveTool);

  const undo = useCanvasStore((state) => state.undo);
  const redo = useCanvasStore((state) => state.redo);
  const canUndo = useCanvasStore((state) => state.canUndo());
  const canRedo = useCanvasStore((state) => state.canRedo());

  const isPanelOpen = useCommentStore((state) => state.isPanelOpen);
  const togglePanel = useCommentStore((state) => state.togglePanel);
  const comments = useCommentStore((state) => state.comments);

  const openCommentsCount = useMemo(() => {
    return Object.values(comments).filter(
      (c) => !c.parentCommentId && !c.isResolved && !c.isDeleted
    ).length;
  }, [comments]);

  const navTools: ToolItem[] = [
    {
      tool: CANVAS_TOOLS.SELECT,
      label: "Select",
      hotkey: "V",
      icon: <MousePointer2 className="h-4 w-4" />,
    },
    {
      tool: CANVAS_TOOLS.HAND,
      label: "Hand (Pan)",
      hotkey: "H or Space",
      icon: <Hand className="h-4 w-4" />,
    },
    {
      tool: CANVAS_TOOLS.LASSO,
      label: "Lasso Select",
      hotkey: "",
      icon: <Lasso className="h-4 w-4" />,
    },
  ];

  const shapeTools: ToolItem[] = [
    {
      tool: CANVAS_TOOLS.RECTANGLE,
      label: "Rectangle",
      hotkey: "R",
      icon: <Square className="h-4 w-4" />,
    },
    {
      tool: CANVAS_TOOLS.CIRCLE,
      label: "Circle",
      hotkey: "O",
      icon: <Circle className="h-4 w-4" />,
    },
    {
      tool: CANVAS_TOOLS.ELLIPSE,
      label: "Ellipse",
      hotkey: "",
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <ellipse cx="12" cy="12" rx="10" ry="6" />
        </svg>
      ),
    },
    {
      tool: CANVAS_TOOLS.TRIANGLE,
      label: "Triangle",
      hotkey: "",
      icon: <Triangle className="h-4 w-4" />,
    },
    {
      tool: CANVAS_TOOLS.POLYGON,
      label: "Polygon",
      hotkey: "",
      icon: <Hexagon className="h-4 w-4" />,
    },
    {
      tool: CANVAS_TOOLS.STAR,
      label: "Star",
      hotkey: "",
      icon: <Star className="h-4 w-4" />,
    },
  ];

  const vectorTools: ToolItem[] = [
    {
      tool: CANVAS_TOOLS.LINE,
      label: "Line",
      hotkey: "L",
      icon: <Minus className="h-4 w-4" />,
    },
    {
      tool: CANVAS_TOOLS.ARROW,
      label: "Arrow",
      hotkey: "A",
      icon: <ArrowRight className="h-4 w-4" />,
    },
    {
      tool: CANVAS_TOOLS.CONNECTOR,
      label: "Connector",
      hotkey: "",
      icon: <GitCommit className="h-4 w-4" />,
    },
  ];

  const contentTools: ToolItem[] = [
    {
      tool: CANVAS_TOOLS.TEXT,
      label: "Text",
      hotkey: "T",
      icon: <Type className="h-4 w-4" />,
    },
    {
      tool: CANVAS_TOOLS.STICKY_NOTE,
      label: "Sticky Note",
      hotkey: "S",
      icon: <StickyNote className="h-4 w-4" />,
    },
    {
      tool: CANVAS_TOOLS.FREEHAND,
      label: "Draw",
      hotkey: "P",
      icon: <Pencil className="h-4 w-4" />,
    },
  ];

  const renderToolButton = ({ tool, label, hotkey, icon }: ToolItem) => {
    const isActive = activeTool === tool;
    const titleText = hotkey ? `${label} (${hotkey})` : label;

    return (
      <button
        key={tool}
        type="button"
        onClick={() => setActiveTool(tool)}
        title={titleText}
        aria-label={titleText}
        className={`rounded-lg p-2 transition-all focus:outline-none focus:ring-1 focus:ring-blue-500 ${
          isActive
            ? "bg-gray-900 text-white shadow-sm"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        }`}
      >
        {icon}
      </button>
    );
  };

  return (
    <div
      className={`flex items-center gap-1 rounded-xl bg-white/95 backdrop-blur-md p-1.5 shadow-lg border border-gray-200/80 text-gray-700 select-none ${className}`}
      role="toolbar"
      aria-label="Canvas tool dock"
    >
      {!canEditCanvas && (
        <div className="flex items-center gap-1.5 rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-200 mr-1">
          <Eye className="h-3.5 w-3.5" />
          <span>View Only</span>
        </div>
      )}

      {/* Navigation & Selection */}
      <div className="flex items-center gap-0.5">
        {navTools.map(renderToolButton)}
      </div>

      {canEditCanvas && (
        <>
          <div className="h-5 w-px bg-gray-200 mx-0.5" />

          {/* Basic Shapes */}
          <div className="flex items-center gap-0.5">
            {shapeTools.map(renderToolButton)}
          </div>

          <div className="h-5 w-px bg-gray-200 mx-0.5" />

          {/* Vector & Connectors */}
          <div className="flex items-center gap-0.5">
            {vectorTools.map(renderToolButton)}
          </div>

          <div className="h-5 w-px bg-gray-200 mx-0.5" />

          {/* Content Creation */}
          <div className="flex items-center gap-0.5">
            {contentTools.map(renderToolButton)}
          </div>
        </>
      )}

      <div className="h-5 w-px bg-gray-200 mx-0.5" />

      {/* Undo & Redo */}
      {canEditCanvas && (
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo (Ctrl+Z)"
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30 disabled:hover:bg-transparent transition-all focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            aria-label="Redo (Ctrl+Y)"
            className="rounded-lg p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-30 disabled:hover:bg-transparent transition-all focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Collaborative Comments Panel Toggle */}
      <button
        type="button"
        onClick={() => togglePanel()}
        title="Toggle Comments Panel (C)"
        aria-label="Toggle Comments Panel (C)"
        className={`relative inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-all focus:outline-none focus:ring-1 focus:ring-blue-500 ${
          isPanelOpen
            ? "bg-blue-600 text-white shadow-sm"
            : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
        }`}
      >
        <MessageSquare className="h-4 w-4" />
        <span className="hidden sm:inline">Comments</span>
        {openCommentsCount > 0 && (
          <span
            className={`rounded-full px-1.5 py-0.2 text-[10px] font-bold ${
              isPanelOpen ? "bg-white text-blue-700" : "bg-blue-600 text-white"
            }`}
          >
            {openCommentsCount}
          </span>
        )}
      </button>
    </div>
  );
}