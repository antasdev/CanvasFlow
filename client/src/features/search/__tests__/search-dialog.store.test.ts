import { describe, expect, it, beforeEach } from "vitest";
import { useSearchDialogStore } from "../store/search-dialog.store";

describe("search-dialog.store", () => {
  beforeEach(() => {
    useSearchDialogStore.setState({
      isOpen: false,
      scope: "workspace",
      workspaceId: undefined,
      boardId: undefined,
      workspaceName: undefined,
      boardName: undefined,
      contextualScope: { scope: "workspace" },
    });
  });

  it("initializes with default closed state and workspace scope", () => {
    const state = useSearchDialogStore.getState();
    expect(state.isOpen).toBe(false);
    expect(state.scope).toBe("workspace");
    expect(state.workspaceId).toBeUndefined();
    expect(state.boardId).toBeUndefined();
  });

  it("opens search with contextual scope when no options are provided", () => {
    useSearchDialogStore.getState().setContextualScope({
      scope: "board",
      boardId: "board-123",
      workspaceId: "ws-456",
      boardName: "Sprint Planning",
      workspaceName: "Engineering",
    });

    useSearchDialogStore.getState().openSearch();

    const state = useSearchDialogStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.scope).toBe("board");
    expect(state.boardId).toBe("board-123");
    expect(state.workspaceId).toBe("ws-456");
    expect(state.boardName).toBe("Sprint Planning");
    expect(state.workspaceName).toBe("Engineering");
  });

  it("opens search with explicit override options", () => {
    useSearchDialogStore.getState().openSearch({
      scope: "workspace",
      workspaceId: "ws-999",
      workspaceName: "Design System",
    });

    const state = useSearchDialogStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.scope).toBe("workspace");
    expect(state.workspaceId).toBe("ws-999");
    expect(state.boardId).toBeUndefined();
    expect(state.workspaceName).toBe("Design System");
  });

  it("closes search and preserves contextual scope", () => {
    useSearchDialogStore.getState().openSearch({
      scope: "board",
      boardId: "board-123",
    });
    expect(useSearchDialogStore.getState().isOpen).toBe(true);

    useSearchDialogStore.getState().closeSearch();
    expect(useSearchDialogStore.getState().isOpen).toBe(false);
  });

  it("toggles search state on and off", () => {
    expect(useSearchDialogStore.getState().isOpen).toBe(false);

    useSearchDialogStore.getState().toggleSearch({
      scope: "board",
      boardId: "board-1",
    });
    expect(useSearchDialogStore.getState().isOpen).toBe(true);
    expect(useSearchDialogStore.getState().boardId).toBe("board-1");

    useSearchDialogStore.getState().toggleSearch();
    expect(useSearchDialogStore.getState().isOpen).toBe(false);
  });

  it("allows updating manual scope filter while preserving contextual scope", () => {
    useSearchDialogStore.getState().openSearch({
      scope: "board",
      boardId: "board-1",
      workspaceId: "ws-1",
    });

    useSearchDialogStore.getState().setScope("workspace");
    expect(useSearchDialogStore.getState().scope).toBe("workspace");
    expect(useSearchDialogStore.getState().workspaceId).toBe("ws-1");
  });
});
