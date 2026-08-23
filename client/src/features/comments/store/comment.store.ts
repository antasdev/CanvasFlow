import { create } from "zustand";
import type { Comment, CommentFilterType } from "../types";

type CommentStore = {
  comments: Record<string, Comment>;
  activeThreadId: string | null;
  selectedShapeId: string | null;
  filter: CommentFilterType;
  isPanelOpen: boolean;

  // Actions
  setComments: (comments: Comment[]) => void;
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
  clearComments: () => void;
};

export const useCommentStore = create<CommentStore>((set) => ({
  comments: {},
  activeThreadId: null,
  selectedShapeId: null,
  filter: "all",
  isPanelOpen: false,

  setComments: (comments: Comment[]): void => {
    const map: Record<string, Comment> = {};
    for (const c of comments) {
      map[c.id] = c;
    }
    set({ comments: map });
  },

  addComment: (comment: Comment): void => {
    set((state) => ({
      comments: {
        ...state.comments,
        [comment.id]: comment,
      },
    }));
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

      return {
        comments: {
          ...state.comments,
          [comment.id]: {
            ...existing,
            ...comment,
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

  clearComments: (): void => {
    set({
      comments: {},
      activeThreadId: null,
      selectedShapeId: null,
      filter: "all",
      isPanelOpen: false,
    });
  },
}));
