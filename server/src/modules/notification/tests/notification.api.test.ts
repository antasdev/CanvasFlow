import { createServer } from "http";
import mongoose, { Types } from "mongoose";

import app from "@/app";
import env from "@/config/env";
import { generateAccessToken } from "@/modules/auth/auth.tokens";
import { UserModel } from "@/modules/user/user.model";
import { UserRole } from "@/modules/user/user.types";
import { NotificationModel } from "../notification.model";
import { NotificationType } from "../notification.types";
import {
  NotificationListResponseDto,
  NotificationResponseDto,
  NotificationUnreadCountResponseDto,
} from "../notification.dto";

type SingleNotificationApiResponse = {
  success: boolean;
  data: NotificationResponseDto;
  message?: string;
};

type ListNotificationsApiResponse = {
  success: boolean;
  data: NotificationListResponseDto;
  message?: string;
};

type UnreadCountApiResponse = {
  success: boolean;
  data: NotificationUnreadCountResponseDto;
  message?: string;
};

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runNotificationApiTests(): Promise<void> {
  console.log("Starting Notification REST API Integration Tests...\n");

  let isDbConnected = false;
  try {
    await mongoose.connect(env.MONGODB_URI);
    isDbConnected = true;
    console.log("Connected to MongoDB for Notification REST API tests.");
  } catch (err) {
    console.warn("MongoDB connection unavailable, skipping tests:", err);
    return;
  }

  const httpServer = createServer(app);
  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve());
  });

  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const baseUrl = `http://localhost:${port}/api/v1`;

  const userIds: Types.ObjectId[] = [];
  const notificationIds: Types.ObjectId[] = [];

  const createTestUser = async (name: string) => {
    const user = await UserModel.create({
      fullName: name,
      email: `api_notif_${name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}@example.com`,
      password: "Password123!",
      role: UserRole.USER,
    });
    userIds.push(user._id as Types.ObjectId);
    const token = generateAccessToken({
      userId: user._id.toString(),
      role: user.role,
    });
    return { user, token };
  };

  try {
    const userA = await createTestUser("API User A");
    const userB = await createTestUser("API User B");

    // Seed notifications for userA
    const seeded = await NotificationModel.create([
      {
        recipientId: userA.user._id,
        actorId: userB.user._id,
        type: NotificationType.MENTION,
        title: "Mentioned you",
        message: "Hey, check this out!",
        metadata: { commentId: new Types.ObjectId().toString() },
        isRead: false,
      },
      {
        recipientId: userA.user._id,
        actorId: userB.user._id,
        type: NotificationType.COMMENT_REPLY,
        title: "Replied to thread",
        message: "Looks good to me!",
        metadata: { commentId: new Types.ObjectId().toString() },
        isRead: false,
      },
      {
        recipientId: userB.user._id,
        actorId: userA.user._id,
        type: NotificationType.MENTION,
        title: "Mention for B",
        message: "Private for B",
        metadata: { commentId: new Types.ObjectId().toString() },
        isRead: false,
      },
    ]);
    for (const doc of seeded) {
      notificationIds.push(doc._id as Types.ObjectId);
    }

    // ----------------------------------------------------
    // TEST 1: Unauthenticated Requests Return 401
    // ----------------------------------------------------
    console.log("Test 1: Unauthenticated requests return 401 Unauthorized...");
    const unauthGet = await fetch(`${baseUrl}/notifications`);
    assert(unauthGet.status === 401, "GET /notifications returns 401 without auth header");

    const unauthCount = await fetch(`${baseUrl}/notifications/unread-count`);
    assert(unauthCount.status === 401, "GET /notifications/unread-count returns 401 without auth header");
    console.log("✓ Unauthenticated requests rejected with 401.");

    // ----------------------------------------------------
    // TEST 2: GET Notifications List (with pagination)
    // ----------------------------------------------------
    console.log("Test 2: Fetching notifications list for userA...");
    const getRes = await fetch(`${baseUrl}/notifications?limit=1`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    assert(getRes.status === 200, "GET /notifications returned 200");
    const getJson = (await getRes.json()) as ListNotificationsApiResponse;
    assert(getJson.success === true, "Response success is true");
    assert(getJson.data.items.length === 1, "Returned 1 item for limit=1");
    assert(getJson.data.hasMore === true, "hasMore is true");
    assert(getJson.data.nextCursor !== null, "nextCursor is present");
    assert(getJson.data.unreadCount === 2, "Unread count is 2 for userA");
    assert(
      getJson.data.items[0].recipientId === userA.user._id.toString(),
      "Recipient belongs strictly to userA (no cross-user leakage)"
    );
    console.log("✓ Notification list and pagination verified.");

    // ----------------------------------------------------
    // TEST 3: GET Unread Count
    // ----------------------------------------------------
    console.log("Test 3: Fetching unread notification count...");
    const countRes = await fetch(`${baseUrl}/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    assert(countRes.status === 200, "GET /unread-count returned 200");
    const countJson = (await countRes.json()) as UnreadCountApiResponse;
    assert(countJson.data.unreadCount === 2, "Unread count matches 2");
    console.log("✓ Unread count endpoint verified.");

    // ----------------------------------------------------
    // TEST 4: PATCH Mark Single Notification as Read
    // ----------------------------------------------------
    console.log("Test 4: Marking single notification as read...");
    const targetNotifId = seeded[0]._id.toString();
    const markReadRes = await fetch(
      `${baseUrl}/notifications/${targetNotifId}/read`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${userA.token}` },
      }
    );
    assert(markReadRes.status === 200, "PATCH /notifications/:id/read returned 200");
    const markReadJson = (await markReadRes.json()) as SingleNotificationApiResponse;
    assert(markReadJson.data.isRead === true, "isRead updated to true");
    assert(markReadJson.data.readAt !== null, "readAt is non-null");

    // Verify unread count decremented
    const countAfterRead = await fetch(`${baseUrl}/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    const countAfterReadJson = (await countAfterRead.json()) as UnreadCountApiResponse;
    assert(countAfterReadJson.data.unreadCount === 1, "Unread count is now 1");
    console.log("✓ Single notification mark-as-read verified.");

    // ----------------------------------------------------
    // TEST 5: IDOR Protection (Cannot mark another user's notification as read)
    // ----------------------------------------------------
    console.log("Test 5: IDOR protection on mark as read...");
    const userBNotifId = seeded[2]._id.toString();
    const idorRes = await fetch(`${baseUrl}/notifications/${userBNotifId}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${userA.token}` }, // userA trying to mark userB's notification
    });
    assert(idorRes.status === 404, "User A cannot mark User B's notification as read (404)");
    console.log("✓ IDOR protection verified.");

    // ----------------------------------------------------
    // TEST 6: PATCH Mark All as Read
    // ----------------------------------------------------
    console.log("Test 6: Marking all notifications as read...");
    const markAllRes = await fetch(`${baseUrl}/notifications/read-all`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    assert(markAllRes.status === 200, "PATCH /notifications/read-all returned 200");

    const finalCountRes = await fetch(`${baseUrl}/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    const finalCountJson = (await finalCountRes.json()) as UnreadCountApiResponse;
    assert(finalCountJson.data.unreadCount === 0, "Unread count is 0 after mark-all");
    console.log("✓ Mark all as read verified.");

    // ----------------------------------------------------
    // TEST 7: Invalid ID format returns 400 Bad Request
    // ----------------------------------------------------
    console.log("Test 7: Invalid ID format returns 400...");
    const invalidIdRes = await fetch(`${baseUrl}/notifications/invalid-id/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${userA.token}` },
    });
    assert(invalidIdRes.status === 400, "Invalid notification ID rejected with 400");
    console.log("✓ Input validation verified.");

    console.log("\nAll Notification REST API Integration Tests Passed Successfully!");
  } finally {
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    if (isDbConnected) {
      await NotificationModel.deleteMany({ _id: { $in: notificationIds } });
      await UserModel.deleteMany({ _id: { $in: userIds } });
      await mongoose.disconnect();
      console.log("MongoDB disconnected and test fixtures cleaned up.");
    }
  }
}

runNotificationApiTests().catch((err) => {
  console.error("Notification API Test Failure:", err);
  process.exit(1);
});
