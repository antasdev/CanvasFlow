import { describe, it, expect, beforeEach } from "vitest";
import { useExportDialogStore } from "../store/export-dialog.store";

describe("useExportDialogStore (Slice 48)", () => {
  beforeEach(() => {
    useExportDialogStore.setState({
      isOpen: false,
      boardName: undefined,
    });
  });

  it("should have correct initial state", () => {
    const state = useExportDialogStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.boardName).toBeUndefined();
  });

  it("should open export dialog with options", () => {
    useExportDialogStore.getState().openExport({ boardName: "My Project" });
    const state = useExportDialogStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.boardName).toBe("My Project");
  });

  it("should close export dialog", () => {
    useExportDialogStore.getState().openExport({ boardName: "My Project" });
    expect(useExportDialogStore.getState().isOpen).toBe(true);

    useExportDialogStore.getState().closeExport();
    expect(useExportDialogStore.getState().isOpen).toBe(false);
  });

  it("should toggle export dialog state", () => {
    useExportDialogStore.getState().toggleExport({ boardName: "Toggle Test" });
    expect(useExportDialogStore.getState().isOpen).toBe(true);
    expect(useExportDialogStore.getState().boardName).toBe("Toggle Test");

    useExportDialogStore.getState().toggleExport();
    expect(useExportDialogStore.getState().isOpen).toBe(false);
  });
});
