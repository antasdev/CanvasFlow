import { describe, it, expect, beforeEach } from "vitest";
import { useExportDialogStore } from "../store/export-dialog.store";

describe("ExportButton Logic & State Integration (Slice 48)", () => {
  beforeEach(() => {
    useExportDialogStore.setState({
      isOpen: false,
      boardName: undefined,
    });
  });

  it("should open export dialog with boardName on trigger", () => {
    const handleButtonClick = (boardName?: string): void => {
      useExportDialogStore.getState().openExport({ boardName });
    };

    expect(useExportDialogStore.getState().isOpen).toBe(false);

    handleButtonClick("Sprint Planning Board");

    expect(useExportDialogStore.getState().isOpen).toBe(true);
    expect(useExportDialogStore.getState().boardName).toBe("Sprint Planning Board");
  });

  it("should support triggering without boardName fallback", () => {
    const handleButtonClick = (boardName?: string): void => {
      useExportDialogStore.getState().openExport({ boardName });
    };

    handleButtonClick();

    expect(useExportDialogStore.getState().isOpen).toBe(true);
    expect(useExportDialogStore.getState().boardName).toBeUndefined();
  });
});
