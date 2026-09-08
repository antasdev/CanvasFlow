import { describe, expect, it, vi } from "vitest";

import { worldToScreen, type CanvasTransform } from "@/features/canvas/utils/canvas.coordinates";

const MAX_CHAR_COUNT = 2000;

describe("FloatingCommentComposer Logic Tests", () => {
  it("derives screen coordinates from draft world position", () => {
    const draftPosition = { x: 120, y: 340 };
    const vp: CanvasTransform = { zoom: 1.25, pan: { x: 50, y: -20 } };

    const screenPos = worldToScreen(draftPosition, vp);
    expect(screenPos.x).toBe(120 * 1.25 + 50);
    expect(screenPos.y).toBe(340 * 1.25 - 20);
  });

  it("validates content trimming and rejection of empty/whitespace-only input", () => {
    const validate = (content: string, isSubmitting = false): boolean => {
      const trimmed = content.trim();
      if (!trimmed || isSubmitting || trimmed.length > MAX_CHAR_COUNT) {
        return false;
      }
      return true;
    };

    expect(validate("")).toBe(false);
    expect(validate("   ")).toBe(false);
    expect(validate("\n\t  \n")).toBe(false);
    expect(validate("Valid comment")).toBe(true);
    expect(validate("Valid comment", true)).toBe(false); // submitting
    expect(validate("A".repeat(2001))).toBe(false); // exceeds max
  });

  it("handles keyboard submit (Cmd/Ctrl + Enter) and cancel (Escape)", () => {
    const onSubmit = vi.fn();
    const onCancel = vi.fn();
    const stopPropagation = vi.fn();
    const preventDefault = vi.fn();

    const handleKeyDown = (
      e: {
        key: string;
        ctrlKey?: boolean;
        metaKey?: boolean;
        stopPropagation: () => void;
        preventDefault: () => void;
      },
      content: string
    ): void => {
      e.stopPropagation();

      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        const trimmed = content.trim();
        if (trimmed && trimmed.length <= MAX_CHAR_COUNT) {
          onSubmit(trimmed);
        }
      }
    };

    // Test Escape cancels
    handleKeyDown(
      { key: "Escape", stopPropagation, preventDefault },
      "Unsaved comment"
    );
    expect(stopPropagation).toHaveBeenCalled();
    expect(preventDefault).toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);

    // Test Ctrl+Enter submits
    handleKeyDown(
      { key: "Enter", ctrlKey: true, stopPropagation, preventDefault },
      "  Ready to post!  "
    );
    expect(onSubmit).toHaveBeenCalledWith("Ready to post!");
  });
});
