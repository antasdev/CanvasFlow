import mongoose, { Types } from "mongoose";

import env from "@/config/env";
import { UserModel } from "@/modules/user/user.model";
import { UserRole } from "@/modules/user/user.types";
import { NotificationModel } from "../notification.model";
import { notificationRepository } from "../notification.repository";
import { notificationMapper } from "../notification.mapper";
import { NotificationType } from "../notification.types";
import {
  getNotificationsSchema,
  markAsReadSchema,
  objectIdSchema,
} from "../notification.validation";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runNotificationDomainTests(): Promise<void> {
  console.log("Starting Notification Domain & Repository Unit Tests...\n");

  let isDbConnected = false;
  try {
    await mongoose.connect(env.MONGODB_URI);
    isDbConnected = true;
    console.log("Connected to MongoDB for Notification domain tests.");
  } catch (err) {
    console.warn("MongoDB connection unavailable, skipping tests:", err);
    return;
  }

  const userIds: Types.ObjectId[] = [];
  const notificationIds: Types.ObjectId[] = [];

  try {
    // ----------------------------------------------------
    // TEST 1: Zod Schema Validations
    // ----------------------------------------------------
    console.log("Test 1: Validating Zod schemas for notifications...");
    const validId = new Types.ObjectId().toString();
    assert(objectIdSchema.safeParse(validId).success, "Valid ObjectId accepted");
    assert(!objectIdSchema.safeParse("invalid-id").success, "Invalid ObjectId rejected");

    const validQuery = getNotificationsSchema.safeParse({
      query: { limit: "25", unreadOnly: "true" },
    });
    assert(validQuery.success, "Valid getNotifications query accepted");
    if (validQuery.success) {
      assert(validQuery.data.query.limit === 25, "Limit correctly transformed to number");
      assert(validQuery.data.query.unreadOnly === true, "unreadOnly correctly transformed to boolean");
    }

    const invalidLimit = getNotificationsSchema.safeParse({
      query: { limit: "100" }, // Exceeds max 50
    });
    assert(!invalidLimit.success, "Limit > 50 rejected");

    const validMarkRead = markAsReadSchema.safeParse({ params: { id: validId } });
    assert(validMarkRead.success, "Valid markAsRead params accepted");
    console.log("✓ Zod schemas enforced correctly.");

    // ----------------------------------------------------
    // TEST 2: Users & Notification Creation via Repository
    // ----------------------------------------------------
    console.log("Test 2: Creating users and persisting notification entity...");
    const recipient = await UserModel.create({
      fullName: "Alice Recipient",
      email: `recipient_${Date.now()}@example.com`,
      password: "Password123!",
      role: UserRole.USER,
    });
    userIds.push(recipient._id as Types.ObjectId);

    const actor = await UserModel.create({
      fullName: "Bob Actor",
      email: `actor_${Date.now()}@example.com`,
      password: "Password123!",
      role: UserRole.USER,
    });
    userIds.push(actor._id as Types.ObjectId);

    const created = await notificationRepository.create({
      recipientId: recipient._id as Types.ObjectId,
      actorId: actor._id as Types.ObjectId,
      type: NotificationType.MENTION,
      title: "Bob Actor mentioned you",
      message: 'Bob Actor mentioned you: "Please review the wireframe"',
      metadata: {
        workspaceId: new Types.ObjectId(),
        boardId: new Types.ObjectId(),
        canvasId: new Types.ObjectId(),
        commentId: new Types.ObjectId(),
        commentContentSnippet: "Please review the wireframe",
      },
      idempotencyKey: `mention:comment-1:${recipient._id}`,
    });
    notificationIds.push(created._id as Types.ObjectId);

    assert(created._id !== undefined, "Notification created with ObjectId");
    assert(created.isRead === false, "Default isRead is false");
    assert(created.readAt === null, "Default readAt is null");
    assert(created.type === NotificationType.MENTION, "Notification type is MENTION");
    console.log("✓ Notification entity persisted with defaults.");

    // ----------------------------------------------------
    // TEST 3: DTO Mapping with Actor Population
    // ----------------------------------------------------
    console.log("Test 3: Populating actor and mapping to Response DTO...");
    const populated = await notificationRepository.findById(
      created._id as Types.ObjectId,
      recipient._id as Types.ObjectId
    );
    assert(populated !== null, "Notification found by ID and recipient");

    const dto = notificationMapper.toResponseDto(populated!);
    assert(dto.id === created._id.toString(), "DTO ID matches");
    assert(dto.recipientId === recipient._id.toString(), "DTO recipientId matches");
    assert(dto.actorId === actor._id.toString(), "DTO actorId matches");
    assert(dto.actor?.fullName === "Bob Actor", "Populated actor fullName matches");
    assert(dto.actor?.email === actor.email, "Populated actor email matches");
    assert(dto.metadata.commentContentSnippet === "Please review the wireframe", "Metadata snippet mapped");
    console.log("✓ DTO mapping and actor population verified.");

    // ----------------------------------------------------
    // TEST 4: Read / Unread State Lifecycle & Unread Count
    // ----------------------------------------------------
    console.log("Test 4: Testing read state transitions and unread count...");
    let unreadCount = await notificationRepository.countUnreadByRecipient(
      recipient._id as Types.ObjectId
    );
    assert(unreadCount === 1, "Unread count is initially 1");

    const readDate = new Date();
    const markedRead = await notificationRepository.markAsRead(
      created._id as Types.ObjectId,
      recipient._id as Types.ObjectId,
      readDate
    );
    assert(markedRead !== null, "Mark as read returned document");
    assert(markedRead!.isRead === true, "isRead set to true");
    assert(markedRead!.readAt !== null, "readAt set to timestamp");

    unreadCount = await notificationRepository.countUnreadByRecipient(
      recipient._id as Types.ObjectId
    );
    assert(unreadCount === 0, "Unread count is 0 after marking read");
    console.log("✓ Read state transitions and unread counts verified.");

    // ----------------------------------------------------
    // TEST 5: Batch Creation & Cursor Pagination
    // ----------------------------------------------------
    console.log("Test 5: Batch creation and cursor pagination...");
    const batchItems = [];
    for (let i = 0; i < 5; i++) {
      batchItems.push({
        recipientId: recipient._id as Types.ObjectId,
        actorId: actor._id as Types.ObjectId,
        type:
          i % 2 === 0
            ? NotificationType.COMMENT_REPLY
            : NotificationType.THREAD_ACTIVITY,
        title: `Notification ${i + 1}`,
        message: `Message body for notification ${i + 1}`,
        metadata: {
          commentId: new Types.ObjectId(),
        },
      });
    }

    const createdBatch = await notificationRepository.createMany(batchItems);
    for (const doc of createdBatch) {
      notificationIds.push(doc._id as Types.ObjectId);
    }
    assert(createdBatch.length === 5, "5 notifications created in batch");

    // Page 1: limit 3
    const page1 = await notificationRepository.findAndPopulateByRecipient(
      recipient._id as Types.ObjectId,
      { limit: 3 }
    );
    assert(page1.items.length === 3, "Page 1 contains 3 items");
    assert(page1.hasMore === true, "Page 1 hasMore is true");
    assert(page1.nextCursor !== null, "Page 1 nextCursor is present");

    // Page 2: with cursor from Page 1
    const page2 = await notificationRepository.findAndPopulateByRecipient(
      recipient._id as Types.ObjectId,
      { limit: 3, cursor: page1.nextCursor! }
    );
    assert(page2.items.length === 3, "Page 2 contains 3 items (including first read one)");
    assert(page2.hasMore === false, "Page 2 hasMore is false");
    assert(page2.nextCursor === null, "Page 2 nextCursor is null");

    // Filter unreadOnly
    const unreadOnlyPage = await notificationRepository.findAndPopulateByRecipient(
      recipient._id as Types.ObjectId,
      { limit: 10, unreadOnly: true }
    );
    assert(unreadOnlyPage.items.length === 5, "Unread-only returns exactly 5 unread items");
    assert(unreadOnlyPage.items.every((n) => n.isRead === false), "All returned items are unread");

    // Mark all as read
    const markAllRes = await notificationRepository.markAllAsRead(
      recipient._id as Types.ObjectId
    );
    assert(markAllRes.modifiedCount === 5, "Mark all read modified 5 documents");

    const finalUnread = await notificationRepository.countUnreadByRecipient(
      recipient._id as Types.ObjectId
    );
    assert(finalUnread === 0, "Final unread count is 0");
    console.log("✓ Batch creation, cursor pagination, and markAllAsRead verified.");

    console.log("\nAll Notification Domain & Repository Unit Tests Passed Successfully!");
  } finally {
    if (isDbConnected) {
      await NotificationModel.deleteMany({ _id: { $in: notificationIds } });
      await UserModel.deleteMany({ _id: { $in: userIds } });
      await mongoose.disconnect();
      console.log("MongoDB disconnected and test fixtures cleaned up.");
    }
  }
}

runNotificationDomainTests().catch((err) => {
  console.error("Notification Domain Test Failure:", err);
  process.exit(1);
});
