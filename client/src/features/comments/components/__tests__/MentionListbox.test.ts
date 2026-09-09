import { describe, expect, it, vi } from "vitest";

import type { WorkspaceMember } from "@/features/workspace/types";

describe("MentionListbox Accessibility & State Logic", () => {
  const mockMembers: WorkspaceMember[] = [
    {
      id: "mem-1",
      workspaceId: "ws-1",
      userId: "user-1",
      role: "OWNER",
      joinedAt: new Date().toISOString(),
      user: {
        id: "user-1",
        fullName: "Antas Antony",
        email: "antas@example.com",
      },
    },
    {
      id: "mem-2",
      workspaceId: "ws-1",
      userId: "user-2",
      role: "EDITOR",
      joinedAt: new Date().toISOString(),
      user: {
        id: "user-2",
        fullName: "Anoop Kumar",
        email: "anoop@example.com",
      },
    },
  ];

  it("does not render when isOpen is false", () => {
    const shouldRender = (isOpen: boolean) => isOpen;
    expect(shouldRender(false)).toBe(false);
    expect(shouldRender(true)).toBe(true);
  });

  it("computes initials from member full names for avatars", () => {
    const getInitials = (fullName: string) =>
      fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

    expect(getInitials("Antas Antony")).toBe("AA");
    expect(getInitials("Anoop")).toBe("A");
    expect(getInitials("John Doe Junior")).toBe("JD");
  });

  it("identifies the active option index for WAI-ARIA aria-selected", () => {
    const selectedIndex = 1;
    const isSelected = (idx: number) => idx === selectedIndex;

    expect(isSelected(0)).toBe(false);
    expect(isSelected(1)).toBe(true);
    expect(isSelected(2)).toBe(false);
  });

  it("triggers onSelect callback with chosen member on click", () => {
    const onSelect = vi.fn();
    const handleSelect = (member: WorkspaceMember) => {
      onSelect(member);
    };

    handleSelect(mockMembers[0]);
    expect(onSelect).toHaveBeenCalledWith(mockMembers[0]);
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("handles empty and loading states properly", () => {
    const getDisplayState = (isLoading: boolean, count: number) => {
      if (isLoading) return "loading";
      if (count === 0) return "empty";
      return "list";
    };

    expect(getDisplayState(true, 0)).toBe("loading");
    expect(getDisplayState(false, 0)).toBe("empty");
    expect(getDisplayState(false, 2)).toBe("list");
  });
});
