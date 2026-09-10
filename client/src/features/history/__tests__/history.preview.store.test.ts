import { beforeEach, describe, expect, it } from "vitest";

import { useHistoryStore } from "../store";

describe("History Store Preview State (useHistoryStore)", () => {
  beforeEach(() => {
    useHistoryStore.setState({
      isPanelOpen: false,
      previewVersionId: null,
    });
  });

  it("initializes with previewVersionId null and panel closed", () => {
    const state = useHistoryStore.getState();
    expect(state.previewVersionId).toBeNull();
    expect(state.isPanelOpen).toBe(false);
  });

  it("opens preview for a specific version ID", () => {
    useHistoryStore.getState().openPreview("v-101");
    expect(useHistoryStore.getState().previewVersionId).toBe("v-101");
  });

  it("closes preview resetting previewVersionId to null", () => {
    useHistoryStore.getState().openPreview("v-101");
    expect(useHistoryStore.getState().previewVersionId).toBe("v-101");

    useHistoryStore.getState().closePreview();
    expect(useHistoryStore.getState().previewVersionId).toBeNull();
  });

  it("switches preview version IDs safely on rapid user clicks", () => {
    useHistoryStore.getState().openPreview("v-101");
    expect(useHistoryStore.getState().previewVersionId).toBe("v-101");

    useHistoryStore.getState().openPreview("v-102");
    expect(useHistoryStore.getState().previewVersionId).toBe("v-102");

    useHistoryStore.getState().openPreview("v-105");
    expect(useHistoryStore.getState().previewVersionId).toBe("v-105");

    useHistoryStore.getState().closePreview();
    expect(useHistoryStore.getState().previewVersionId).toBeNull();
  });

  it("preserves panel open state when previewing a version", () => {
    useHistoryStore.getState().togglePanel(true);
    expect(useHistoryStore.getState().isPanelOpen).toBe(true);

    useHistoryStore.getState().openPreview("v-200");
    expect(useHistoryStore.getState().isPanelOpen).toBe(true);
    expect(useHistoryStore.getState().previewVersionId).toBe("v-200");

    useHistoryStore.getState().closePreview();
    expect(useHistoryStore.getState().isPanelOpen).toBe(true);
    expect(useHistoryStore.getState().previewVersionId).toBeNull();
  });
});
