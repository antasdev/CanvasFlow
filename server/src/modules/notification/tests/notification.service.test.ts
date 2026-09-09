import mongoose, { Types } from "mongoose";

import env from "@/config/env";
import { UserModel } from "@/modules/user/user.model";
import { UserRole } from "@/modules/user/user.types";
import { WorkspaceModel } from "@/modules/workspace/workspace.model";
import { WorkspaceMemberModel } from "@/modules/workspace/workspaceMember.model";
import { WorkspaceRole, WorkspaceVisibility } from "@/modules/workspace/workspace.types";
import { BoardModel } from "@/modules/board/board.model";
import { BoardVisibility } from "@/modules/board/board.types";
import { CanvasModel } from "@/modules/canvas/canvas.model";
import { CommentModel } from "@/modules/comment/comment.model";
import { commentService } from "@/modules/comment/comment.service";
import { NotificationModel } from "../notification.model";
import { notificationService } from "../notification.service";
import { NotificationType } from "../notification.types";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runNotificationServiceTests(): Promise<void> {
  console.log("Starting Notification Service Integration Tests...\n");

  let isDbConnected = false;
  try {
    await mongoose.connect(env.MONGODB_URI);
    isDbConnected = true;
    console.log("Connected to MongoDB for Notification service tests.");
  } catch (err) {
    console.warn("MongoDB connection unavailable, skipping tests:", err);
    return;
  }

  const userIds: Types.ObjectId[] = [];
  const workspaceIds: Types.ObjectId[] = [];
  const boardIds: Types.ObjectId[] = [];
  const canvasIds: Types.ObjectId[] = [];
  const commentIds: Types.ObjectId[] = [];
  const notificationIds: Types.ObjectId[] = [];

  const createTestUser = async (name: string) => {
    const user = await UserModel.create({
      fullName: name,
      email: `${name.toLowerCase().replace(/\s+/g, "_")}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}@example.com`,
      password: "Password123!",
      role: UserRole.USER,
    });
    userIds.push(user._id as Types.ObjectId);
    return user;
  };

  try {
    const alice = await createTestUser("Alice Author");
    const bob = await createTestUser("Bob Reviewer");
    const charlie = await createTestUser("Charlie Designer");

    const workspace = await WorkspaceModel.create({
      name: "Notification Test Workspace",
      ownerId: alice._id,
      visibility: WorkspaceVisibility.PRIVATE,
    });
    workspaceIds.push(workspace._id as Types.ObjectId);

    await WorkspaceMemberModel.create([
      { workspaceId: workspace._id, userId: bob._id, role: WorkspaceRole.EDITOR, joinedAt: new Date() },
      { workspaceId: workspace._id, userId: charlie._id, role: WorkspaceRole.EDITOR, joinedAt: new Date() },
    ]);

    const board = await BoardModel.create({
      name: "Notification Board",
      workspaceId: workspace._id,
      createdBy: alice._id,
      visibility: BoardVisibility.PRIVATE,
    });
    boardIds.push(board._id as Types.ObjectId);

    const canvas = await CanvasModel.create({
      boardId: board._id,
      name: "Canvas 1",
      order: 1,
    });
    canvasIds.push(canvas._id as Types.ObjectId);

    // ----------------------------------------------------
    // TEST 1: Mention Notifications Dispatch & Deduplication
    // ----------------------------------------------------
    console.log("Test 1: Single and duplicate mention notification dispatch...");
    const mentionContent = `Hey @${bob.fullName} and again @${bob.fullName}, review this!`;
    const bobStart1 = mentionContent.indexOf(`@${bob.fullName}`);
    const bobEnd1 = bobStart1 + bob.fullName.length + 1;
    const bobStart2 = mentionContent.lastIndexOf(`@${bob.fullName}`);
    const bobEnd2 = bobStart2 + bob.fullName.length + 1;

    const rootCommentRes = await commentService.createComment(
      alice._id as Types.ObjectId,
      {
        boardId: board._id as Types.ObjectId,
        canvasId: canvas._id as Types.ObjectId,
        content: mentionContent,
        mentions: [
          {
            userId: bob._id.toString(),
            displayName: bob.fullName,
            startIndex: bobStart1,
            endIndex: bobEnd1,
          },
          {
            userId: bob._id.toString(),
            displayName: bob.fullName,
            startIndex: bobStart2,
            endIndex: bobEnd2,
          },
        ],
      }
    );
    commentIds.push(rootCommentRes.comment._id as Types.ObjectId);

    const bobNotifications = await notificationService.getNotifications(
      bob._id as Types.ObjectId,
      {}
    );
    assert(
      bobNotifications.items.length === 1,
      "Duplicate mentions in same comment deduplicated to 1 notification for Bob"
    );
    assert(
      bobNotifications.items[0].type === NotificationType.MENTION,
      "Notification type is MENTION"
    );
    assert(
      bobNotifications.items[0].actorId === alice._id.toString(),
      "Actor is Alice"
    );
    assert(
      bobNotifications.items[0].metadata.commentId ===
        rootCommentRes.comment._id.toString(),
      "Metadata references commentId"
    );
    notificationIds.push(new Types.ObjectId(bobNotifications.items[0].id));
    console.log("✓ Single and duplicate mention deduplication verified.");

    // ----------------------------------------------------
    // TEST 2: Self-Mention Exclusion
    // ----------------------------------------------------
    console.log("Test 2: Author self-mention does not generate notification...");
    const selfMentionContent = `Note to myself @${alice.fullName}`;
    const aliceStart = selfMentionContent.indexOf(`@${alice.fullName}`);
    const aliceEnd = aliceStart + alice.fullName.length + 1;

    const selfCommentRes = await commentService.createComment(
      alice._id as Types.ObjectId,
      {
        boardId: board._id as Types.ObjectId,
        canvasId: canvas._id as Types.ObjectId,
        content: selfMentionContent,
        mentions: [
          {
            userId: alice._id.toString(),
            displayName: alice.fullName,
            startIndex: aliceStart,
            endIndex: aliceEnd,
          },
        ],
      }
    );
    commentIds.push(selfCommentRes.comment._id as Types.ObjectId);

    const aliceNotifications = await notificationService.getNotifications(
      alice._id as Types.ObjectId,
      {}
    );
    assert(
      aliceNotifications.items.length === 0,
      "Alice receives 0 notifications for self-mention"
    );
    console.log("✓ Self-mention exclusion verified.");

    // ----------------------------------------------------
    // TEST 3: Mention Edit Diffing (Only Newly Added Mentions)
    // ----------------------------------------------------
    console.log("Test 3: Comment edit diffing only notifies newly added users...");
    const editedContent = `Hey @${bob.fullName} and now adding @${charlie.fullName}!`;
    const editBobStart = editedContent.indexOf(`@${bob.fullName}`);
    const editBobEnd = editBobStart + bob.fullName.length + 1;
    const editCharlieStart = editedContent.indexOf(`@${charlie.fullName}`);
    const editCharlieEnd = editCharlieStart + charlie.fullName.length + 1;

    await commentService.updateComment(
      rootCommentRes.comment._id as Types.ObjectId,
      alice._id as Types.ObjectId,
      {
        content: editedContent,
        expectedVersion: rootCommentRes.comment.version,
        mentions: [
          {
            userId: bob._id.toString(),
            displayName: bob.fullName,
            startIndex: editBobStart,
            endIndex: editBobEnd,
          },
          {
            userId: charlie._id.toString(),
            displayName: charlie.fullName,
            startIndex: editCharlieStart,
            endIndex: editCharlieEnd,
          },
        ],
      }
    );

    // Bob was already mentioned in this comment, so Bob should still have only 1 notification
    const bobNotificationsAfterEdit = await notificationService.getNotifications(
      bob._id as Types.ObjectId,
      {}
    );
    assert(
      bobNotificationsAfterEdit.items.length === 1,
      "Bob does not receive a second notification on edit"
    );

    // Charlie was newly added in this edit, so Charlie should have 1 notification
    const charlieNotifications = await notificationService.getNotifications(
      charlie._id as Types.ObjectId,
      {}
    );
    assert(
      charlieNotifications.items.length === 1,
      "Charlie receives 1 notification for being newly mentioned in edit"
    );
    assert(
      charlieNotifications.items[0].type === NotificationType.MENTION,
      "Notification type is MENTION"
    );
    notificationIds.push(new Types.ObjectId(charlieNotifications.items[0].id));
    console.log("✓ Mention edit diffing verified.");

    // ----------------------------------------------------
    // TEST 4: Thread Reply Notifications
    // ----------------------------------------------------
    console.log("Test 4: Reply notifications to root comment author and participants...");
    // Bob replies to Alice's root comment
    const reply1Res = await commentService.createReply(
      bob._id as Types.ObjectId,
      board._id as Types.ObjectId,
      rootCommentRes.comment._id as Types.ObjectId,
      {
        content: "I reviewed this, looks good!",
      }
    );
    commentIds.push(reply1Res.comment._id as Types.ObjectId);

    // Alice (root author) receives 1 COMMENT_REPLY notification
    const aliceReplyNotifs = await notificationService.getNotifications(
      alice._id as Types.ObjectId,
      {}
    );
    assert(
      aliceReplyNotifs.items.length === 1,
      "Alice receives COMMENT_REPLY notification"
    );
    assert(
      aliceReplyNotifs.items[0].type === NotificationType.COMMENT_REPLY,
      "Type is COMMENT_REPLY"
    );
    assert(
      aliceReplyNotifs.items[0].actorId === bob._id.toString(),
      "Actor is Bob"
    );
    notificationIds.push(new Types.ObjectId(aliceReplyNotifs.items[0].id));

    // Bob (reply author) receives 0 notifications for his own reply
    const bobReplyNotifs = await notificationService.getNotifications(
      bob._id as Types.ObjectId,
      { unreadOnly: true }
    );
    // Bob has his initial mention, not a reply notification
    assert(
      bobReplyNotifs.items.every((n) => n.type !== NotificationType.COMMENT_REPLY),
      "Bob does not receive a reply notification for his own reply"
    );

    // Charlie replies to the thread
    const reply2Res = await commentService.createReply(
      charlie._id as Types.ObjectId,
      board._id as Types.ObjectId,
      rootCommentRes.comment._id as Types.ObjectId,
      {
        content: "I agree with Bob!",
      }
    );
    commentIds.push(reply2Res.comment._id as Types.ObjectId);

    // Both Alice (root author) and Bob (previous participant) receive reply notification from Charlie
    const bobAfterCharlieReply = await notificationService.getNotifications(
      bob._id as Types.ObjectId,
      {}
    );
    const bobReplyFromCharlie = bobAfterCharlieReply.items.find(
      (n) => n.type === NotificationType.COMMENT_REPLY
    );
    assert(
      bobReplyFromCharlie !== undefined,
      "Bob receives COMMENT_REPLY notification as thread participant"
    );
    assert(
      bobReplyFromCharlie?.actorId === charlie._id.toString(),
      "Actor is Charlie"
    );
    if (bobReplyFromCharlie) {
      notificationIds.push(new Types.ObjectId(bobReplyFromCharlie.id));
    }
    console.log("✓ Reply notifications to root author and thread participants verified.");

    // ----------------------------------------------------
    // TEST 5: Thread Activity (Resolve / Reopen)
    // ----------------------------------------------------
    console.log("Test 5: Thread resolution activity notifications...");
    // Bob resolves the root comment thread
    const currentRoot = await CommentModel.findById(rootCommentRes.comment._id);
    await commentService.resolveComment(
      rootCommentRes.comment._id as Types.ObjectId,
      bob._id as Types.ObjectId,
      {
        isResolved: true,
        expectedVersion: currentRoot!.version,
      }
    );

    // Alice (root author) and Charlie (participant) receive THREAD_ACTIVITY notification; Bob (actor) excluded
    const aliceAfterResolve = await notificationService.getNotifications(
      alice._id as Types.ObjectId,
      {}
    );
    const aliceActivity = aliceAfterResolve.items.find(
      (n) => n.type === NotificationType.THREAD_ACTIVITY
    );
    assert(aliceActivity !== undefined, "Alice receives THREAD_ACTIVITY notification");
    assert(aliceActivity?.metadata.action === "RESOLVED", "Action is RESOLVED");
    if (aliceActivity) {
      notificationIds.push(new Types.ObjectId(aliceActivity.id));
    }
    console.log("✓ Thread resolution activity notifications verified.");

    // ----------------------------------------------------
    // TEST 6: Read State & Mark-All API Logic
    // ----------------------------------------------------
    console.log("Test 6: Mark single and mark all as read...");
    let aliceUnread = await notificationService.getUnreadCount(
      alice._id as Types.ObjectId
    );
    assert(aliceUnread.unreadCount >= 2, "Alice has multiple unread notifications");

    const singleRead = await notificationService.markAsRead(
      new Types.ObjectId(aliceReplyNotifs.items[0].id),
      alice._id as Types.ObjectId
    );
    assert(singleRead.isRead === true, "Single notification marked as read");

    const markAll = await notificationService.markAllAsRead(
      alice._id as Types.ObjectId
    );
    assert(markAll.count >= 1, "Mark all modified remaining unread notifications");

    aliceUnread = await notificationService.getUnreadCount(
      alice._id as Types.ObjectId
    );
    assert(aliceUnread.unreadCount === 0, "Alice unread count is 0 after markAllAsRead");
    console.log("✓ Read state and markAllAsRead verified.");

    console.log("\nAll Notification Service Integration Tests Passed Successfully!");
  } finally {
    if (isDbConnected) {
      await NotificationModel.deleteMany({ _id: { $in: notificationIds } });
      await CommentModel.deleteMany({ _id: { $in: commentIds } });
      await CanvasModel.deleteMany({ _id: { $in: canvasIds } });
      await BoardModel.deleteMany({ _id: { $in: boardIds } });
      await WorkspaceMemberModel.deleteMany({ workspaceId: { $in: workspaceIds } });
      await WorkspaceModel.deleteMany({ _id: { $in: workspaceIds } });
      await UserModel.deleteMany({ _id: { $in: userIds } });
      await mongoose.disconnect();
      console.log("MongoDB disconnected and test fixtures cleaned up.");
    }
  }
}

runNotificationServiceTests().catch((err) => {
  console.error("Notification Service Test Failure:", err);
  process.exit(1);
});
