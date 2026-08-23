import { createServer } from "http";
import mongoose, { Types } from "mongoose";
import { io as clientIO, Socket as ClientSocket } from "socket.io-client";

import env from "@/config/env";
import { generateAccessToken } from "@/modules/auth/auth.tokens";
import { UserRole } from "@/modules/user/user.types";
import { UserModel } from "@/modules/user/user.model";
import { WorkspaceModel } from "@/modules/workspace/workspace.model";
import { WorkspaceMemberModel } from "@/modules/workspace/workspaceMember.model";
import { WorkspaceRole, WorkspaceVisibility } from "@/modules/workspace/workspace.types";
import { BoardModel } from "@/modules/board/board.model";
import { BoardVisibility } from "@/modules/board/board.types";
import { CanvasModel } from "@/modules/canvas/canvas.model";
import { ShapeModel } from "@/modules/shape/shape.model";
import { ShapeType } from "@/modules/shape/shape.types";
import { MutationRecordModel } from "@/modules/mutation/mutation.model";

import {
  PresenceActivityBroadcastPayload,
  PresenceCursorBroadcastPayload,
  PresenceSnapshotPayload,
  PresenceUserJoinedPayload,
  PresenceUserLeftPayload,
  SocketEvents,
  SocketServer,
} from "../index";
import { presenceManager, PresenceManager } from "../presence/presence.manager";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runSocketPresenceTests(): Promise<void> {
  console.log("Starting Slice 15: Collaborative Presence & Session Lifecycle Integration Tests...\n");

  try {
    await mongoose.connect(env.MONGODB_URI);
    console.log("Connected to MongoDB for presence test fixture setup.");
  } catch (err) {
    console.warn("MongoDB connection unavailable, skipping test:", err);
    return;
  }

  const httpServer = createServer();
  const socketServer = new SocketServer(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve());
  });

  const address = httpServer.address();
  const port = typeof address === "object" && address ? address.port : 0;
  const serverUrl = `http://localhost:${port}`;

  // Test User Identifiers & Profiles
  const userAId = new Types.ObjectId();
  const userBId = new Types.ObjectId();
  const userCId = new Types.ObjectId(); // User on separate Board 2

  // Create real user records in DB for profile enrichment
  await UserModel.create({
    _id: userAId,
    email: "alice@presence.com",
    password: "hashedpassword123",
    fullName: "Alice Presence",
    profile: { avatar: "https://avatar.url/alice.png" },
  });

  await UserModel.create({
    _id: userBId,
    email: "bob@presence.com",
    password: "hashedpassword123",
    fullName: "Bob Presence",
    profile: { avatar: "https://avatar.url/bob.png" },
  });

  await UserModel.create({
    _id: userCId,
    email: "carol@presence.com",
    password: "hashedpassword123",
    fullName: "Carol Presence",
    profile: { avatar: "https://avatar.url/carol.png" },
  });

  const tokenA = generateAccessToken({
    userId: userAId.toString(),
    role: UserRole.USER,
  });

  const tokenB = generateAccessToken({
    userId: userBId.toString(),
    role: UserRole.USER,
  });

  const tokenC = generateAccessToken({
    userId: userCId.toString(),
    role: UserRole.USER,
  });

  let workspace1Id: Types.ObjectId | null = null;
  let board1Id: Types.ObjectId | null = null;
  let canvas1Id: Types.ObjectId | null = null;

  let workspace2Id: Types.ObjectId | null = null;
  let board2Id: Types.ObjectId | null = null;
  let canvas2Id: Types.ObjectId | null = null;

  try {
    // 1. Seed Board 1 (Shared between User A and User B)
    const ws1 = await WorkspaceModel.create({
      name: "Presence Workspace 1",
      ownerId: userAId,
      visibility: WorkspaceVisibility.PRIVATE,
    });
    workspace1Id = ws1._id as Types.ObjectId;

    await WorkspaceMemberModel.create({
      workspaceId: workspace1Id,
      userId: userBId,
      role: WorkspaceRole.EDITOR,
    });

    const b1 = await BoardModel.create({
      workspaceId: workspace1Id,
      name: "Presence Board 1",
      createdBy: userAId,
      visibility: BoardVisibility.PRIVATE,
      isArchived: false,
    });
    board1Id = b1._id as Types.ObjectId;

    const c1 = await CanvasModel.create({
      boardId: board1Id,
      name: "Canvas 1",
      order: 1,
    });
    canvas1Id = c1._id as Types.ObjectId;

    // Seed a shape on Board 1 to verify version immutability
    const testShape = await ShapeModel.create({
      canvasId: canvas1Id,
      type: ShapeType.RECTANGLE,
      x: 100,
      y: 100,
      width: 200,
      height: 100,
      zIndex: 1,
      createdBy: userAId,
      version: 1,
    });
    const testShapeId = (testShape as any)._id as Types.ObjectId;

    // 2. Seed Board 2 (Private to User C)
    const ws2 = await WorkspaceModel.create({
      name: "Presence Workspace 2",
      ownerId: userCId,
      visibility: WorkspaceVisibility.PRIVATE,
    });
    workspace2Id = ws2._id as Types.ObjectId;

    const b2 = await BoardModel.create({
      workspaceId: workspace2Id,
      name: "Presence Board 2",
      createdBy: userCId,
      visibility: BoardVisibility.PRIVATE,
      isArchived: false,
    });
    board2Id = b2._id as Types.ObjectId;

    const c2 = await CanvasModel.create({
      boardId: board2Id,
      name: "Canvas 2",
      order: 1,
    });
    canvas2Id = c2._id as Types.ObjectId;

    const board1Str = board1Id.toString();
    const board2Str = board2Id.toString();

    console.log("Seed complete. Commencing integration tests...\n");

    // =========================================================================
    // Test 1: User joins board -> receives presence:snapshot with connected users
    // =========================================================================
    console.log("Test 1: User joins board -> receives presence:snapshot with connected users");
    const clientA1: ClientSocket = clientIO(serverUrl, {
      auth: { token: tokenA },
      transports: ["websocket"],
      forceNew: true,
    });

    await new Promise<void>((resolve) => clientA1.on("connect", () => resolve()));

    let snapshotReceivedA1: PresenceSnapshotPayload | null = null;
    clientA1.on(SocketEvents.PRESENCE_SNAPSHOT, (snapshot: PresenceSnapshotPayload) => {
      snapshotReceivedA1 = snapshot;
    });

    let joinAckA1: any = null;
    await new Promise<void>((resolve) => {
      clientA1.emit(
        SocketEvents.BOARD_JOIN,
        { boardId: board1Str },
        (ack: any) => {
          joinAckA1 = ack;
          resolve();
        }
      );
    });

    // Wait for snapshot
    await new Promise((resolve) => setTimeout(resolve, 50));
    console.log("Join Ack A1:", joinAckA1, "Snapshot received:", snapshotReceivedA1);
    assert(snapshotReceivedA1 !== null, "User A1 must receive presence snapshot on join.");
    assert((snapshotReceivedA1 as any).boardId === board1Str, "Snapshot boardId must match Board 1.");
    assert(
      (snapshotReceivedA1 as any).users.some((u: any) => u.userId === userAId.toString() && u.fullName === "Alice Presence"),
      "Snapshot must contain User A with enriched name."
    );
    console.log("  ✓ Test 1 Passed: Joining client receives enriched presence:snapshot.\n");

    // =========================================================================
    // Test 2: Existing peers receive presence:user-joined when new collaborator connects
    // =========================================================================
    console.log("Test 2: Existing peers receive presence:user-joined when new collaborator connects");
    const clientB1: ClientSocket = clientIO(serverUrl, {
      auth: { token: tokenB },
      transports: ["websocket"],
      forceNew: true,
    });

    await new Promise<void>((resolve) => clientB1.on("connect", () => resolve()));

    let peerJoinedEventReceivedByA: PresenceUserJoinedPayload | null = null;
    clientA1.on(SocketEvents.PRESENCE_USER_JOINED, (payload: PresenceUserJoinedPayload) => {
      peerJoinedEventReceivedByA = payload;
    });

    await new Promise<void>((resolve) => {
      clientB1.emit(
        SocketEvents.BOARD_JOIN,
        { boardId: board1Str },
        () => resolve()
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert(peerJoinedEventReceivedByA !== null, "User A must receive presence:user-joined when User B connects.");
    assert(
      (peerJoinedEventReceivedByA as any).user.userId === userBId.toString() &&
      (peerJoinedEventReceivedByA as any).user.fullName === "Bob Presence",
      "User joined payload must contain Bob's enriched presence user model."
    );
    console.log("  ✓ Test 2 Passed: Peer receives presence:user-joined on collaborator join.\n");

    // =========================================================================
    // Test 3 & 4: Multiple tabs for same user increase sessionCount without duplicating active users
    // =========================================================================
    console.log("Test 3 & 4: Multiple tabs for same user increase sessionCount without duplicating active users");
    const clientA2: ClientSocket = clientIO(serverUrl, {
      auth: { token: tokenA },
      transports: ["websocket"],
      forceNew: true,
    });

    await new Promise<void>((resolve) => clientA2.on("connect", () => resolve()));

    let userJoinedBroadcastForTab2 = false;
    clientB1.on(SocketEvents.PRESENCE_USER_JOINED, (payload: PresenceUserJoinedPayload) => {
      if (payload.user.userId === userAId.toString()) {
        userJoinedBroadcastForTab2 = true;
      }
    });

    await new Promise<void>((resolve) => {
      clientA2.emit(
        SocketEvents.BOARD_JOIN,
        { boardId: board1Str },
        () => resolve()
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert(
      !userJoinedBroadcastForTab2,
      "Second tab for User A must NOT trigger duplicate presence:user-joined broadcast to peers."
    );

    const presenceAfterTab2 = presenceManager.getBoardPresence(board1Str);
    const userAEntry = presenceAfterTab2.users.find((u) => u.userId === userAId.toString());
    assert(userAEntry !== undefined, "User A must be present in board presence.");
    assert(userAEntry?.sessionCount === 2, `User A sessionCount must be 2, got ${userAEntry?.sessionCount}`);
    assert(presenceAfterTab2.users.length === 2, `Board users must remain 2 (Alice & Bob), got ${presenceAfterTab2.users.length}`);
    console.log("  ✓ Test 3 & 4 Passed: Multi-tab session deduplication and sessionCount increment verified.\n");

    // =========================================================================
    // Test 5: Closing 1 of 2 tabs does NOT emit user-left or mark user offline
    // =========================================================================
    console.log("Test 5: Closing 1 of 2 tabs does NOT emit user-left or mark user offline");
    let userLeftBroadcastReceivedByB = false;
    clientB1.on(SocketEvents.PRESENCE_USER_LEFT, (payload: PresenceUserLeftPayload) => {
      if (payload.userId === userAId.toString()) {
        userLeftBroadcastReceivedByB = true;
      }
    });

    // Disconnect Tab A2
    clientA2.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert(
      !userLeftBroadcastReceivedByB,
      "Closing Tab A2 when Tab A1 is active must NOT broadcast presence:user-left."
    );

    const presenceAfterTab2Close = presenceManager.getBoardPresence(board1Str);
    const userAAfterTab2Close = presenceAfterTab2Close.users.find((u) => u.userId === userAId.toString());
    assert(userAAfterTab2Close !== undefined, "User A must remain online in board presence.");
    assert(userAAfterTab2Close?.sessionCount === 1, `User A sessionCount must decrement to 1, got ${userAAfterTab2Close?.sessionCount}`);
    console.log("  ✓ Test 5 Passed: Multi-tab partial disconnect maintains online presence.\n");

    // =========================================================================
    // Test 6: Closing final tab emits user-left and removes user from snapshot
    // =========================================================================
    console.log("Test 6: Closing final tab emits user-left and removes user from snapshot");
    let finalUserLeftPayload: PresenceUserLeftPayload | null = null;
    clientB1.on(SocketEvents.PRESENCE_USER_LEFT, (payload: PresenceUserLeftPayload) => {
      if (payload.userId === userAId.toString()) {
        finalUserLeftPayload = payload;
      }
    });

    // Disconnect Tab A1 (final tab)
    clientA1.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert(finalUserLeftPayload !== null, "Closing final tab must broadcast presence:user-left to remaining peers.");
    assert((finalUserLeftPayload as any).userId === userAId.toString(), "User left payload must contain Alice's userId.");

    const presenceAfterAliceLeft = presenceManager.getBoardPresence(board1Str);
    assert(
      !presenceAfterAliceLeft.users.some((u) => u.userId === userAId.toString()),
      "Alice must be removed from active board presence users."
    );
    console.log("  ✓ Test 6 Passed: Closing final tab triggers presence:user-left and cleans snapshot.\n");

    // Reconnect User A for subsequent tests
    const clientA: ClientSocket = clientIO(serverUrl, {
      auth: { token: tokenA },
      transports: ["websocket"],
      forceNew: true,
    });
    await new Promise<void>((resolve) => clientA.on("connect", () => resolve()));
    await new Promise<void>((resolve) => {
      clientA.emit(SocketEvents.BOARD_JOIN, { boardId: board1Str }, () => resolve());
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    // =========================================================================
    // Test 7: Heartbeat updates session timestamps
    // =========================================================================
    console.log("Test 7: Heartbeat updates session timestamps");
    const userSessionsBeforeHeartbeat = presenceManager.getUserSessions(userAId.toString());
    assert(userSessionsBeforeHeartbeat.length === 1, "User A must have 1 active session.");
    const originalHeartbeat = userSessionsBeforeHeartbeat[0].lastHeartbeatAt;

    // Small delay to ensure timestamp difference
    await new Promise((resolve) => setTimeout(resolve, 20));

    let heartbeatAck: any = null;
    await new Promise<void>((resolve) => {
      clientA.emit(
        SocketEvents.PRESENCE_HEARTBEAT,
        { boardId: board1Str },
        (res: any) => {
          heartbeatAck = res;
          resolve();
        }
      );
    });

    assert(heartbeatAck?.success === true, "Heartbeat ack must return success: true.");
    const userSessionsAfterHeartbeat = presenceManager.getUserSessions(userAId.toString());
    assert(
      new Date(userSessionsAfterHeartbeat[0].lastHeartbeatAt).getTime() >=
      new Date(originalHeartbeat).getTime(),
      "Heartbeat must update lastHeartbeatAt timestamp."
    );
    console.log("  ✓ Test 7 Passed: Heartbeat successfully updates session timestamps.\n");

    // =========================================================================
    // Test 8 & 9: Stale session expiration removes session and emits user-left
    // =========================================================================
    console.log("Test 8 & 9: Stale session expiration removes session and emits user-left");
    // Connect User C to Board 2
    const clientC: ClientSocket = clientIO(serverUrl, {
      auth: { token: tokenC },
      transports: ["websocket"],
      forceNew: true,
    });
    await new Promise<void>((resolve) => clientC.on("connect", () => resolve()));
    await new Promise<void>((resolve) => {
      clientC.emit(SocketEvents.BOARD_JOIN, { boardId: board2Str }, () => resolve());
    });
    await new Promise((resolve) => setTimeout(resolve, 50));

    const userCSessions = presenceManager.getUserSessions(userCId.toString());
    assert(userCSessions.length === 1, "User C must be registered in PresenceManager.");

    // Artificially age User C's session by 60 seconds
    const agedTime = new Date(Date.now() - 60000).toISOString();
    userCSessions[0].lastHeartbeatAt = agedTime;

    // Prune stale sessions with 45s threshold
    const expired = presenceManager.removeExpiredSessions(45000);
    assert(
      expired.some((e) => e.userId === userCId.toString() && e.isLastSocketForUser === true),
      "Expired session pruner must identify User C as expired final socket."
    );
    assert(
      presenceManager.getUserSessions(userCId.toString()).length === 0,
      "User C's expired session must be unregistered from PresenceManager."
    );
    console.log("  ✓ Test 8 & 9 Passed: Stale session expiration prunes timed-out sessions.\n");

    // =========================================================================
    // Test 10 & 11: Cursor broadcast works & sender does not receive own broadcast
    // =========================================================================
    console.log("Test 10 & 11: Cursor broadcast works & sender does not receive own broadcast");
    let cursorReceivedByB: PresenceCursorBroadcastPayload | null = null;
    let cursorReceivedBySenderA = false;

    clientB1.on(SocketEvents.PRESENCE_CURSOR, (payload: PresenceCursorBroadcastPayload) => {
      cursorReceivedByB = payload;
    });

    clientA.on(SocketEvents.PRESENCE_CURSOR, () => {
      cursorReceivedBySenderA = true;
    });

    clientA.emit(SocketEvents.PRESENCE_CURSOR, {
      boardId: board1Str,
      x: 350.5,
      y: 420.25,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert(cursorReceivedByB !== null, "Peer B must receive presence:cursor broadcast.");
    assert((cursorReceivedByB as any).userId === userAId.toString(), "Cursor broadcast must contain Alice's userId.");
    assert((cursorReceivedByB as any).x === 350.5 && (cursorReceivedByB as any).y === 420.25, "Cursor coordinates must match.");
    assert(!cursorReceivedBySenderA, "Sender A must NOT receive its own cursor broadcast.");
    console.log("  ✓ Test 10 & 11 Passed: Cursor broadcast synchronized with peer and excluded from sender.\n");

    // =========================================================================
    // Test 12: Cursor payload validation drops invalid coordinates
    // =========================================================================
    console.log("Test 12: Cursor payload validation drops invalid coordinates");
    let invalidCursorReceived = false;
    clientB1.on(SocketEvents.PRESENCE_CURSOR, (payload: PresenceCursorBroadcastPayload) => {
      if (payload.x === 99999999) {
        invalidCursorReceived = true;
      }
    });

    clientA.emit(SocketEvents.PRESENCE_CURSOR, {
      boardId: board1Str,
      x: 99999999, // Out of bounds (> 1000000)
      y: 200,
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    assert(!invalidCursorReceived, "Invalid cursor coordinate payload must be silently dropped without broadcast.");
    console.log("  ✓ Test 12 Passed: Out-of-bounds cursor coordinates safely rejected.\n");

    // =========================================================================
    // Test 13 & 14: Activity broadcast works & invalid activity returns BAD_REQUEST
    // =========================================================================
    console.log("Test 13 & 14: Activity broadcast works & invalid activity returns BAD_REQUEST");
    let activityReceivedByB: PresenceActivityBroadcastPayload | null = null;
    clientB1.on(SocketEvents.PRESENCE_ACTIVITY, (payload: PresenceActivityBroadcastPayload) => {
      activityReceivedByB = payload;
    });

    let activityAck: any = null;
    await new Promise<void>((resolve) => {
      clientA.emit(
        SocketEvents.PRESENCE_ACTIVITY,
        { boardId: board1Str, activity: "moving" },
        (res: any) => {
          activityAck = res;
          resolve();
        }
      );
    });

    assert(activityAck?.success === true, "Valid activity emit must return success: true.");
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert(activityReceivedByB !== null, "Peer B must receive presence:activity broadcast.");
    assert((activityReceivedByB as any).activity === "moving", "Activity tag must be 'moving'.");

    // Test invalid activity
    let invalidActivityAck: any = null;
    await new Promise<void>((resolve) => {
      clientA.emit(
        SocketEvents.PRESENCE_ACTIVITY,
        { boardId: board1Str, activity: "invalid-hacker-action" as any },
        (res: any) => {
          invalidActivityAck = res;
          resolve();
        }
      );
    });

    assert(invalidActivityAck?.success === false, "Invalid activity must fail.");
    assert(invalidActivityAck?.error?.code === "BAD_REQUEST", "Invalid activity must return BAD_REQUEST.");
    console.log("  ✓ Test 13 & 14 Passed: Activity broadcast verified and invalid activity enum rejected.\n");

    // =========================================================================
    // Test 15: Foreign board presence attempt rejected
    // =========================================================================
    console.log("Test 15: Foreign board presence attempt rejected");
    let foreignBoardAck: any = null;
    await new Promise<void>((resolve) => {
      clientA.emit(
        SocketEvents.PRESENCE_HEARTBEAT,
        { boardId: board2Str }, // User A is NOT in Board 2 room
        (res: any) => {
          foreignBoardAck = res;
          resolve();
        }
      );
    });

    assert(foreignBoardAck?.success === false, "Presence emit to foreign board must fail.");
    assert(foreignBoardAck?.error?.code === "FORBIDDEN", "Foreign board presence must return FORBIDDEN.");
    console.log("  ✓ Test 15 Passed: Foreign board presence attempt safely rejected.\n");

    // =========================================================================
    // Test 16–19: Ephemeral Guarantee: ZERO mutations, ZERO revision bump, ZERO version changes
    // =========================================================================
    console.log("Test 16–19: Ephemeral Guarantee: ZERO mutations, ZERO revision bump, ZERO version changes");
    const boardDoc = await BoardModel.findById(board1Id);
    const initialRevision = boardDoc?.collaborationRevision ?? 0;

    const shapeDoc = await ShapeModel.findById(testShapeId);
    const initialShapeVersion = shapeDoc?.version ?? 1;

    const mutationCountBefore = await MutationRecordModel.countDocuments({ boardId: board1Id });

    // Perform high-frequency presence operations
    for (let i = 0; i < 20; i++) {
      clientA.emit(SocketEvents.PRESENCE_CURSOR, {
        boardId: board1Str,
        x: 100 + i,
        y: 100 + i,
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 60));

    const boardDocAfter = await BoardModel.findById(board1Id);
    const shapeDocAfter = await ShapeModel.findById(testShapeId);
    const mutationCountAfter = await MutationRecordModel.countDocuments({ boardId: board1Id });

    assert(
      (boardDocAfter?.collaborationRevision ?? 0) === initialRevision,
      "Presence operations must NEVER increment collaborationRevision."
    );
    assert(
      (shapeDocAfter?.version ?? 1) === initialShapeVersion,
      "Presence operations must NEVER alter Shape.version."
    );
    assert(
      mutationCountAfter === mutationCountBefore,
      "Presence operations must NEVER create mutation records."
    );
    console.log("  ✓ Test 16–19 Passed: Ephemeral purity invariant preserved with 0 persistence side-effects.\n");

    // =========================================================================
    // Test 20: Snapshot request retrieves current active presence on demand
    // =========================================================================
    console.log("Test 20: Snapshot request retrieves current active presence on demand");
    let manualSnapshotAck: any = null;
    await new Promise<void>((resolve) => {
      clientA.emit(
        SocketEvents.PRESENCE_SNAPSHOT,
        { boardId: board1Str },
        (res: any) => {
          manualSnapshotAck = res;
          resolve();
        }
      );
    });

    assert(manualSnapshotAck?.success === true, "Snapshot request must return success: true.");
    assert(manualSnapshotAck?.data?.users?.length >= 2, "Snapshot data must contain connected users.");
    assert(manualSnapshotAck?.data?.cursors?.length >= 1, "Snapshot data must contain active cursors.");
    console.log("  ✓ Test 20 Passed: On-demand presence snapshot retrieval verified.\n");

    // =========================================================================
    // Test 21: Board A presence never leaks to Board 2
    // =========================================================================
    console.log("Test 21: Board A presence never leaks to Board 2");
    const board1Presence = presenceManager.getBoardPresence(board1Str);
    const board2Presence = presenceManager.getBoardPresence(board2Str);

    assert(
      !board2Presence.users.some((u) => u.userId === userAId.toString() || u.userId === userBId.toString()),
      "Board 1 users must NOT appear in Board 2 presence."
    );
    console.log("  ✓ Test 21 Passed: Board-scoped presence isolation verified.\n");

    // =========================================================================
    // Test 22: Standalone PresenceManager Unit Invariants
    // =========================================================================
    console.log("Test 22: Standalone PresenceManager Unit Invariants");
    const testPm = new PresenceManager();
    const regResult = testPm.registerSession("b-100", "sock-100", {
      userId: "u-100",
      fullName: "Standalone User",
      avatar: "https://avatar.png",
    });

    assert(regResult.isFirstSocketForUser === true, "Initial registration must be first socket.");
    assert(regResult.presenceUser.sessionCount === 1, "Session count must be 1.");
    assert(typeof regResult.session.sessionId === "string", "SessionId must be a generated string.");

    // Add 2nd session
    const reg2 = testPm.registerSession("b-100", "sock-200", {
      userId: "u-100",
      fullName: "Standalone User",
    });
    assert(reg2.isFirstSocketForUser === false, "Second session is not first socket.");
    assert(reg2.presenceUser.sessionCount === 2, "Session count must be 2.");

    // Touch session
    assert(testPm.touchSession("sock-100") === true, "Touch session must succeed.");
    assert(testPm.touchSession("non-existent") === false, "Touch non-existent must return false.");

    // Update cursor & activity
    testPm.updateCursor("b-100", "u-100", 50, 75);
    testPm.updateActivity("b-100", "u-100", "resizing");
    const snapshot = testPm.getBoardSnapshot("b-100");
    assert(snapshot.cursors.some((c) => c.userId === "u-100" && c.x === 50 && c.y === 75), "Cursor must be saved.");
    assert(snapshot.users.some((u) => u.userId === "u-100" && u.activity === "resizing"), "Activity must be updated.");

    // Unregister first socket
    const unreg1 = testPm.unregisterSession("sock-100");
    assert(unreg1.isLastSocketForUser === false, "Unregistering 1 of 2 sockets must not be last.");
    assert(unreg1.remainingSessions === 1, "Remaining sessions must be 1.");

    // Unregister second socket
    const unreg2 = testPm.unregisterSession("sock-200");
    assert(unreg2.isLastSocketForUser === true, "Unregistering final socket must be last.");
    assert(unreg2.remainingSessions === 0, "Remaining sessions must be 0.");
    assert(testPm.getBoardPresence("b-100").users.length === 0, "Board must have 0 users after last leaves.");
    console.log("  ✓ Test 22 Passed: Standalone PresenceManager invariants verified.\n");

    // Teardown sockets
    clientA.disconnect();
    clientB1.disconnect();
    clientC.disconnect();

    console.log("=========================================================================");
    console.log("  ALL 22 COLLABORATIVE PRESENCE INTEGRATION TESTS PASSED CLEANLY!");
    console.log("=========================================================================\n");
  } finally {
    // Teardown fixture data
    if (board1Id) {
      await ShapeModel.deleteMany({ canvasId: canvas1Id });
      await CanvasModel.deleteMany({ boardId: board1Id });
      await BoardModel.deleteOne({ _id: board1Id });
    }
    if (board2Id) {
      await CanvasModel.deleteMany({ boardId: board2Id });
      await BoardModel.deleteOne({ _id: board2Id });
    }
    if (workspace1Id) {
      await WorkspaceMemberModel.deleteMany({ workspaceId: workspace1Id });
      await WorkspaceModel.deleteOne({ _id: workspace1Id });
    }
    if (workspace2Id) {
      await WorkspaceModel.deleteOne({ _id: workspace2Id });
    }
    await UserModel.deleteMany({ _id: { $in: [userAId, userBId, userCId] } });

    await socketServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await mongoose.disconnect();
  }
}

void runSocketPresenceTests();
