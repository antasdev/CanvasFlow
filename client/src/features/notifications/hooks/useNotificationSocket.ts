import { useEffect, useRef } from "react";

import { useAuthStore } from "@/store";
import { socketClientService } from "@/services/socket";

import { notificationApi } from "../api";
import { useNotificationStore } from "../store";
import type { Notification } from "../types";

export function useNotificationSocket(): void {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { addNotification, markAsRead, markAllAsRead, setUnreadCount, setNotifications } =
    useNotificationStore();

  const isInitialMount = useRef(true);

  useEffect(() => {
    if (!isAuthenticated) return;

    // Initial fetch on mount / auth
    void notificationApi
      .getUnreadCount()
      .then((count) => setUnreadCount(count))
      .catch((err) =>
        console.error("Failed to load initial unread count:", err)
      );

    // 1. New Notification Listener
    const unsubNew = socketClientService.onNotificationNew((payload) => {
      addNotification(payload.notification as unknown as Notification, payload.unreadCount);
    });

    // 2. Notification Read Listener
    const unsubRead = socketClientService.onNotificationRead((payload) => {
      markAsRead(payload.notificationId, payload.readAt, payload.unreadCount);
    });

    // 3. Notification All Read Listener
    const unsubAllRead = socketClientService.onNotificationAllRead((payload) => {
      markAllAsRead(payload.readAt, payload.unreadCount);
    });

    // 4. Notification Count Updated Listener
    const unsubCount = socketClientService.onNotificationCountUpdated((payload) => {
      setUnreadCount(payload.unreadCount);
    });

    // 5. Reconnect Recovery Listener
    const unsubState = socketClientService.onStateChange((state) => {
      if (state === "connected" && !isInitialMount.current) {
        // Reconnected -> fetch authoritative state to reconcile
        void notificationApi
          .getUnreadCount()
          .then((count) => setUnreadCount(count))
          .catch((err) =>
            console.error("Failed to recover unread count on reconnect:", err)
          );

        void notificationApi
          .getNotifications({ limit: 20 })
          .then((res) => {
            setNotifications(res.items, res.nextCursor, res.hasMore, false);
          })
          .catch((err) =>
            console.error("Failed to recover notifications on reconnect:", err)
          );
      }
    });

    isInitialMount.current = false;

    return () => {
      unsubNew();
      unsubRead();
      unsubAllRead();
      unsubCount();
      unsubState();
    };
  }, [
    isAuthenticated,
    addNotification,
    markAsRead,
    markAllAsRead,
    setUnreadCount,
    setNotifications,
  ]);
}
