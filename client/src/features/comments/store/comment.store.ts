import { create } from "zustand";

import type { Comment, CommentFilterType, CommentPosition } from "../types";

type CommentStore = {
  comments: Record<string, Comment>;
  activeThreadId: string | null;
  selectedShapeId: string | null;
  filter: CommentFilterType;
  isPanelOpen: boolean;
  draftPosition: CommentPosition | null;

  // Actions
  setComments: (comments: Comment[]) => void;
  reconcileAuthoritativeComments: (comments: Comment[]) => void;
  addComment: (comment: Comment) => void;
  updateComment: (comment: Comment) => void;
  removeComment: (commentId: string) => void;
  resolveComment: (commentId: string, isResolved: boolean) => void;

  addOptimisticComment: (comment: Comment) => void;
  replaceOptimisticComment: (tempId: string, authoritative: Comment) => void;
  removeOptimisticComment: (tempId: string) => void;

  setActiveThreadId: (threadId: string | null) => void;
  setSelectedShapeId: (shapeId: string | null) => void;
  setFilter: (filter: CommentFilterType) => void;
  togglePanel: (open?: boolean) => void;
  setDraftPosition: (position: CommentPosition | null) => void;
  clearDraftPosition: () => void;
  clearComments: () => void;
};

export const useCommentStore = create<CommentStore>((set) => ({
  comments: {},
  activeThreadId: null,
  selectedShapeId: null,
  filter: "all",
  isPanelOpen: false,
  draftPosition: null,

  setComments: (comments: Comment[]): void => {
    const map: Record<string, Comment> = {};
    for (const c of comments) {
      map[c.id] = c;
    }
    set({ comments: map });
  },

  reconcileAuthoritativeComments: (authoritativeComments: Comment[]): void => {
    set((state) => {
      const nextMap: Record<string, Comment> = {};

      // 1. Populate authoritative comments
      for (const comment of authoritativeComments) {
        nextMap[comment.id] = comment;
      }

      // 2. Preserve active in-flight optimistic comments (temp_*)
      for (const [id, localComment] of Object.entries(state.comments)) {
        if (localComment.isOptimistic && !nextMap[id]) {
          nextMap[id] = localComment;
        }
      }

      return { comments: nextMap };
    });
  },

  addComment: (comment: Comment): void => {
    set((state) => {
      const existing = state.comments[comment.id];
      if (
        existing &&
        !existing.isOptimistic &&
        typeof comment.version === "number" &&
        typeof existing.version === "number" &&
        comment.version < existing.version
      ) {
        // Stale entity version - ignore
        return state;
      }

      return {
        comments: {
          ...state.comments,
          [comment.id]: comment,
        },
      };
    });
  },

  updateComment: (comment: Comment): void => {
    set((state) => {
      const existing = state.comments[comment.id];
      if (!existing) {
        return {
          comments: {
            ...state.comments,
            [comment.id]: comment,
          },
        };
      }

      // Stale entity version check (ignore if incoming version is older than existing authoritative version)
      if (
        !existing.isOptimistic &&
        typeof comment.version === "number" &&
        typeof existing.version === "number" &&
        comment.version < existing.version
      ) {
        return state;
      }

      return {
        comments: {
          ...state.comments,
          [comment.id]: {
            ...existing,
            ...comment,
            isOptimistic: false,
          },
        },
      };
    });
  },

  removeComment: (commentId: string): void => {
    set((state) => {
      const existing = state.comments[commentId];
      if (!existing) return state;

      return {
        comments: {
          ...state.comments,
          [commentId]: {
            ...existing,
            content: "",
            isDeleted: true,
          },
        },
      };
    });
  },

  resolveComment: (commentId: string, isResolved: boolean): void => {
    set((state) => {
      const existing = state.comments[commentId];
      if (!existing) return state;

      return {
        comments: {
          ...state.comments,
          [commentId]: {
            ...existing,
            isResolved,
            resolvedAt: isResolved ? new Date().toISOString() : null,
            resolvedBy: isResolved ? existing.resolvedBy ?? null : null,
          },
        },
      };
    });
  },

  addOptimisticComment: (comment: Comment): void => {
    set((state) => ({
      comments: {
        ...state.comments,
        [comment.id]: {
          ...comment,
          isOptimistic: true,
        },
      },
    }));
  },

  replaceOptimisticComment: (
    tempId: string,
    authoritative: Comment
  ): void => {
    set((state) => {
      const next = { ...state.comments };
      delete next[tempId];
      next[authoritative.id] = authoritative;

      let nextActiveThreadId = state.activeThreadId;
      if (state.activeThreadId === tempId) {
        nextActiveThreadId = authoritative.id;
      }

      return {
        comments: next,
        activeThreadId: nextActiveThreadId,
      };
    });
  },

  removeOptimisticComment: (tempId: string): void => {
    set((state) => {
      const next = { ...state.comments };
      delete next[tempId];

      let nextActiveThreadId = state.activeThreadId;
      if (state.activeThreadId === tempId) {
        nextActiveThreadId = null;
      }

      return {
        comments: next,
        activeThreadId: nextActiveThreadId,
      };
    });
  },

  setActiveThreadId: (threadId: string | null): void => {
    set({ activeThreadId: threadId });
  },

  setSelectedShapeId: (shapeId: string | null): void => {
    set({ selectedShapeId: shapeId });
  },

  setFilter: (filter: CommentFilterType): void => {
    set({ filter });
  },

  togglePanel: (open?: boolean): void => {
    set((state) => ({
      isPanelOpen: open !== undefined ? open : !state.isPanelOpen,
    }));
  },

  setDraftPosition: (position: CommentPosition | null): void => {
    set({ draftPosition: position });
  },

  clearDraftPosition: (): void => {
    set({ draftPosition: null });
  },

  clearComments: (): void => {
    set({
      comments: {},
      activeThreadId: null,
      selectedShapeId: null,
      filter: "all",
      isPanelOpen: false,
      draftPosition: null,
    });
  },
}));
