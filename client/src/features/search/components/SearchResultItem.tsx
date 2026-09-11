import React from "react";
import {
  Layout,
  FileText,
  Square,
  MessageSquare,
  CornerDownLeft,
} from "lucide-react";
import type { SearchResultItem as SearchResultItemType, SearchEntityType } from "../types/search.types";

export interface SearchResultItemProps {
  item: SearchResultItemType;
  isSelected: boolean;
  onSelect: (item: SearchResultItemType) => void;
  id: string;
}

function getEntityIcon(type: SearchEntityType): React.JSX.Element {
  switch (type) {
    case "board":
      return <Layout className="h-4 w-4 text-blue-600" aria-hidden="true" />;
    case "canvas":
      return <FileText className="h-4 w-4 text-emerald-600" aria-hidden="true" />;
    case "shape":
      return <Square className="h-4 w-4 text-purple-600" aria-hidden="true" />;
    case "comment":
      return <MessageSquare className="h-4 w-4 text-amber-600" aria-hidden="true" />;
  }
}

function getEntityBadge(type: SearchEntityType): React.JSX.Element {
  switch (type) {
    case "board":
      return (
        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200">
          Board
        </span>
      );
    case "canvas":
      return (
        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
          Canvas
        </span>
      );
    case "shape":
      return (
        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">
          Shape
        </span>
      );
    case "comment":
      return (
        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">
          Comment
        </span>
      );
  }
}

export function SearchResultItem({
  item,
  isSelected,
  onSelect,
  id,
}: SearchResultItemProps): React.JSX.Element {
  return (
    <div
      id={id}
      role="option"
      aria-selected={isSelected}
      onClick={() => onSelect(item)}
      className={`
        group flex cursor-pointer items-start justify-between gap-3 rounded-lg px-3 py-2.5 text-left transition-colors
        ${
          isSelected
            ? "bg-blue-50/80 text-blue-950 ring-1 ring-blue-300"
            : "hover:bg-slate-50 text-slate-900"
        }
      `}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white shadow-xs border border-slate-200">
          {getEntityIcon(item.entityType)}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {getEntityBadge(item.entityType)}
            <span className="truncate text-sm font-medium leading-5">
              {item.title}
            </span>
          </div>

          {item.snippet && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-500 leading-relaxed break-words">
              {item.snippet}
            </p>
          )}

          {(item.boardName || item.canvasName) && (
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-400">
              {item.boardName && <span>{item.boardName}</span>}
              {item.boardName && item.canvasName && <span>/</span>}
              {item.canvasName && <span>{item.canvasName}</span>}
            </div>
          )}
        </div>
      </div>

      <div className="ml-2 flex shrink-0 items-center self-center">
        {isSelected ? (
          <span className="flex items-center gap-1 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
            <span>Select</span>
            <CornerDownLeft className="h-2.5 w-2.5" aria-hidden="true" />
          </span>
        ) : (
          <span className="text-[10px] text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
            Jump to
          </span>
        )}
      </div>
    </div>
  );
}
