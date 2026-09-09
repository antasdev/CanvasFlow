import mongoose, { Document, Schema, Types } from "mongoose";

import {
  Notification,
  NotificationMetadata,
  NotificationType,
} from "./notification.types";

export interface NotificationDocument
  extends Document<Types.ObjectId>,
    Omit<Notification, "id"> {}

const notificationSchema = new Schema<NotificationDocument>(
  {
    recipientId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Recipient ID is required"],
      index: true,
    },
    actorId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Actor ID is required"],
    },
    type: {
      type: String,
      enum: Object.values(NotificationType),
      required: [true, "Notification type is required"],
    },
    title: {
      type: String,
      required: [true, "Notification title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    message: {
      type: String,
      required: [true, "Notification message is required"],
      trim: true,
      maxlength: [1000, "Message cannot exceed 1000 characters"],
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    idempotencyKey: {
      type: String,
      default: null,
      trim: true,
    },
  },
  {
    timestamps: true,
    collection: "notifications",
  }
);

/**
 * Compound Indexes for high-performance notification query patterns:
 * 1. Notification list pagination (newest to oldest by recipient)
 * 2. Filtered unread notification list
 * 3. Fast unread count aggregation
 * 4. Sparse index on idempotencyKey for duplicate creation protection
 */
notificationSchema.index({ recipientId: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ recipientId: 1, isRead: 1 });
notificationSchema.index(
  { idempotencyKey: 1 },
  { sparse: true, unique: false }
);

export const NotificationModel = mongoose.model<NotificationDocument>(
  "Notification",
  notificationSchema
);
