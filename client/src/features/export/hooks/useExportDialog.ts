import { useExportDialogStore, type OpenExportOptions } from "../store/export-dialog.store";

export interface UseExportDialogReturn {
  isOpen: boolean;
  boardName?: string;
  openExport: (options?: OpenExportOptions) => void;
  closeExport: () => void;
  toggleExport: (options?: OpenExportOptions) => void;
}

export function useExportDialog(): UseExportDialogReturn {
  const isOpen = useExportDialogStore((state) => state.isOpen);
  const boardName = useExportDialogStore((state) => state.boardName);
  const openExport = useExportDialogStore((state) => state.openExport);
  const closeExport = useExportDialogStore((state) => state.closeExport);
  const toggleExport = useExportDialogStore((state) => state.toggleExport);

  return {
    isOpen,
    boardName,
    openExport,
    closeExport,
    toggleExport,
  };
}
