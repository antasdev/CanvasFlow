import { create } from "zustand";

interface HistoryUIState {
  isPanelOpen: boolean;
  setIsPanelOpen: (isOpen: boolean) => void;
  togglePanel: (forceOpen?: boolean) => void;
}

export const useHistoryStore = create<HistoryUIState>((set) => ({
  isPanelOpen: false,
  setIsPanelOpen: (isOpen: boolean) => set({ isPanelOpen: isOpen }),
  togglePanel: (forceOpen?: boolean) =>
    set((state) => ({
      isPanelOpen:
        forceOpen !== undefined ? forceOpen : !state.isPanelOpen,
    })),
}));
