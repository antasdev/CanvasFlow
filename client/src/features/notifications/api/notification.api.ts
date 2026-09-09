import { api } from "@/services/api";

import type {
  Notification,
  NotificationListResponse,
  NotificationQueryParams,
  UnreadCountResponse,
} from "../types";

type NotificationListApiResponse = {
  success: boolean;
  data: NotificationListResponse;
};

type SingleNotificationApiResponse = {
  success: boolean;
  data: Notification;
};

type UnreadCountApiResponse = {
  success: boolean;
  data: UnreadCountResponse;
};

type ReadAllApiResponse = {
  success: boolean;
  data: {
    count: number;
    readAt: string;
  };
};

export const notificationApi = {
  /**
   * Fetches paginated notifications for the authenticated user.
   */
  async getNotifications(
    params?: NotificationQueryParams
  ): Promise<NotificationListResponse> {
    const queryParams = new URLSearchParams();
    if (params?.limit) {
      queryParams.set("limit", String(params.limit));
    }
    if (params?.cursor) {
      queryParams.set("cursor", params.cursor);
    }
    if (params?.unreadOnly !== undefined) {
      queryParams.set("unreadOnly", String(params.unreadOnly));
    }

    const queryString = queryParams.toString();
    const endpoint = `/notifications${queryString ? `?${queryString}` : ""}`;

    const response = await api.get<NotificationListApiResponse>(endpoint);
    return response.data.data;
  },

  /**
   * Fetches the authoritative unread notification count for the authenticated user.
   */
  async getUnreadCount(): Promise<number> {
    const response = await api.get<UnreadCountApiResponse>(
      "/notifications/unread-count"
    );
    return response.data.data.unreadCount;
  },

  /**
   * Marks a specific notification as read.
   */
  async markAsRead(id: string): Promise<Notification> {
    const response = await api.patch<SingleNotificationApiResponse>(
      `/notifications/${id}/read`
    );
    return response.data.data;
  },

  /**
   * Marks all notifications for the authenticated user as read.
   */
  async markAllAsRead(): Promise<{ count: number; readAt: string }> {
    const response = await api.patch<ReadAllApiResponse>(
      "/notifications/read-all"
    );
    return response.data.data;
  },
};
