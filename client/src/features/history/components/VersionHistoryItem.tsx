import {
  Sparkles,
  Layers,
  Shapes,
  User,
  Eye,
  RotateCcw,
} from "lucide-react";
import React from "react";

import { type HistoryUIState, useVersionHistoryStore } from "../store";
import type { VersionSummary } from "../types";
import {
  formatVersionTime,
  formatFullDateTime,
} from "../utils/history-date.utils";

export interface VersionHistoryItemProps {
  version: VersionSummary;
  className?: string;
  onRestore?: (version: VersionSummary) => void;
}

export function VersionHistoryItem({
  version,
  className = "",
  onRestore,
}: VersionHistoryItemProps): React.JSX.Element {
  const openPreview = useVersionHistoryStore((state: HistoryUIState) => state.openPreview);

  const formattedTime = formatVersionTime(version.createdAt);
  const fullDateTime = formatFullDateTime(version.createdAt);
  const authorName = version.author?.fullName || "Collaborator";

  const changeSummary = version.changeSummary;
  const hasChangeCounts =
    changeSummary &&
    (changeSummary.shapesAdded > 0 ||
      changeSummary.shapesModified > 0 ||
      changeSummary.shapesDeleted > 0);

  return (
    <div
      className={`group relative rounded-xl border border-gray-200 bg-white p-3.5 shadow-xs transition-all hover:border-gray-300 hover:shadow-md ${className}`}
      data-testid={`version-item-${version.id}`}
    >
      {/* Top Header: Version Number, Named Badge, Time */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center rounded-md bg-slate-900 px-2 py-0.5 text-xs font-bold text-white tracking-wide">
            v{version.versionNumber}
          </span>

          {version.isNamed && version.name && (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-xs font-semibold text-blue-700 border border-blue-200 truncate max-w-[160px]"
              title={version.name}
            >
              <Sparkles className="h-3 w-3 text-blue-500 shrink-0" />
              <span className="truncate">{version.name}</span>
            </span>
          )}

          <span
            className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wider ${
              version.trigger === "manual"
                ? "bg-purple-50 text-purple-700 border border-purple-200"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {version.trigger}
          </span>
        </div>

        <time
          dateTime={version.createdAt}
          title={fullDateTime}
          className="text-xs font-medium text-gray-500 shrink-0 cursor-default"
        >
          {formattedTime}
        </time>
      </div>

      {/* Description / Name Details */}
      {version.description && (
        <p className="mt-2 text-xs text-gray-600 leading-relaxed break-words">
          {version.description}
        </p>
      )}

      {/* Change Summary breakdown */}
      {hasChangeCounts && changeSummary && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-gray-600">
          {changeSummary.shapesAdded > 0 && (
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 border border-emerald-200">
              +{changeSummary.shapesAdded} added
            </span>
          )}
          {changeSummary.shapesModified > 0 && (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 border border-amber-200">
              ~{changeSummary.shapesModified} modified
            </span>
          )}
          {changeSummary.shapesDeleted > 0 && (
            <span className="rounded bg-rose-50 px-1.5 py-0.5 text-rose-700 border border-rose-200">
              -{changeSummary.shapesDeleted} deleted
            </span>
          )}
        </div>
      )}

      {/* Bottom Metadata: Author, Canvas/Shape counts & Action Affordances */}
      <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2.5 text-xs text-gray-500">
        {/* Author & Entity counts */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div
            className="flex items-center gap-1 text-gray-700 font-medium truncate max-w-[120px]"
            title={authorName}
          >
            <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
            <span className="truncate">{authorName}</span>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-gray-400">
            <span
              className="flex items-center gap-0.5"
              title={`${version.shapeCount} total shapes`}
            >
              <Shapes className="h-3 w-3" />
              {version.shapeCount}
            </span>
            <span
              className="flex items-center gap-0.5"
              title={`${version.canvasCount} canvas pages`}
            >
              <Layers className="h-3 w-3" />
              {version.canvasCount}
            </span>
          </div>
        </div>

        {/* Action Affordances (Slice 40 Preview, Slice 41 Restore) */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openPreview(version.id)}
            title={`Preview Version ${version.versionNumber}`}
            aria-label={`Preview Version ${version.versionNumber}`}
            data-testid={`preview-version-btn-${version.id}`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-slate-700 bg-slate-100 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 border border-gray-200 transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <Eye className="h-3 w-3" />
            <span>Preview</span>
          </button>

          <button
            type="button"
            onClick={() => onRestore?.(version)}
            title={`Restore Version ${version.versionNumber}`}
            aria-label={`Restore Version ${version.versionNumber}`}
            data-testid={`restore-version-btn-${version.id}`}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-blue-700 bg-blue-50 hover:bg-blue-100 hover:border-blue-300 border border-blue-200 transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          >
            <RotateCcw className="h-3 w-3" />
            <span>Restore</span>
          </button>
        </div>
      </div>
    </div>
  );
}
