import { create } from "zustand";

export interface OpenExportOptions {
  boardName?: string;
}

export interface ExportDialogState {
  isOpen: boolean;
  boardName?: string;

  openExport: (options?: OpenExportOptions) => void;
  closeExport: () => void;
  toggleExport: (options?: OpenExportOptions) => void;
}

export const useExportDialogStore = create<ExportDialogState>((set) => ({
  isOpen: false,
  boardName: undefined,

  openExport: (options?: OpenExportOptions): void => {
    set({
      isOpen: true,
      boardName: options?.boardName,
    });
  },

  closeExport: (): void => {
    set({ isOpen: false });
  },

  toggleExport: (options?: OpenExportOptions): void => {
    set((state) => ({
      isOpen: !state.isOpen,
      boardName: !state.isOpen ? options?.boardName : state.boardName,
    }));
  },
}));
