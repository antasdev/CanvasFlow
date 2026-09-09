import { ClientSession, Types } from "mongoose";

import { NotificationDocument, NotificationModel } from "./notification.model";
import { CreateNotificationData } from "./notification.types";

export class NotificationRepository {
  async create(
    data: CreateNotificationData,
    session?: ClientSession
  ): Promise<NotificationDocument> {
    const [notification] = await NotificationModel.create([data], { session });
    return notification;
  }

  async createMany(
    items: CreateNotificationData[],
    session?: ClientSession
  ): Promise<NotificationDocument[]> {
    if (items.length === 0) return [];
    return NotificationModel.create(items, { session });
  }

  async findById(
    id: Types.ObjectId,
    recipientId?: Types.ObjectId
  ): Promise<NotificationDocument | null> {
    const query: { _id: Types.ObjectId; recipientId?: Types.ObjectId } = {
      _id: id,
    };
    if (recipientId) {
      query.recipientId = recipientId;
    }
    return NotificationModel.findOne(query).populate(
      "actorId",
      "fullName email profile"
    );
  }

  async findByIdempotencyKey(
    idempotencyKey: string,
    session?: ClientSession
  ): Promise<NotificationDocument | null> {
    return NotificationModel.findOne({ idempotencyKey }, null, { session });
  }

  async findAndPopulateByRecipient(
    recipientId: Types.ObjectId,
    options: {
      cursor?: string;
      limit?: number;
      unreadOnly?: boolean;
    } = {}
  ): Promise<{
    items: NotificationDocument[];
    nextCursor: string | null;
    hasMore: boolean;
  }> {
    const limit = options.limit && options.limit > 0 ? options.limit : 20;
    const fetchLimit = limit + 1;

    const query: Record<string, unknown> = { recipientId };

    if (options.unreadOnly) {
      query.isRead = false;
    }

    if (options.cursor) {
      try {
        const decoded = JSON.parse(
          Buffer.from(options.cursor, "base64").toString("utf-8")
        );
        if (decoded.createdAt && decoded.id) {
          query.$or = [
            { createdAt: { $lt: new Date(decoded.createdAt) } },
            {
              createdAt: new Date(decoded.createdAt),
              _id: { $lt: new Types.ObjectId(decoded.id) },
            },
          ];
        } else if (typeof decoded === "string") {
          query.createdAt = { $lt: new Date(decoded) };
        }
      } catch {
        // If cursor is a raw ISO date or ObjectId string fallback
        if (Types.ObjectId.isValid(options.cursor)) {
          query._id = { $lt: new Types.ObjectId(options.cursor) };
        } else {
          const parsedDate = new Date(options.cursor);
          if (!isNaN(parsedDate.getTime())) {
            query.createdAt = { $lt: parsedDate };
          }
        }
      }
    }

    const docs = await NotificationModel.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(fetchLimit)
      .populate("actorId", "fullName email profile")
      .exec();

    const hasMore = docs.length > limit;
    const items = hasMore ? docs.slice(0, limit) : docs;

    let nextCursor: string | null = null;
    if (hasMore && items.length > 0) {
      const lastItem = items[items.length - 1];
      const payload = {
        createdAt: lastItem.createdAt.toISOString(),
        id: lastItem._id.toString(),
      };
      nextCursor = Buffer.from(JSON.stringify(payload)).toString("base64");
    }

    return {
      items,
      nextCursor,
      hasMore,
    };
  }

  async countUnreadByRecipient(recipientId: Types.ObjectId): Promise<number> {
    return NotificationModel.countDocuments({
      recipientId,
      isRead: false,
    });
  }

  async markAsRead(
    id: Types.ObjectId,
    recipientId: Types.ObjectId,
    readAt: Date = new Date()
  ): Promise<NotificationDocument | null> {
    return NotificationModel.findOneAndUpdate(
      { _id: id, recipientId },
      { $set: { isRead: true, readAt } },
      { new: true }
    ).populate("actorId", "fullName email profile");
  }

  async markAllAsRead(
    recipientId: Types.ObjectId,
    readAt: Date = new Date()
  ): Promise<{ modifiedCount: number }> {
    const result = await NotificationModel.updateMany(
      { recipientId, isRead: false },
      { $set: { isRead: true, readAt } }
    );
    return { modifiedCount: result.modifiedCount };
  }
}

export const notificationRepository = new NotificationRepository();
