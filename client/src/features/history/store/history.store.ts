import { create } from "zustand";

export interface HistoryUIState {
  isPanelOpen: boolean;
  previewVersionId: string | null;
  setIsPanelOpen: (isOpen: boolean) => void;
  togglePanel: (forceOpen?: boolean) => void;
  openPreview: (versionId: string) => void;
  closePreview: () => void;
}

export const useHistoryStore = create<HistoryUIState>((set) => ({
  isPanelOpen: false,
  previewVersionId: null,
  setIsPanelOpen: (isOpen: boolean) => set({ isPanelOpen: isOpen }),
  togglePanel: (forceOpen?: boolean) =>
    set((state) => ({
      isPanelOpen:
        forceOpen !== undefined ? forceOpen : !state.isPanelOpen,
    })),
  openPreview: (versionId: string) =>
    set({
      previewVersionId: versionId,
    }),
  closePreview: () =>
    set({
      previewVersionId: null,
    }),
}));

export const useVersionHistoryStore = useHistoryStore;
