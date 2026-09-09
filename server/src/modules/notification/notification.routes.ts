import { Router } from "express";

import {
  asyncHandler,
  authenticate,
  validate,
} from "@/shared/middlewares";

import { notificationController } from "./notification.controller";
import {
  getNotificationsSchema,
  markAsReadSchema,
} from "./notification.validation";

export const notificationRouter = Router();

/**
 * List paginated notifications for authenticated user
 * GET /api/v1/notifications
 */
notificationRouter.get(
  "/",
  authenticate,
  validate(getNotificationsSchema),
  asyncHandler(notificationController.getNotifications.bind(notificationController))
);

/**
 * Get authoritative unread notification count
 * GET /api/v1/notifications/unread-count
 */
notificationRouter.get(
  "/unread-count",
  authenticate,
  asyncHandler(notificationController.getUnreadCount.bind(notificationController))
);

/**
 * Mark all notifications as read for authenticated user
 * PATCH /api/v1/notifications/read-all
 */
notificationRouter.patch(
  "/read-all",
  authenticate,
  asyncHandler(notificationController.markAllAsRead.bind(notificationController))
);

/**
 * Mark a specific notification as read
 * PATCH /api/v1/notifications/:id/read
 */
notificationRouter.patch(
  "/:id/read",
  authenticate,
  validate(markAsReadSchema),
  asyncHandler(notificationController.markAsRead.bind(notificationController))
);
