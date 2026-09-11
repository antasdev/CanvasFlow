import React, { useMemo } from "react";
import { Search } from "lucide-react";
import { useSearchDialog } from "../hooks/useSearchDialog";
import type { SearchScopeType } from "../types/search.types";

export interface SearchButtonProps {
  scope?: SearchScopeType;
  workspaceId?: string;
  boardId?: string;
  workspaceName?: string;
  boardName?: string;
  className?: string;
}

export function SearchButton({
  scope,
  workspaceId,
  boardId,
  workspaceName,
  boardName,
  className,
}: SearchButtonProps): React.JSX.Element {
  const { openSearch } = useSearchDialog();

  const isMac = useMemo(() => {
    return (
      typeof navigator !== "undefined" &&
      /Mac|iPod|iPhone|iPad/.test(navigator.userAgent)
    );
  }, []);

  const handleClick = (): void => {
    openSearch({
      scope,
      workspaceId,
      boardId,
      workspaceName,
      boardName,
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Search"
      className={`
        group flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-xs text-slate-500
        transition-all hover:border-slate-300 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20
        ${className ?? ""}
      `}
    >
      <Search className="h-3.5 w-3.5 text-slate-400 group-hover:text-slate-600 transition-colors" aria-hidden="true" />
      <span className="font-normal">Search...</span>
      <kbd className="ml-auto inline-flex items-center gap-0.5 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-400 shadow-2xs group-hover:border-slate-300 group-hover:text-slate-600">
        {isMac ? "⌘" : "Ctrl"} K
      </kbd>
    </button>
  );
}
