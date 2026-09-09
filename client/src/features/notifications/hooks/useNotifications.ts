import { useCallback, useMemo } from "react";

import { notificationApi } from "../api";
import { useNotificationStore } from "../store";
import type { Notification, NotificationFilterType } from "../types";

export interface UseNotificationsResult {
  notifications: Notification[];
  unreadCount: number;
  isOpen: boolean;
  filter: NotificationFilterType;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  fetchNotifications: (replace?: boolean) => Promise<void>;
  fetchMore: () => Promise<void>;
  fetchUnreadCount: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  setFilter: (filter: NotificationFilterType) => void;
  setIsOpen: (isOpen: boolean) => void;
  togglePanel: () => void;
}

export function useNotifications(): UseNotificationsResult {
  const {
    notifications: notificationsMap,
    unreadCount,
    isOpen,
    filter,
    isLoading,
    isLoadingMore,
    nextCursor,
    hasMore,
    setNotifications,
    setUnreadCount,
    markAsRead: storeMarkAsRead,
    markAllAsRead: storeMarkAllAsRead,
    setFilter,
    setIsOpen,
    togglePanel,
    setIsLoading,
    setIsLoadingMore,
  } = useNotificationStore();

  const fetchNotifications = useCallback(
    async (replace = true): Promise<void> => {
      setIsLoading(true);
      try {
        const response = await notificationApi.getNotifications({
          limit: 20,
          unreadOnly: filter === "unread",
        });
        setNotifications(
          response.items,
          response.nextCursor,
          response.hasMore,
          replace
        );
      } catch (error) {
        console.error("Failed to fetch notifications:", error);
      } finally {
        setIsLoading(false);
      }
    },
    [filter, setIsLoading, setNotifications]
  );

  const fetchMore = useCallback(async (): Promise<void> => {
    if (!hasMore || !nextCursor || isLoadingMore) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const response = await notificationApi.getNotifications({
        limit: 20,
        cursor: nextCursor,
        unreadOnly: filter === "unread",
      });
      setNotifications(
        response.items,
        response.nextCursor,
        response.hasMore,
        false
      );
    } catch (error) {
      console.error("Failed to fetch more notifications:", error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [hasMore, nextCursor, isLoadingMore, filter, setIsLoadingMore, setNotifications]);

  const fetchUnreadCount = useCallback(async (): Promise<void> => {
    try {
      const count = await notificationApi.getUnreadCount();
      setUnreadCount(count);
    } catch (error) {
      console.error("Failed to fetch unread notification count:", error);
    }
  }, [setUnreadCount]);

  const markAsRead = useCallback(
    async (id: string): Promise<void> => {
      // Optimistic update
      storeMarkAsRead(id);
      try {
        const updated = await notificationApi.markAsRead(id);
        storeMarkAsRead(id, updated.readAt || undefined);
      } catch (error) {
        console.error("Failed to mark notification as read:", error);
      }
    },
    [storeMarkAsRead]
  );

  const markAllAsRead = useCallback(async (): Promise<void> => {
    // Optimistic update
    storeMarkAllAsRead();
    try {
      const result = await notificationApi.markAllAsRead();
      storeMarkAllAsRead(result.readAt);
    } catch (error) {
      console.error("Failed to mark all notifications as read:", error);
    }
  }, [storeMarkAllAsRead]);

  // Derive sorted & filtered list
  const sortedNotifications = useMemo(() => {
    const list = Object.values(notificationsMap);
    const filtered =
      filter === "unread" ? list.filter((item) => !item.isRead) : list;

    return filtered.sort((a, b) => {
      const timeDiff =
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (timeDiff !== 0) return timeDiff;
      return b.id.localeCompare(a.id);
    });
  }, [notificationsMap, filter]);

  return {
    notifications: sortedNotifications,
    unreadCount,
    isOpen,
    filter,
    isLoading,
    isLoadingMore,
    hasMore,
    fetchNotifications,
    fetchMore,
    fetchUnreadCount,
    markAsRead,
    markAllAsRead,
    setFilter,
    setIsOpen,
    togglePanel,
  };
}
