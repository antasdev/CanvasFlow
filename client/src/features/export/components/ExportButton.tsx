import React, { useMemo } from "react";
import { Download } from "lucide-react";
import { useExportDialog } from "../hooks/useExportDialog";

export interface ExportButtonProps {
  boardName?: string;
  className?: string;
}

export function ExportButton({
  boardName,
  className,
}: ExportButtonProps): React.JSX.Element {
  const { openExport } = useExportDialog();

  const isMac = useMemo(() => {
    return (
      typeof navigator !== "undefined" &&
      /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)
    );
  }, []);

  const handleClick = (): void => {
    openExport({ boardName });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Export canvas (Ctrl+Shift+E)"
      title="Export canvas"
      className={`
        group flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs font-medium text-slate-700 shadow-2xs
        transition-all hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20
        ${className ?? ""}
      `}
    >
      <Download
        className="h-3.5 w-3.5 text-slate-500 group-hover:text-slate-700 transition-colors"
        aria-hidden="true"
      />
      <span>Export</span>
      <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-slate-200 bg-slate-50 px-1 py-0.5 text-[10px] font-normal text-slate-400">
        {isMac ? "⌘" : "Ctrl"}⇧E
      </kbd>
    </button>
  );
}
