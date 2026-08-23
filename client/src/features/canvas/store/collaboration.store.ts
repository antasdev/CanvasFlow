import { create } from "zustand";

export type FreshnessResult = {
  action: "apply" | "ignore" | "gap";
  currentRevision: number;
};

export type CollaborationConflict = {
  resourceType: "shape" | "comment";
  resourceId: string;
  currentVersion: number;
};

export interface CollaborationState {
  boardRevisions: Record<string, number>;
  connectionEpoch: number;
  isRecovering: boolean;
  lastConflict: CollaborationConflict | null;

  getRevision: (boardId: string) => number;
  setRevision: (boardId: string, revision: number) => void;
  incrementEpoch: () => number;
  setRecovering: (isRecovering: boolean) => void;
  setConflict: (conflict: CollaborationConflict) => void;
  clearConflict: () => void;

  /**
   * Checks the ordering and freshness of an incoming authoritative event revision.
   * - If incoming <= current: IGNORE (stale or duplicate)
   * - If incoming === current + 1 (or current === 0): APPLY (advances stored revision)
   * - If incoming > current + 1 (when current > 0): GAP (missed intermediate event, triggers recovery)
   */
  checkEventFreshness: (boardId: string, revision: number) => FreshnessResult;

  reset: () => void;
}

const initialState = {
  boardRevisions: {},
  connectionEpoch: 0,
  isRecovering: false,
  lastConflict: null as CollaborationConflict | null,
};

export const useCollaborationStore = create<CollaborationState>()((set, get) => ({
  ...initialState,

  getRevision: (boardId: string): number => {
    return get().boardRevisions[boardId] ?? 0;
  },

  setRevision: (boardId: string, revision: number): void => {
    set((state) => ({
      boardRevisions: {
        ...state.boardRevisions,
        [boardId]: revision,
      },
    }));
  },

  incrementEpoch: (): number => {
    const nextEpoch = get().connectionEpoch + 1;
    set({ connectionEpoch: nextEpoch });
    return nextEpoch;
  },

  setRecovering: (isRecovering: boolean): void => {
    set({ isRecovering });
  },

  setConflict: (conflict: CollaborationConflict): void => {
    set({ lastConflict: conflict });
  },

  clearConflict: (): void => {
    set({ lastConflict: null });
  },

  checkEventFreshness: (boardId: string, revision: number): FreshnessResult => {
    const currentRevision = get().boardRevisions[boardId] ?? 0;

    // Stale or duplicate event
    if (revision <= currentRevision) {
      return { action: "ignore", currentRevision };
    }

    // Direct next sequential revision
    if (revision === currentRevision + 1) {
      set((state) => ({
        boardRevisions: {
          ...state.boardRevisions,
          [boardId]: revision,
        },
      }));
      return { action: "apply", currentRevision };
    }

    // Initial event before explicit recovery hydration
    if (currentRevision === 0) {
      set((state) => ({
        boardRevisions: {
          ...state.boardRevisions,
          [boardId]: revision,
        },
      }));
      return { action: "apply", currentRevision };
    }

    // Revision gap detected (e.g. current=42, incoming=44)
    return { action: "gap", currentRevision };
  },

  reset: (): void => {
    set(initialState);
  },
}));
