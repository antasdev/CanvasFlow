import { describe, expect, it } from "vitest";

import { reconcileMentions } from "../useMentionAutocomplete";
import type { CommentMention } from "../../types";

describe("reconcileMentions Utility", () => {
  it("preserves valid mentions that match content text slices", () => {
    const content = "Hello @Antas and @Anoop, please review.";
    const mentions: CommentMention[] = [
      {
        userId: "user-1",
        displayName: "Antas",
        startIndex: 6,
        endIndex: 12,
      },
      {
        userId: "user-2",
        displayName: "Anoop",
        startIndex: 17,
        endIndex: 23,
      },
    ];

    const result = reconcileMentions(content, mentions);
    expect(result).toHaveLength(2);
    expect(result[0].displayName).toBe("Antas");
    expect(result[1].displayName).toBe("Anoop");
  });

  it("removes mentions when user edits or deletes the mention text slice", () => {
    const content = "Hello Antas and @Anoop, please review."; // @ removed from Antas
    const mentions: CommentMention[] = [
      {
        userId: "user-1",
        displayName: "Antas",
        startIndex: 6,
        endIndex: 12, // slice is "Antas " instead of "@Antas"
      },
      {
        userId: "user-2",
        displayName: "Anoop",
        startIndex: 16,
        endIndex: 22,
      },
    ];

    const result = reconcileMentions(content, mentions);
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe("Anoop");
  });

  it("removes out-of-bounds mentions if content is truncated", () => {
    const truncatedContent = "Hello";
    const mentions: CommentMention[] = [
      {
        userId: "user-1",
        displayName: "Antas",
        startIndex: 6,
        endIndex: 12,
      },
    ];

    const result = reconcileMentions(truncatedContent, mentions);
    expect(result).toHaveLength(0);
  });

  it("handles empty mentions array gracefully", () => {
    expect(reconcileMentions("Some content", [])).toEqual([]);
  });

  it("handles duplicate mentions of the same user with distinct ranges", () => {
    const content = "@Antas please ask @Antas again";
    const mentions: CommentMention[] = [
      {
        userId: "user-1",
        displayName: "Antas",
        startIndex: 0,
        endIndex: 6,
      },
      {
        userId: "user-1",
        displayName: "Antas",
        startIndex: 18,
        endIndex: 24,
      },
    ];

    const result = reconcileMentions(content, mentions);
    expect(result).toHaveLength(2);
    expect(result[0].startIndex).toBe(0);
    expect(result[1].startIndex).toBe(18);
  });
});
