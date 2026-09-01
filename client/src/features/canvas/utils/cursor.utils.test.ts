import { describe, expect, it } from "vitest";

import {
  CURSOR_PALETTE,
  getCursorColor,
  getCursorLabel,
} from "./cursor.utils";

describe("cursor.utils", () => {
  it("always returns the identical color for the same userId (deterministic hashing)", () => {
    const userId1 = "671234567890abcdef123456";
    const colorA = getCursorColor(userId1);
    const colorB = getCursorColor(userId1);

    expect(colorA).toBe(colorB);
  });

  it("returns a color from the predefined high-contrast CURSOR_PALETTE", () => {
    const testIds = [
      "user-1",
      "user-2",
      "user-3",
      "671234567890abcdef123456",
      "671234567890abcdef123457",
    ];

    testIds.forEach((id) => {
      const color = getCursorColor(id);
      expect(CURSOR_PALETTE).toContain(color);
    });
  });

  it("handles empty or falsy userId gracefully", () => {
    expect(getCursorColor("")).toBe(CURSOR_PALETTE[0]);
    expect(getCursorLabel("")).toBe("Collaborator");
  });

  it("formats short and friendly user labels correctly", () => {
    expect(getCursorLabel("user")).toBe("User user");
    expect(getCursorLabel("671234567890abcdef123456")).toBe("User 3456");
  });
});
