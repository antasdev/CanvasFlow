import { create } from "zustand";
import type { SearchScopeType } from "../types/search.types";

export interface ContextualSearchScope {
  scope: SearchScopeType;
  workspaceId?: string;
  boardId?: string;
  workspaceName?: string;
  boardName?: string;
}

export interface OpenSearchOptions {
  scope?: SearchScopeType;
  workspaceId?: string;
  boardId?: string;
  workspaceName?: string;
  boardName?: string;
}

export interface SearchDialogState {
  isOpen: boolean;
  scope: SearchScopeType;
  workspaceId?: string;
  boardId?: string;
  workspaceName?: string;
  boardName?: string;
  contextualScope: ContextualSearchScope;

  openSearch: (options?: OpenSearchOptions) => void;
  closeSearch: () => void;
  toggleSearch: (options?: OpenSearchOptions) => void;
  setContextualScope: (scope: ContextualSearchScope) => void;
  setScope: (scope: SearchScopeType) => void;
}

const DEFAULT_SCOPE: ContextualSearchScope = {
  scope: "workspace",
};

export const useSearchDialogStore = create<SearchDialogState>((set) => ({
  isOpen: false,
  scope: "workspace",
  workspaceId: undefined,
  boardId: undefined,
  workspaceName: undefined,
  boardName: undefined,
  contextualScope: DEFAULT_SCOPE,

  openSearch: (options?: OpenSearchOptions): void => {
    set((state) => {
      const targetScope = options?.scope ?? state.contextualScope.scope;
      const workspaceId = options?.workspaceId ?? state.contextualScope.workspaceId;
      const boardId = options?.boardId ?? state.contextualScope.boardId;
      const workspaceName = options?.workspaceName ?? state.contextualScope.workspaceName;
      const boardName = options?.boardName ?? state.contextualScope.boardName;

      return {
        isOpen: true,
        scope: targetScope,
        workspaceId,
        boardId,
        workspaceName,
        boardName,
      };
    });
  },

  closeSearch: (): void => {
    set({ isOpen: false });
  },

  toggleSearch: (options?: OpenSearchOptions): void => {
    set((state) => {
      if (state.isOpen) {
        return { isOpen: false };
      }

      const targetScope = options?.scope ?? state.contextualScope.scope;
      const workspaceId = options?.workspaceId ?? state.contextualScope.workspaceId;
      const boardId = options?.boardId ?? state.contextualScope.boardId;
      const workspaceName = options?.workspaceName ?? state.contextualScope.workspaceName;
      const boardName = options?.boardName ?? state.contextualScope.boardName;

      return {
        isOpen: true,
        scope: targetScope,
        workspaceId,
        boardId,
        workspaceName,
        boardName,
      };
    });
  },

  setContextualScope: (scope: ContextualSearchScope): void => {
    set((state) => ({
      contextualScope: scope,
      ...(state.isOpen
        ? {}
        : {
            scope: scope.scope,
            workspaceId: scope.workspaceId,
            boardId: scope.boardId,
            workspaceName: scope.workspaceName,
            boardName: scope.boardName,
          }),
    }));
  },

  setScope: (scope: SearchScopeType): void => {
    set({ scope });
  },
}));
