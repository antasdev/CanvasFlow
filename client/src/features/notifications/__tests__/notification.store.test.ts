import { beforeEach, describe, expect, it } from "vitest";

import { useNotificationStore } from "../store";
import { NotificationType, type Notification } from "../types";

describe("Notification Zustand Store", () => {
  const mockNotification1: Notification = {
    id: "notif-1",
    recipientId: "user-1",
    type: NotificationType.MENTION,
    actorId: "actor-1",
    actor: {
      id: "actor-1",
      name: "Alice Cooper",
      email: "alice@example.com",
    },
    metadata: {
      boardId: "board-1",
      canvasId: "canvas-1",
      commentId: "comment-1",
    },
    isRead: false,
    readAt: null,
    createdAt: "2026-09-09T10:00:00.000Z",
    updatedAt: "2026-09-09T10:00:00.000Z",
  };

  const mockNotification2: Notification = {
    id: "notif-2",
    recipientId: "user-1",
    type: NotificationType.COMMENT_REPLY,
    actorId: "actor-2",
    actor: {
      id: "actor-2",
      name: "Bob Builder",
      email: "bob@example.com",
    },
    metadata: {
      boardId: "board-1",
      canvasId: "canvas-1",
      commentId: "reply-1",
      rootCommentId: "comment-1",
    },
    isRead: false,
    readAt: null,
    createdAt: "2026-09-09T10:05:00.000Z",
    updatedAt: "2026-09-09T10:05:00.000Z",
  };

  beforeEach(() => {
    useNotificationStore.getState().reset();
  });

  it("initializes with clean default state", () => {
    const state = useNotificationStore.getState();
    expect(state.notifications).toEqual({});
    expect(state.unreadCount).toBe(0);
    expect(state.isOpen).toBe(false);
    expect(state.filter).toBe("all");
    expect(state.hasMore).toBe(false);
  });

  it("adds a single notification and increments unreadCount when unread", () => {
    const store = useNotificationStore.getState();
    store.addNotification(mockNotification1);

    const updated = useNotificationStore.getState();
    expect(updated.notifications["notif-1"]).toBeDefined();
    expect(updated.notifications["notif-1"].type).toBe(NotificationType.MENTION);
    expect(updated.unreadCount).toBe(1);
  });

  it("deduplicates notifications with same ID without double incrementing unreadCount", () => {
    const store = useNotificationStore.getState();
    store.addNotification(mockNotification1);
    store.addNotification(mockNotification1);

    const updated = useNotificationStore.getState();
    expect(Object.keys(updated.notifications).length).toBe(1);
    expect(updated.unreadCount).toBe(1);
  });

  it("sets notifications batch with replace option", () => {
    const store = useNotificationStore.getState();
    store.setNotifications([mockNotification1], "cursor-1", true, true);

    let state = useNotificationStore.getState();
    expect(Object.keys(state.notifications).length).toBe(1);
    expect(state.nextCursor).toBe("cursor-1");
    expect(state.hasMore).toBe(true);

    // Replace with notification 2
    store.setNotifications([mockNotification2], null, false, true);
    state = useNotificationStore.getState();
    expect(Object.keys(state.notifications).length).toBe(1);
    expect(state.notifications["notif-2"]).toBeDefined();
    expect(state.notifications["notif-1"]).toBeUndefined();
    expect(state.hasMore).toBe(false);
  });

  it("marks a single notification as read and decrements unreadCount", () => {
    const store = useNotificationStore.getState();
    store.addNotification(mockNotification1);
    store.addNotification(mockNotification2);

    expect(useNotificationStore.getState().unreadCount).toBe(2);

    store.markAsRead("notif-1", "2026-09-09T10:10:00.000Z");

    const state = useNotificationStore.getState();
    expect(state.notifications["notif-1"].isRead).toBe(true);
    expect(state.notifications["notif-1"].readAt).toBe("2026-09-09T10:10:00.000Z");
    expect(state.notifications["notif-2"].isRead).toBe(false);
    expect(state.unreadCount).toBe(1);

    // Marking already-read notification does not decrement again
    store.markAsRead("notif-1");
    expect(useNotificationStore.getState().unreadCount).toBe(1);
  });

  it("marks all notifications as read and zeroes unreadCount", () => {
    const store = useNotificationStore.getState();
    store.addNotification(mockNotification1);
    store.addNotification(mockNotification2);

    expect(useNotificationStore.getState().unreadCount).toBe(2);

    store.markAllAsRead("2026-09-09T10:15:00.000Z");

    const state = useNotificationStore.getState();
    expect(state.notifications["notif-1"].isRead).toBe(true);
    expect(state.notifications["notif-2"].isRead).toBe(true);
    expect(state.unreadCount).toBe(0);
  });

  it("toggles and updates panel and filter states", () => {
    const store = useNotificationStore.getState();
    expect(store.isOpen).toBe(false);

    store.togglePanel();
    expect(useNotificationStore.getState().isOpen).toBe(true);

    store.setIsOpen(false);
    expect(useNotificationStore.getState().isOpen).toBe(false);

    store.setFilter("unread");
    expect(useNotificationStore.getState().filter).toBe("unread");
  });
});
