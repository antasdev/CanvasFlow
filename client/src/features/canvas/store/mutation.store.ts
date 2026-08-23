import { create } from "zustand";
import type { CollaborationConflict } from "./collaboration.store";
import type { Shape } from "../types/shape.types";

/**
 * Explicit mutation lifecycle status (Slice 13)
 */
export type MutationStatus =
  | "pending"
  | "uncertain"
  | "confirmed"
  | "failed"
  | "conflicted"
  | "reconciling";

export type ShapeMutationIntent = {
  resourceType: "shape";
  resourceId: string;
  operation: "create" | "update" | "delete";
  expectedVersion?: number;
  temporaryId?: string;
  payload?: any;
  changes?: Partial<Shape>;
};

export type CommentMutationIntent = {
  resourceType: "comment";
  resourceId: string;
  operation: "create" | "update" | "resolve" | "delete";
  expectedVersion?: number;
  temporaryId?: string;
  payload?: any;
  changes?: Record<string, any>;
};

export type MutationIntent = ShapeMutationIntent | CommentMutationIntent;

export type PendingMutation = {
  mutationId: string;
  boardId: string;
  resourceType: "shape" | "comment";
  resourceId: string;
  operation: "create" | "update" | "delete" | "resolve";
  expectedVersion?: number;
  status: MutationStatus;
  intent?: MutationIntent;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  error?: string;
  conflict?: CollaborationConflict;
};

export interface MutationStoreState {
  mutations: Record<string, PendingMutation>;

  addMutation: (mutation: PendingMutation) => void;
  markConfirmed: (mutationId: string) => void;
  markFailed: (mutationId: string, error: string) => void;
  markConflicted: (mutationId: string, conflict?: CollaborationConflict) => void;
  markReconciling: (mutationId: string) => void;
  markUncertain: (mutationId: string) => void;
  getPendingMutations: (boardId: string) => PendingMutation[];
  removeMutation: (mutationId: string) => void;
  clearBoard: (boardId: string) => void;
  reset: () => void;
}

export const useMutationStore = create<MutationStoreState>((set, get) => ({
  mutations: {},

  addMutation: (mutation: PendingMutation) => {
    set((state) => ({
      mutations: {
        ...state.mutations,
        [mutation.mutationId]: {
          ...mutation,
          status: mutation.status ?? "pending",
          retryCount: mutation.retryCount ?? 0,
          createdAt: mutation.createdAt ?? new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      },
    }));
  },

  markConfirmed: (mutationId: string) => {
    set((state) => {
      // Upon confirmation, remove from journal to keep state bounded
      const next = { ...state.mutations };
      delete next[mutationId];
      return { mutations: next };
    });
  },

  markFailed: (mutationId: string, error: string) => {
    set((state) => {
      const existing = state.mutations[mutationId];
      if (!existing) return state;
      return {
        mutations: {
          ...state.mutations,
          [mutationId]: {
            ...existing,
            status: "failed",
            error,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  markConflicted: (mutationId: string, conflict?: CollaborationConflict) => {
    set((state) => {
      const existing = state.mutations[mutationId];
      if (!existing) return state;
      return {
        mutations: {
          ...state.mutations,
          [mutationId]: {
            ...existing,
            status: "conflicted",
            conflict,
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  markReconciling: (mutationId: string) => {
    set((state) => {
      const existing = state.mutations[mutationId];
      if (!existing) return state;
      return {
        mutations: {
          ...state.mutations,
          [mutationId]: {
            ...existing,
            status: "reconciling",
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  markUncertain: (mutationId: string) => {
    set((state) => {
      const existing = state.mutations[mutationId];
      if (!existing) return state;
      return {
        mutations: {
          ...state.mutations,
          [mutationId]: {
            ...existing,
            status: "uncertain",
            updatedAt: new Date().toISOString(),
          },
        },
      };
    });
  },

  getPendingMutations: (boardId: string) => {
    const all = Object.values(get().mutations);
    return all.filter((m) => m.boardId === boardId && (m.status === "pending" || m.status === "uncertain" || m.status === "reconciling"));
  },

  removeMutation: (mutationId: string) => {
    set((state) => {
      const next = { ...state.mutations };
      delete next[mutationId];
      return { mutations: next };
    });
  },

  clearBoard: (boardId: string) => {
    set((state) => {
      const next: Record<string, PendingMutation> = {};
      for (const [id, m] of Object.entries(state.mutations)) {
        if (m.boardId !== boardId) {
          next[id] = m;
        }
      }
      return { mutations: next };
    });
  },

  reset: () => {
    set({ mutations: {} });
  },
}));
