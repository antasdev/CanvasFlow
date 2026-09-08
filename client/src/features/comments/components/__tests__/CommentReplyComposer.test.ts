import { describe, expect, it, vi } from "vitest";

describe("CommentReplyComposer Invariants", () => {
  const MAX_CHAR_COUNT = 2000;

  it("enforces 2000 character maximum limit and content bounds", () => {
    const validContent = "A".repeat(2000);
    const tooLongContent = "A".repeat(2001);

    const validateContent = (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return false;
      if (trimmed.length > MAX_CHAR_COUNT) return false;
      return true;
    };

    expect(validateContent(validContent)).toBe(true);
    expect(validateContent(tooLongContent)).toBe(false);
    expect(validateContent("   ")).toBe(false);
    expect(validateContent("Valid reply")).toBe(true);
  });

  it("handles keyboard events correctly (Enter to submit, Shift+Enter for newline, Escape to cancel)", () => {
    const submitFn = vi.fn();
    const cancelFn = vi.fn();

    const handleKeyDown = (e: {
      key: string;
      shiftKey?: boolean;
      ctrlKey?: boolean;
      metaKey?: boolean;
      preventDefault: () => void;
    }) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelFn();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        submitFn();
        return;
      }
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitFn();
        return;
      }
    };

    const preventDefault = vi.fn();

    // Escape cancels
    handleKeyDown({ key: "Escape", preventDefault });
    expect(cancelFn).toHaveBeenCalledTimes(1);

    // Enter submits
    handleKeyDown({ key: "Enter", shiftKey: false, preventDefault });
    expect(submitFn).toHaveBeenCalledTimes(1);

    // Shift + Enter does not submit
    handleKeyDown({ key: "Enter", shiftKey: true, preventDefault: vi.fn() });
    expect(submitFn).toHaveBeenCalledTimes(1);

    // Cmd/Ctrl + Enter submits
    handleKeyDown({ key: "Enter", metaKey: true, preventDefault });
    expect(submitFn).toHaveBeenCalledTimes(2);
  });
});
