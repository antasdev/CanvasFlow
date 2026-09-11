import { useSearchDialogStore, type ContextualSearchScope, type OpenSearchOptions } from "../store/search-dialog.store";
import type { SearchScopeType } from "../types/search.types";

export interface UseSearchDialogReturn {
  isOpen: boolean;
  scope: SearchScopeType;
  workspaceId: string | undefined;
  boardId: string | undefined;
  workspaceName: string | undefined;
  boardName: string | undefined;
  openSearch: (options?: OpenSearchOptions) => void;
  closeSearch: () => void;
  toggleSearch: (options?: OpenSearchOptions) => void;
  setContextualScope: (scope: ContextualSearchScope) => void;
  setScope: (scope: SearchScopeType) => void;
}

export function useSearchDialog(): UseSearchDialogReturn {
  const isOpen = useSearchDialogStore((state) => state.isOpen);
  const scope = useSearchDialogStore((state) => state.scope);
  const workspaceId = useSearchDialogStore((state) => state.workspaceId);
  const boardId = useSearchDialogStore((state) => state.boardId);
  const workspaceName = useSearchDialogStore((state) => state.workspaceName);
  const boardName = useSearchDialogStore((state) => state.boardName);

  const openSearch = useSearchDialogStore((state) => state.openSearch);
  const closeSearch = useSearchDialogStore((state) => state.closeSearch);
  const toggleSearch = useSearchDialogStore((state) => state.toggleSearch);
  const setContextualScope = useSearchDialogStore((state) => state.setContextualScope);
  const setScope = useSearchDialogStore((state) => state.setScope);

  return {
    isOpen,
    scope,
    workspaceId,
    boardId,
    workspaceName,
    boardName,
    openSearch,
    closeSearch,
    toggleSearch,
    setContextualScope,
    setScope,
  };
}
