import { describe, expect, it } from "vitest";

import { NotificationType, type Notification } from "../types";

describe("Notification Component Helpers & Invariants", () => {
  const mockMentionNotification: Notification = {
    id: "notif-mention",
    recipientId: "user-1",
    type: NotificationType.MENTION,
    actorId: "actor-1",
    actor: {
      id: "actor-1",
      name: "Alice Cooper",
      email: "alice@example.com",
    },
    metadata: {
      boardId: "board-101",
      canvasId: "canvas-202",
      commentId: "comment-303",
    },
    isRead: false,
    readAt: null,
    createdAt: "2026-09-09T10:00:00.000Z",
    updatedAt: "2026-09-09T10:00:00.000Z",
  };

  const mockReplyNotification: Notification = {
    id: "notif-reply",
    recipientId: "user-1",
    type: NotificationType.COMMENT_REPLY,
    actorId: "actor-2",
    actor: {
      id: "actor-2",
      name: "Bob Dylan",
      email: "bob@example.com",
    },
    metadata: {
      boardId: "board-101",
      canvasId: "canvas-202",
      commentId: "reply-404",
      rootCommentId: "comment-303",
    },
    isRead: false,
    readAt: null,
    createdAt: "2026-09-09T10:05:00.000Z",
    updatedAt: "2026-09-09T10:05:00.000Z",
  };

  const mockThreadActivityNotification: Notification = {
    id: "notif-activity",
    recipientId: "user-1",
    type: NotificationType.THREAD_ACTIVITY,
    actorId: "actor-3",
    actor: {
      id: "actor-3",
      name: "Charlie Parker",
      email: "charlie@example.com",
    },
    metadata: {
      boardId: "board-101",
      canvasId: "canvas-202",
      commentId: "comment-303",
      resolved: true,
    },
    isRead: true,
    readAt: "2026-09-09T10:10:00.000Z",
    createdAt: "2026-09-09T10:08:00.000Z",
    updatedAt: "2026-09-09T10:10:00.000Z",
  };

  it("extracts actor initials correctly", () => {
    const getInitials = (name?: string): string => {
      return (name || "?")
        .split(" ")
        .map((part) => part[0])
        .join("")
        .substring(0, 2)
        .toUpperCase();
    };

    expect(getInitials("Alice Cooper")).toBe("AC");
    expect(getInitials("Bob")).toBe("B");
    expect(getInitials("")).toBe("?");
    expect(getInitials(undefined)).toBe("?");
  });

  it("formats badge counts with 99+ threshold", () => {
    const formatBadge = (count: number, max = 99): string | null => {
      if (count <= 0) return null;
      return count > max ? `${max}+` : count.toString();
    };

    expect(formatBadge(0)).toBeNull();
    expect(formatBadge(-5)).toBeNull();
    expect(formatBadge(5)).toBe("5");
    expect(formatBadge(99)).toBe("99");
    expect(formatBadge(100)).toBe("99+");
    expect(formatBadge(500)).toBe("99+");
  });

  it("constructs target navigation URL and thread IDs correctly", () => {
    const getNavigationTarget = (
      notif: Notification
    ): { targetUrl: string; threadId: string | undefined } => {
      const { boardId, commentId, rootCommentId } = notif.metadata;
      const targetThreadId = (rootCommentId || commentId) as string | undefined;
      const targetUrl = `/boards/${boardId}${
        targetThreadId ? `?commentId=${targetThreadId}` : ""
      }`;
      return { targetUrl, threadId: targetThreadId };
    };

    const mentionNav = getNavigationTarget(mockMentionNotification);
    expect(mentionNav.targetUrl).toBe("/boards/board-101?commentId=comment-303");
    expect(mentionNav.threadId).toBe("comment-303");

    const replyNav = getNavigationTarget(mockReplyNotification);
    expect(replyNav.targetUrl).toBe("/boards/board-101?commentId=comment-303");
    expect(replyNav.threadId).toBe("comment-303");

    const activityNav = getNavigationTarget(mockThreadActivityNotification);
    expect(activityNav.targetUrl).toBe("/boards/board-101?commentId=comment-303");
    expect(activityNav.threadId).toBe("comment-303");
  });

  it("filters and sorts notifications by createdAt descending", () => {
    const notifications = [
      mockMentionNotification, // 10:00
      mockThreadActivityNotification, // 10:08
      mockReplyNotification, // 10:05
    ];

    const sortNotifications = (items: Notification[]): Notification[] => {
      return [...items].sort((a, b) => {
        const timeDiff =
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        if (timeDiff !== 0) return timeDiff;
        return b.id.localeCompare(a.id);
      });
    };

    const sorted = sortNotifications(notifications);
    expect(sorted[0].id).toBe("notif-activity"); // 10:08
    expect(sorted[1].id).toBe("notif-reply"); // 10:05
    expect(sorted[2].id).toBe("notif-mention"); // 10:00

    // Unread filter
    const unread = sorted.filter((n) => !n.isRead);
    expect(unread.length).toBe(2);
    expect(unread.map((n) => n.id)).toEqual(["notif-reply", "notif-mention"]);
  });
});
