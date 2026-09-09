import { create } from "zustand";

import type { Notification, NotificationFilterType } from "../types";

export interface NotificationStore {
  notifications: Record<string, Notification>;
  unreadCount: number;
  isOpen: boolean;
  filter: NotificationFilterType;
  isLoading: boolean;
  isLoadingMore: boolean;
  nextCursor: string | null;
  hasMore: boolean;

  // Actions
  setNotifications: (
    items: Notification[],
    nextCursor: string | null,
    hasMore: boolean,
    replace?: boolean
  ) => void;
  addNotification: (notification: Notification, unreadCount?: number) => void;
  setUnreadCount: (count: number) => void;
  markAsRead: (id: string, readAt?: string, unreadCount?: number) => void;
  markAllAsRead: (readAt?: string, unreadCount?: number) => void;
  setFilter: (filter: NotificationFilterType) => void;
  setIsOpen: (isOpen: boolean) => void;
  togglePanel: () => void;
  setIsLoading: (isLoading: boolean) => void;
  setIsLoadingMore: (isLoadingMore: boolean) => void;
  reset: () => void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: {},
  unreadCount: 0,
  isOpen: false,
  filter: "all",
  isLoading: false,
  isLoadingMore: false,
  nextCursor: null,
  hasMore: false,

  setNotifications: (
    items: Notification[],
    nextCursor: string | null,
    hasMore: boolean,
    replace = false
  ): void => {
    set((state) => {
      const nextMap: Record<string, Notification> = replace
        ? {}
        : { ...state.notifications };

      for (const item of items) {
        nextMap[item.id] = item;
      }

      return {
        notifications: nextMap,
        nextCursor,
        hasMore,
        isLoading: false,
        isLoadingMore: false,
      };
    });
  },

  addNotification: (notification: Notification, unreadCount?: number): void => {
    set((state) => {
      const existing = state.notifications[notification.id];
      const isNew = !existing;
      const willBeUnread = !notification.isRead;
      
      let newCount = state.unreadCount;
      if (unreadCount !== undefined) {
        newCount = unreadCount;
      } else if (isNew && willBeUnread) {
        newCount = state.unreadCount + 1;
      }

      return {
        notifications: {
          ...state.notifications,
          [notification.id]: notification,
        },
        unreadCount: Math.max(0, newCount),
      };
    });
  },

  setUnreadCount: (count: number): void => {
    set({ unreadCount: Math.max(0, count) });
  },

  markAsRead: (id: string, readAt?: string, unreadCount?: number): void => {
    set((state) => {
      const existing = state.notifications[id];
      if (!existing) {
        return unreadCount !== undefined
          ? { unreadCount: Math.max(0, unreadCount) }
          : state;
      }

      const wasUnread = !existing.isRead;
      const updatedTimestamp = readAt || new Date().toISOString();

      let newCount = state.unreadCount;
      if (unreadCount !== undefined) {
        newCount = unreadCount;
      } else if (wasUnread) {
        newCount = Math.max(0, state.unreadCount - 1);
      }

      return {
        notifications: {
          ...state.notifications,
          [id]: {
            ...existing,
            isRead: true,
            readAt: updatedTimestamp,
          },
        },
        unreadCount: newCount,
      };
    });
  },

  markAllAsRead: (readAt?: string, unreadCount?: number): void => {
    set((state) => {
      const timestamp = readAt || new Date().toISOString();
      const nextMap: Record<string, Notification> = {};

      for (const [id, notification] of Object.entries(state.notifications)) {
        nextMap[id] = {
          ...notification,
          isRead: true,
          readAt: notification.readAt || timestamp,
        };
      }

      return {
        notifications: nextMap,
        unreadCount: unreadCount !== undefined ? Math.max(0, unreadCount) : 0,
      };
    });
  },

  setFilter: (filter: NotificationFilterType): void => {
    set({ filter });
  },

  setIsOpen: (isOpen: boolean): void => {
    set({ isOpen });
  },

  togglePanel: (): void => {
    set((state) => ({ isOpen: !state.isOpen }));
  },

  setIsLoading: (isLoading: boolean): void => {
    set({ isLoading });
  },

  setIsLoadingMore: (isLoadingMore: boolean): void => {
    set({ isLoadingMore });
  },

  reset: (): void => {
    set({
      notifications: {},
      unreadCount: 0,
      isOpen: false,
      filter: "all",
      isLoading: false,
      isLoadingMore: false,
      nextCursor: null,
      hasMore: false,
    });
  },
}));
