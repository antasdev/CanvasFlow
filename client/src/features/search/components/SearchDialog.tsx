import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  X,
  Loader2,
  AlertCircle,
  SlidersHorizontal,
} from "lucide-react";
import { useSearchDialog } from "../hooks/useSearchDialog";
import { useInfiniteSearch } from "../hooks/useInfiniteSearch";
import { SearchResultItem } from "./SearchResultItem";
import type {
  SearchResultItem as SearchResultItemType,
  SearchEntityType,
} from "../types/search.types";

export type FilterCategory = "all" | SearchEntityType;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || !(target instanceof HTMLElement)) {
    return false;
  }
  const tagName = target.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }
  if (target.isContentEditable) {
    return true;
  }
  if (target.closest("[contenteditable='true']")) {
    return true;
  }
  return false;
}

export function SearchDialog(): React.JSX.Element | null {
  const {
    isOpen,
    scope,
    workspaceId,
    boardId,
    workspaceName,
    boardName,
    closeSearch,
    toggleSearch,
    setScope,
  } = useSearchDialog();

  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const resultsContainerRef = useRef<HTMLDivElement>(null);

  const [query, setQuery] = useState<string>("");
  const [debouncedQuery, setDebouncedQuery] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<FilterCategory>("all");
  const [highlightedIndex, setHighlightedIndex] = useState<number>(0);

  // Global Ctrl/Cmd + K shortcut listener (registered once on mount)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent): void => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        if (isEditableTarget(e.target)) {
          return;
        }
        e.preventDefault();
        if (!isOpen && document.activeElement instanceof HTMLElement) {
          triggerRef.current = document.activeElement;
        }
        toggleSearch();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return (): void => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, toggleSearch]);

  // Focus input when dialog opens; restore focus when closing
  useEffect(() => {
    if (isOpen) {
      if (document.activeElement instanceof HTMLElement) {
        triggerRef.current = document.activeElement;
      }
      const timeoutId = window.setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
      return (): void => {
        window.clearTimeout(timeoutId);
      };
    } else {
      triggerRef.current?.focus();
      // Reset local dialog transient state
      setQuery("");
      setDebouncedQuery("");
      setActiveFilter("all");
      setHighlightedIndex(0);
    }
  }, [isOpen]);

  // Debounce query by 250ms
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedQuery(query.trim());
      setHighlightedIndex(0);
    }, 250);

    return (): void => {
      window.clearTimeout(timer);
    };
  }, [query]);

  // Entity types array for API request
  const selectedTypes = useMemo<SearchEntityType[] | undefined>(() => {
    if (activeFilter === "all") {
      return undefined;
    }
    return [activeFilter];
  }, [activeFilter]);

  // Query search via TanStack Query infinite hook
  const {
    data,
    isLoading,
    isFetching,
    isFetchingNextPage,
    isError,
    error,
    hasNextPage,
    fetchNextPage,
    refetch,
  } = useInfiniteSearch(
    {
      q: debouncedQuery,
      scope,
      workspaceId,
      boardId,
      types: selectedTypes,
      limit: 20,
    },
    {
      enabled: isOpen && debouncedQuery.length >= 1,
    }
  );

  // Flatten results from all pages
  const allResults = useMemo<SearchResultItemType[]>(() => {
    if (!data?.pages) {
      return [];
    }
    return data.pages.flatMap((page) => page.results);
  }, [data]);

  // Result activation and navigation handler
  const handleSelectResult = useCallback(
    (item: SearchResultItemType): void => {
      closeSearch();

      switch (item.entityType) {
        case "board":
          navigate(`/boards/${item.boardId}`);
          break;
        case "canvas": {
          const canvasQuery = item.canvasId ? `?canvasId=${item.canvasId}` : "";
          navigate(`/boards/${item.boardId}${canvasQuery}`);
          break;
        }
        case "shape": {
          const shapeId = item.shapeId || item.id;
          const params = new URLSearchParams();
          if (item.canvasId) {
            params.set("canvasId", item.canvasId);
          }
          params.set("shapeId", shapeId);
          navigate(`/boards/${item.boardId}?${params.toString()}`);
          break;
        }
        case "comment": {
          const commentId = item.commentId || item.id;
          const params = new URLSearchParams();
          if (item.canvasId) {
            params.set("canvasId", item.canvasId);
          }
          params.set("commentId", commentId);
          navigate(`/boards/${item.boardId}?${params.toString()}`);
          break;
        }
      }
    },
    [closeSearch, navigate]
  );

  // Keyboard navigation within dialog
  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      closeSearch();
      return;
    }

    if (allResults.length === 0) {
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev < allResults.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : allResults.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const selected = allResults[highlightedIndex];
      if (selected) {
        handleSelectResult(selected);
      }
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (resultsContainerRef.current && allResults.length > 0) {
      const activeEl = resultsContainerRef.current.querySelector(
        `#search-result-${highlightedIndex}`
      );
      if (activeEl && typeof activeEl.scrollIntoView === "function") {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    }
  }, [highlightedIndex, allResults.length]);

  if (!isOpen) {
    return null;
  }

  const hasQuery = debouncedQuery.length >= 1;
  const isInitialLoading = hasQuery && isLoading;
  const showEmptyState = hasQuery && !isLoading && !isError && allResults.length === 0;
  const activeOptionId =
    allResults.length > 0 ? `search-result-${highlightedIndex}` : undefined;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-900/50 p-4 pt-16 sm:pt-24 backdrop-blur-xs transition-opacity animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          closeSearch();
        }
      }}
    >
      <div
        className="w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-slate-200/80 transition-all flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center border-b border-slate-200 px-4 py-3 bg-white">
          <Search className="h-5 w-5 text-slate-400 shrink-0" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            role="combobox"
            aria-expanded={allResults.length > 0}
            aria-controls="search-results-list"
            aria-activedescendant={activeOptionId}
            aria-autocomplete="list"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleInputKeyDown}
            placeholder={
              scope === "board"
                ? `Search in board ${boardName ? `"${boardName}"` : ""}...`
                : `Search in workspace ${workspaceName ? `"${workspaceName}"` : ""}...`
            }
            className="ml-3 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
          />

          <div className="flex items-center gap-2">
            {isFetching && (
              <Loader2 className="h-4 w-4 animate-spin text-blue-500" aria-label="Searching..." />
            )}

            {query.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setDebouncedQuery("");
                  inputRef.current?.focus();
                }}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                aria-label="Clear search query"
              >
                <X className="h-4 w-4" />
              </button>
            )}

            <button
              type="button"
              onClick={closeSearch}
              className="rounded-md px-1.5 py-0.5 text-xs text-slate-400 border border-slate-200 hover:bg-slate-100 hover:text-slate-600 transition-colors"
              aria-label="Close search"
            >
              Esc
            </button>
          </div>
        </div>

        {/* Filter Controls & Scope Bar */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 py-2 text-xs">
          {/* Entity Filter Pills */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {(
              [
                { id: "all", label: "All" },
                { id: "board", label: "Boards" },
                { id: "canvas", label: "Canvases" },
                { id: "shape", label: "Shapes" },
                { id: "comment", label: "Comments" },
              ] as const
            ).map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => {
                  setActiveFilter(filter.id);
                  setHighlightedIndex(0);
                }}
                className={`
                  rounded-full px-2.5 py-1 font-medium transition-colors
                  ${
                    activeFilter === filter.id
                      ? "bg-blue-600 text-white shadow-2xs"
                      : "text-slate-600 hover:bg-slate-200/70"
                  }
                `}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {/* Scope Indicator & Context Toggle */}
          <div className="ml-2 flex shrink-0 items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-400 flex items-center gap-1">
              <SlidersHorizontal className="h-3 w-3" />
              Scope:
            </span>
            {scope === "board" && workspaceId ? (
              <button
                type="button"
                onClick={() => setScope("workspace")}
                className="rounded px-1.5 py-0.5 text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors"
                title="Switch to Workspace Search"
              >
                Board (click for Workspace)
              </button>
            ) : (
              <span className="rounded px-1.5 py-0.5 text-[11px] font-medium bg-slate-200/80 text-slate-700">
                {scope === "board" ? "Board" : "Workspace"}
              </span>
            )}
          </div>
        </div>

        {/* Results Container */}
        <div
          ref={resultsContainerRef}
          id="search-results-list"
          role="listbox"
          aria-label="Search results"
          className="flex-1 overflow-y-auto p-2"
        >
          {/* Initial / Empty Query State */}
          {!hasQuery && (
            <div className="py-12 text-center text-slate-500">
              <Search className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-slate-700">
                Search CanvasFlow
              </p>
              <p className="mt-1 text-xs text-slate-400">
                Find boards, canvases, shapes, and comments by typing keywords above.
              </p>
              <div className="mt-4 flex items-center justify-center gap-4 text-[11px] text-slate-400">
                <span className="inline-flex items-center gap-1">
                  <kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5">↑</kbd>
                  <kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5">↓</kbd>
                  Navigate
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5">↵</kbd>
                  Select
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="rounded border border-slate-200 bg-slate-100 px-1 py-0.5">esc</kbd>
                  Close
                </span>
              </div>
            </div>
          )}

          {/* Loading Skeleton */}
          {isInitialLoading && (
            <div className="flex flex-col gap-2 p-2">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="flex animate-pulse items-center gap-3 rounded-lg p-3 bg-slate-50"
                >
                  <div className="h-6 w-6 rounded bg-slate-200" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-4 w-1/3 rounded bg-slate-200" />
                    <div className="h-3 w-2/3 rounded bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Error State with Retry */}
          {isError && (
            <div className="py-8 text-center text-slate-600">
              <AlertCircle className="mx-auto h-8 w-8 text-red-500" aria-hidden="true" />
              <p className="mt-2 text-sm font-medium text-slate-800">
                Failed to load search results
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {error instanceof Error ? error.message : "An unexpected error occurred."}
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-3 inline-flex items-center rounded-md bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* Empty State */}
          {showEmptyState && (
            <div className="py-12 text-center text-slate-500">
              <p className="text-sm font-medium text-slate-700">No results found</p>
              <p className="mt-1 text-xs text-slate-400">
                No matching entities found for &quot;{debouncedQuery}&quot; in this {scope}.
              </p>
            </div>
          )}

          {/* Results List */}
          {allResults.length > 0 && (
            <div className="space-y-1">
              {allResults.map((item, index) => (
                <SearchResultItem
                  key={`${item.entityType}-${item.id}-${index}`}
                  id={`search-result-${index}`}
                  item={item}
                  isSelected={index === highlightedIndex}
                  onSelect={handleSelectResult}
                />
              ))}

              {/* Load More Button for Cursor Pagination */}
              {hasNextPage && (
                <div className="pt-2 pb-1 text-center">
                  <button
                    type="button"
                    onClick={() => fetchNextPage()}
                    disabled={isFetchingNextPage}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                  >
                    {isFetchingNextPage ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Loading more...</span>
                      </>
                    ) : (
                      <span>Load more results</span>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer info */}
        {allResults.length > 0 && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/80 px-4 py-2 text-[11px] text-slate-400">
            <span>
              {allResults.length} {allResults.length === 1 ? "result" : "results"}
            </span>
            <span className="flex items-center gap-1">
              <span>Press</span>
              <kbd className="rounded border border-slate-200 bg-white px-1 py-0.5 text-[10px] text-slate-600">
                ↵
              </kbd>
              <span>to open</span>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
