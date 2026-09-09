import { Request, Response } from "express";
import { Types } from "mongoose";

import { HttpStatus } from "@/shared/constants";
import { notificationService } from "./notification.service";
import { GetNotificationsQueryDto } from "./notification.dto";

export class NotificationController {
  async getNotifications(req: Request, res: Response): Promise<void> {
    const recipientId = new Types.ObjectId(req.user!.userId);

    const queryDto: GetNotificationsQueryDto = {
      cursor: req.query.cursor as string | undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      unreadOnly:
        req.query.unreadOnly === "true"
          ? true
          : req.query.unreadOnly === "false"
            ? false
            : undefined,
    };

    const result = await notificationService.getNotifications(
      recipientId,
      queryDto
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data: result,
    });
  }

  async getUnreadCount(req: Request, res: Response): Promise<void> {
    const recipientId = new Types.ObjectId(req.user!.userId);
    const result = await notificationService.getUnreadCount(recipientId);

    res.status(HttpStatus.OK).json({
      success: true,
      data: result,
    });
  }

  async markAsRead(req: Request, res: Response): Promise<void> {
    const recipientId = new Types.ObjectId(req.user!.userId);
    const notificationId = new Types.ObjectId(req.params.id as string);

    const result = await notificationService.markAsRead(
      notificationId,
      recipientId
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data: result,
    });
  }

  async markAllAsRead(req: Request, res: Response): Promise<void> {
    const recipientId = new Types.ObjectId(req.user!.userId);
    const result = await notificationService.markAllAsRead(recipientId);

    res.status(HttpStatus.OK).json({
      success: true,
      data: result,
      message: "All notifications marked as read.",
    });
  }
}

export const notificationController = new NotificationController();
