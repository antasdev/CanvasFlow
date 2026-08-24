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
  CollaborativeInteraction,
  InteractionBroadcastPayload,
  InteractionEndBroadcastPayload,
  SocketEvents,
  SocketServer,
} from "../index";
import { interactionManager, InteractionManager } from "../presence/interaction.manager";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runSocketInteractionTests(): Promise<void> {
  console.log("Starting Slice 16: Collaborative Interaction State Integration Tests...\n");

  // Connect to MongoDB for test fixture seeding
  await mongoose.connect(env.MONGODB_URI);
  console.log("Connected to MongoDB for interaction test fixture setup.");

  const httpServer = createServer();
  const socketServer = new SocketServer(httpServer);

  await new Promise<void>((resolve) => {
    httpServer.listen(0, () => resolve());
  });

  const port = (httpServer.address() as any).port;
  const serverUrl = `http://localhost:${port}`;

  // Test User Identifiers & Profiles
  const userAId = new Types.ObjectId();
  const userBId = new Types.ObjectId();
  const userCId = new Types.ObjectId(); // User on separate Board 2

  // Create real user records in DB for profile enrichment
  await UserModel.create({
    _id: userAId,
    email: "alice@interaction.com",
    password: "hashedpassword123",
    fullName: "Alice Interaction",
    profile: { avatar: "https://avatar.url/alice.png" },
  });

  await UserModel.create({
    _id: userBId,
    email: "bob@interaction.com",
    password: "hashedpassword123",
    fullName: "Bob Interaction",
    profile: { avatar: "https://avatar.url/bob.png" },
  });

  await UserModel.create({
    _id: userCId,
    email: "carol@interaction.com",
    password: "hashedpassword123",
    fullName: "Carol Interaction",
    profile: { avatar: "https://avatar.url/carol.png" },
  });

  const tokenUserA = generateAccessToken({
    userId: userAId.toString(),
    role: UserRole.USER,
  });

  const tokenUserB = generateAccessToken({
    userId: userBId.toString(),
    role: UserRole.USER,
  });

  const tokenUserC = generateAccessToken({
    userId: userCId.toString(),
    role: UserRole.USER,
  });

  let workspace1Id: Types.ObjectId;
  let board1Id: Types.ObjectId;
  let canvas1Id: Types.ObjectId;
  let shape1Id: Types.ObjectId;
  let shape2Id: Types.ObjectId;

  let workspace2Id: Types.ObjectId;
  let board2Id: Types.ObjectId;
  let canvas2Id: Types.ObjectId;
  let shape3Id: Types.ObjectId;

  try {
    // 1. Seed Board 1 (Shared by User A and User B)
    const ws1 = await WorkspaceModel.create({
      name: "Interaction Workspace 1",
      ownerId: userAId,
      visibility: WorkspaceVisibility.PUBLIC,
    });
    workspace1Id = ws1._id as Types.ObjectId;

    await WorkspaceMemberModel.create({
      workspaceId: workspace1Id,
      userId: userBId,
      role: WorkspaceRole.EDITOR,
    });

    const b1 = await BoardModel.create({
      workspaceId: workspace1Id,
      name: "Interaction Board 1",
      createdBy: userAId,
      visibility: BoardVisibility.PUBLIC,
      isArchived: false,
    });
    board1Id = b1._id as Types.ObjectId;

    const c1 = await CanvasModel.create({
      boardId: board1Id,
      name: "Canvas 1",
      order: 1,
    });
    canvas1Id = c1._id as Types.ObjectId;

    const s1 = await ShapeModel.create({
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
    shape1Id = s1._id as Types.ObjectId;

    const s2 = await ShapeModel.create({
      canvasId: canvas1Id,
      type: ShapeType.TEXT,
      x: 400,
      y: 400,
      width: 150,
      height: 50,
      zIndex: 2,
      createdBy: userAId,
      version: 1,
    });
    shape2Id = s2._id as Types.ObjectId;

    // 2. Seed Board 2 (Private to User C)
    const ws2 = await WorkspaceModel.create({
      name: "Interaction Workspace 2",
      ownerId: userCId,
      visibility: WorkspaceVisibility.PRIVATE,
    });
    workspace2Id = ws2._id as Types.ObjectId;

    const b2 = await BoardModel.create({
      workspaceId: workspace2Id,
      name: "Interaction Board 2",
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

    const s3 = await ShapeModel.create({
      canvasId: canvas2Id,
      type: ShapeType.RECTANGLE,
      x: 50,
      y: 50,
      width: 100,
      height: 100,
      zIndex: 1,
      createdBy: userCId,
      version: 1,
    });
    shape3Id = s3._id as Types.ObjectId;

    const board1Str = board1Id.toString();
    const board2Str = board2Id.toString();
    const shape1Str = shape1Id.toString();
    const shape2Str = shape2Id.toString();
    const shape3Str = shape3Id.toString();

    console.log("Seed complete. Commencing integration tests...\n");

    // =========================================================================
    // Test 1–5: Start, Broadcast, Update, End Lifecycle & Sender Exclusion
    // =========================================================================
    console.log("Test 1–5: Start, Broadcast, Update, End Lifecycle & Sender Exclusion");

    const clientA1 = clientIO(serverUrl, {
      auth: { token: `Bearer ${tokenUserA}` },
      transports: ["websocket"],
      forceNew: true,
    });

    const clientB1 = clientIO(serverUrl, {
      auth: { token: `Bearer ${tokenUserB}` },
      transports: ["websocket"],
      forceNew: true,
    });

    await Promise.all([
      new Promise<void>((resolve) => clientA1.on("connect", () => resolve())),
      new Promise<void>((resolve) => clientB1.on("connect", () => resolve())),
    ]);

    await Promise.all([
      new Promise<void>((resolve) => clientA1.emit(SocketEvents.BOARD_JOIN, { boardId: board1Str }, () => resolve())),
      new Promise<void>((resolve) => clientB1.emit(SocketEvents.BOARD_JOIN, { boardId: board1Str }, () => resolve())),
    ]);

    let peerBReceivedStart: InteractionBroadcastPayload | null = null;
    let senderAReceivedStart: InteractionBroadcastPayload | null = null;

    clientB1.on(SocketEvents.INTERACTION_START, (p: InteractionBroadcastPayload) => {
      peerBReceivedStart = p;
    });

    clientA1.on(SocketEvents.INTERACTION_START, (p: InteractionBroadcastPayload) => {
      senderAReceivedStart = p;
    });

    // Client A starts a selecting interaction
    let startAckA1: any = null;
    await new Promise<void>((resolve) => {
      clientA1.emit(
        SocketEvents.INTERACTION_START,
        {
          boardId: board1Str,
          type: "selecting",
          targets: [{ type: "shape", id: shape1Str }],
        },
        (ack: any) => {
          startAckA1 = ack;
          resolve();
        }
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert(startAckA1?.success === true, "interaction:start must return success: true.");
    assert(typeof startAckA1?.data?.interactionId === "string", "interaction:start must return interactionId.");
    const interactionId1 = startAckA1.data.interactionId;

    assert(peerBReceivedStart !== null, "Peer B must receive interaction:start broadcast.");
    assert((peerBReceivedStart as any)?.interaction?.interactionId === interactionId1, "Broadcast interactionId must match.");
    assert((peerBReceivedStart as any)?.interaction?.type === "selecting", "Broadcast type must be selecting.");
    assert(senderAReceivedStart === null, "Sender A must NOT receive its own interaction:start broadcast.");
    console.log("  ✓ Test 1, 2 & 5 Passed: interaction:start created, broadcasted to peer, sender excluded.");

    // Test 3: interaction:update
    let peerBReceivedUpdate: InteractionBroadcastPayload | null = null;
    clientB1.on(SocketEvents.INTERACTION_UPDATE, (p: InteractionBroadcastPayload) => {
      peerBReceivedUpdate = p;
    });

    let updateAck: any = null;
    await new Promise<void>((resolve) => {
      clientA1.emit(
        SocketEvents.INTERACTION_UPDATE,
        {
          boardId: board1Str,
          interactionId: interactionId1,
          data: { currentX: 150, currentY: 250 },
        },
        (ack: any) => {
          updateAck = ack;
          resolve();
        }
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert(updateAck?.success === true, "interaction:update must succeed.");
    assert(peerBReceivedUpdate !== null, "Peer B must receive interaction:update broadcast.");
    assert((peerBReceivedUpdate as any)?.interaction?.data?.currentX === 150, "Updated data must be broadcast.");
    console.log("  ✓ Test 3 Passed: interaction:update broadcast verified.");

    // Test 4: interaction:end
    let peerBReceivedEnd: InteractionEndBroadcastPayload | null = null;
    clientB1.on(SocketEvents.INTERACTION_END, (p: InteractionEndBroadcastPayload) => {
      peerBReceivedEnd = p;
    });

    let endAck: any = null;
    await new Promise<void>((resolve) => {
      clientA1.emit(
        SocketEvents.INTERACTION_END,
        {
          boardId: board1Str,
          interactionId: interactionId1,
        },
        (ack: any) => {
          endAck = ack;
          resolve();
        }
      );
    });

    await new Promise((resolve) => setTimeout(resolve, 50));

    assert(endAck?.success === true, "interaction:end must succeed.");
    assert(peerBReceivedEnd !== null, "Peer B must receive interaction:end broadcast.");
    assert((peerBReceivedEnd as any)?.interactionId === interactionId1, "interaction:end ID must match.");
    console.log("  ✓ Test 4 Passed: interaction:end broadcast verified.\n");

    // =========================================================================
    // Test 6–9: Exclusive Ownership Conflicts (Moving, Resizing, Rotating, Text Editing)
    // =========================================================================
    console.log("Test 6–9: Exclusive Ownership Conflicts (Moving, Resizing, Rotating, Text Editing)");

    // User A starts moving Shape 1
    let moveAckA: any = null;
    await new Promise<void>((resolve) => {
      clientA1.emit(
        SocketEvents.INTERACTION_START,
        {
          boardId: board1Str,
          type: "moving",
          targets: [{ type: "shape", id: shape1Str }],
        },
        (ack: any) => {
          moveAckA = ack;
          resolve();
        }
      );
    });
    assert(moveAckA?.success === true, "User A must successfully start moving Shape 1.");
    const movingInteractionId = moveAckA.data.interactionId;

    // Test 6: User B attempts moving same Shape 1 -> INTERACTION_CONFLICT
    let moveAckB: any = null;
    await new Promise<void>((resolve) => {
      clientB1.emit(
        SocketEvents.INTERACTION_START,
        {
          boardId: board1Str,
          type: "moving",
          targets: [{ type: "shape", id: shape1Str }],
        },
        (ack: any) => {
          moveAckB = ack;
          resolve();
        }
      );
    });
    assert(moveAckB?.success === false, "User B moving same shape must fail.");
    assert(moveAckB?.error?.code === "INTERACTION_CONFLICT", "Error code must be INTERACTION_CONFLICT.");
    assert(moveAckB?.error?.ownerUserId === userAId.toString(), "Owner must be User A.");
    console.log("  ✓ Test 6 Passed: Concurrent moving rejected with INTERACTION_CONFLICT.");

    // Test 7: User B attempts resizing same Shape 1 -> INTERACTION_CONFLICT
    let resizeAckB: any = null;
    await new Promise<void>((resolve) => {
      clientB1.emit(
        SocketEvents.INTERACTION_START,
        {
          boardId: board1Str,
          type: "resizing",
          targets: [{ type: "shape", id: shape1Str }],
        },
        (ack: any) => {
          resizeAckB = ack;
          resolve();
        }
      );
    });
    assert(resizeAckB?.success === false, "User B resizing moving shape must fail.");
    assert(resizeAckB?.error?.code === "INTERACTION_CONFLICT", "Error code must be INTERACTION_CONFLICT.");
    console.log("  ✓ Test 7 Passed: Concurrent resizing rejected with INTERACTION_CONFLICT.");

    // Test 8: User B attempts rotating same Shape 1 -> INTERACTION_CONFLICT
    let rotateAckB: any = null;
    await new Promise<void>((resolve) => {
      clientB1.emit(
        SocketEvents.INTERACTION_START,
        {
          boardId: board1Str,
          type: "rotating",
          targets: [{ type: "shape", id: shape1Str }],
        },
        (ack: any) => {
          rotateAckB = ack;
          resolve();
        }
      );
    });
    assert(rotateAckB?.success === false, "User B rotating moving shape must fail.");
    assert(rotateAckB?.error?.code === "INTERACTION_CONFLICT", "Error code must be INTERACTION_CONFLICT.");
    console.log("  ✓ Test 8 Passed: Concurrent rotating rejected with INTERACTION_CONFLICT.");

    // User A ends moving interaction
    await new Promise<void>((resolve) => {
      clientA1.emit(
        SocketEvents.INTERACTION_END,
        { boardId: board1Str, interactionId: movingInteractionId },
        () => resolve()
      );
    });

    // Test 9: Text editing conflict
    let textAckA: any = null;
    await new Promise<void>((resolve) => {
      clientA1.emit(
        SocketEvents.INTERACTION_START,
        {
          boardId: board1Str,
          type: "editing-text",
          targets: [{ type: "shape", id: shape2Str }],
        },
        (ack: any) => {
          textAckA = ack;
          resolve();
        }
      );
    });
    assert(textAckA?.success === true, "User A must start editing text Shape 2.");
    const textInteractionId = textAckA.data.interactionId;

    let textAckB: any = null;
    await new Promise<void>((resolve) => {
      clientB1.emit(
        SocketEvents.INTERACTION_START,
        {
          boardId: board1Str,
          type: "editing-text",
          targets: [{ type: "shape", id: shape2Str }],
        },
        (ack: any) => {
          textAckB = ack;
          resolve();
        }
      );
    });
    assert(textAckB?.success === false, "User B editing same text shape must fail.");
    assert(textAckB?.error?.code === "INTERACTION_CONFLICT", "Error code must be INTERACTION_CONFLICT.");
    console.log("  ✓ Test 9 Passed: Concurrent text editing rejected with INTERACTION_CONFLICT.\n");

    // Clean up text interaction
    await new Promise<void>((resolve) => {
      clientA1.emit(
        SocketEvents.INTERACTION_END,
        { boardId: board1Str, interactionId: textInteractionId },
        () => resolve()
      );
    });

    // =========================================================================
    // Test 10 & 11: Shared Multi-User Operations (Selecting & Commenting)
    // =========================================================================
    console.log("Test 10 & 11: Shared Multi-User Operations (Selecting & Commenting)");

    // User A selects Shape 1
    let selectAckA: any = null;
    await new Promise<void>((resolve) => {
      clientA1.emit(
        SocketEvents.INTERACTION_START,
        {
          boardId: board1Str,
          type: "selecting",
          targets: [{ type: "shape", id: shape1Str }],
        },
        (ack: any) => {
          selectAckA = ack;
          resolve();
        }
      );
    });
    assert(selectAckA?.success === true, "User A selection must succeed.");

    // User B also selects Shape 1 simultaneously -> MUST SUCCEED (Shared)
    let selectAckB: any = null;
    await new Promise<void>((resolve) => {
      clientB1.emit(
        SocketEvents.INTERACTION_START,
        {
          boardId: board1Str,
          type: "selecting",
          targets: [{ type: "shape", id: shape1Str }],
        },
        (ack: any) => {
          selectAckB = ack;
          resolve();
        }
      );
    });
    assert(selectAckB?.success === true, "User B simultaneous selection on same shape must succeed.");
    console.log("  ✓ Test 10 Passed: Multi-user selecting on same shape succeeds (shared operation).");

    // User A and User B commenting on same target
    let commentAckA: any = null;
    let commentAckB: any = null;
    await Promise.all([
      new Promise<void>((resolve) => {
        clientA1.emit(
          SocketEvents.INTERACTION_START,
          {
            boardId: board1Str,
            type: "commenting",
            targets: [{ type: "comment", id: shape1Str }],
          },
          (ack: any) => {
            commentAckA = ack;
            resolve();
          }
        );
      }),
      new Promise<void>((resolve) => {
        clientB1.emit(
          SocketEvents.INTERACTION_START,
          {
            boardId: board1Str,
            type: "commenting",
            targets: [{ type: "comment", id: shape1Str }],
          },
          (ack: any) => {
            commentAckB = ack;
            resolve();
          }
        );
      }),
    ]);
    assert(commentAckA?.success === true, "User A commenting must succeed.");
    assert(commentAckB?.success === true, "User B simultaneous commenting must succeed.");
    console.log("  ✓ Test 11 Passed: Multi-user commenting on same comment thread succeeds (shared operation).\n");

    // Clean up
    await Promise.all([
      new Promise<void>((resolve) =>
        clientA1.emit(SocketEvents.INTERACTION_END, { boardId: board1Str, interactionId: selectAckA.data.interactionId }, () => resolve())
      ),
      new Promise<void>((resolve) =>
        clientB1.emit(SocketEvents.INTERACTION_END, { boardId: board1Str, interactionId: selectAckB.data.interactionId }, () => resolve())
      ),
      new Promise<void>((resolve) =>
        clientA1.emit(SocketEvents.INTERACTION_END, { boardId: board1Str, interactionId: commentAckA.data.interactionId }, () => resolve())
      ),
      new Promise<void>((resolve) =>
        clientB1.emit(SocketEvents.INTERACTION_END, { boardId: board1Str, interactionId: commentAckB.data.interactionId }, () => resolve())
      ),
    ]);

    // =========================================================================
    // Test 12: User can own multiple different targets
    // =========================================================================
    console.log("Test 12: User can own multiple different targets simultaneously");
    let multiTargetAck: any = null;
    await new Promise<void>((resolve) => {
      clientA1.emit(
        SocketEvents.INTERACTION_START,
        {
          boardId: board1Str,
          type: "moving",
          targets: [
            { type: "shape", id: shape1Str },
            { type: "shape", id: shape2Str },
          ],
        },
        (ack: any) => {
          multiTargetAck = ack;
          resolve();
        }
      );
    });
    assert(multiTargetAck?.success === true, "User A must succeed in moving multiple shapes.");
    console.log("  ✓ Test 12 Passed: User can own multiple targets in a single interaction.\n");

    // =========================================================================
    // Test 13–16: Multi-Tab Isolation & Disconnect Cleanup
    // =========================================================================
    console.log("Test 13–16: Multi-Tab Isolation & Disconnect Cleanup");

    // User A opens Tab 2 (Client A2)
    const clientA2 = clientIO(serverUrl, {
      auth: { token: `Bearer ${tokenUserA}` },
      transports: ["websocket"],
      forceNew: true,
    });
    await new Promise<void>((resolve) => clientA2.on("connect", () => resolve()));
    await new Promise<void>((resolve) => clientA2.emit(SocketEvents.BOARD_JOIN, { boardId: board1Str }, () => resolve()));

    // Tab A2 attempts to move Shape 1 (which Tab A1 is moving) -> INTERACTION_CONFLICT
    let tab2MoveAck: any = null;
    await new Promise<void>((resolve) => {
      clientA2.emit(
        SocketEvents.INTERACTION_START,
        {
          boardId: board1Str,
          type: "moving",
          targets: [{ type: "shape", id: shape1Str }],
        },
        (ack: any) => {
          tab2MoveAck = ack;
          resolve();
        }
      );
    });
    assert(tab2MoveAck?.success === false, "Tab 2 for same user must be blocked by Tab 1's lock.");
    assert(tab2MoveAck?.error?.code === "INTERACTION_CONFLICT", "Error must be INTERACTION_CONFLICT.");
    console.log("  ✓ Test 13 Passed: Multi-tab same user socket isolation verified.");

    // Tab A2 starts a different interaction (moving Shape 2 isn't allowed because A1 owns both, let's have A2 select)
    let tab2SelectAck: any = null;
    await new Promise<void>((resolve) => {
      clientA2.emit(
        SocketEvents.INTERACTION_START,
        {
          boardId: board1Str,
          type: "selecting",
          targets: [{ type: "shape", id: shape1Str }],
        },
        (ack: any) => {
          tab2SelectAck = ack;
          resolve();
        }
      );
    });
    assert(tab2SelectAck?.success === true, "Tab 2 selection must succeed.");

    // Test 14 & 16: Closing Tab 1 removes Tab 1's interactions and frees Shape 1
    let peerBReceivedEndOnDisconnect: InteractionEndBroadcastPayload | null = null;
    clientB1.on(SocketEvents.INTERACTION_END, (p: InteractionEndBroadcastPayload) => {
      peerBReceivedEndOnDisconnect = p;
    });

    clientA1.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 60));

    assert(peerBReceivedEndOnDisconnect !== null, "Peer B must receive interaction:end broadcast when Tab A1 disconnects.");
    assert(
      (peerBReceivedEndOnDisconnect as any)?.interactionId === multiTargetAck.data.interactionId,
      "Ended interactionId must match Tab A1's interaction."
    );

    // Tab A2's selection interaction must still be active
    const activeA2 = interactionManager.getUserInteractions(board1Str, userAId.toString());
    assert(activeA2.length === 1, "Tab A2 interaction must remain active after Tab A1 disconnects.");
    assert(activeA2[0].interactionId === tab2SelectAck.data.interactionId, "Remaining interaction must be Tab A2's.");
    console.log("  ✓ Test 14 & 16 Passed: Disconnecting Tab A1 cleans only Tab A1 interactions and broadcasts interaction:end.");

    // Test 15: Closing final Tab A2 cleans remaining interactions
    clientA2.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 60));
    const activeAfterAllA = interactionManager.getUserInteractions(board1Str, userAId.toString());
    assert(activeAfterAllA.length === 0, "Closing final tab must leave 0 active interactions for User A.");
    console.log("  ✓ Test 15 Passed: Closing final tab cleans all remaining user interactions.\n");

    // =========================================================================
    // Test 17: Stale Interaction Timeout Cleanup (10s Inactivity)
    // =========================================================================
    console.log("Test 17: Stale Interaction Timeout Cleanup (10s Inactivity)");

    // User B starts moving Shape 1
    let staleAck: any = null;
    await new Promise<void>((resolve) => {
      clientB1.emit(
        SocketEvents.INTERACTION_START,
        {
          boardId: board1Str,
          type: "moving",
          targets: [{ type: "shape", id: shape1Str }],
        },
        (ack: any) => {
          staleAck = ack;
          resolve();
        }
      );
    });
    assert(staleAck?.success === true, "User B start moving must succeed.");
    const staleInteractionId = staleAck.data.interactionId;

    // Manually backdate the interaction's updatedAt to simulate 15 seconds of inactivity
    const staleInteraction = (interactionManager as any).interactions.get(staleInteractionId);
    if (staleInteraction) {
      staleInteraction.updatedAt = new Date(Date.now() - 15000).toISOString();
    }

    // Trigger pruneStaleInteractions
    socketServer.pruneStaleInteractions(10000);

    const activeAfterTimeout = interactionManager.getBoardInteractions(board1Str);
    const foundStale = activeAfterTimeout.find((i) => i.interactionId === staleInteractionId);
    assert(!foundStale, "Stale interaction must be purged by timeout pruner.");
    console.log("  ✓ Test 17 Passed: Inactive interactions purged after 10s timeout.\n");

    // =========================================================================
    // Test 18 & 19: Payload Validation & Foreign Board Rejection
    // =========================================================================
    console.log("Test 18 & 19: Payload Validation & Foreign Board Rejection");

    // Test 18: Invalid payload (empty targets)
    let invalidAck: any = null;
    await new Promise<void>((resolve) => {
      clientB1.emit(
        SocketEvents.INTERACTION_START,
        {
          boardId: board1Str,
          type: "moving",
          targets: [], // Invalid: min 1 required
        },
        (ack: any) => {
          invalidAck = ack;
          resolve();
        }
      );
    });
    assert(invalidAck?.success === false, "Empty targets must fail validation.");
    assert(invalidAck?.error?.code === "BAD_REQUEST", "Empty targets error must be BAD_REQUEST.");
    console.log("  ✓ Test 18 Passed: Invalid interaction payload rejected with BAD_REQUEST.");

    // Test 19: Foreign board interaction attempt
    let foreignAck: any = null;
    await new Promise<void>((resolve) => {
      clientB1.emit(
        SocketEvents.INTERACTION_START,
        {
          boardId: board2Str, // User B is not a member of Board 2
          type: "moving",
          targets: [{ type: "shape", id: shape3Str }],
        },
        (ack: any) => {
          foreignAck = ack;
          resolve();
        }
      );
    });
    assert(foreignAck?.success === false, "Foreign board interaction must fail.");
    assert(foreignAck?.error?.code === "FORBIDDEN", "Foreign board error must be FORBIDDEN.");
    console.log("  ✓ Test 19 Passed: Foreign board interaction rejected with FORBIDDEN.\n");

    // =========================================================================
    // Test 20 & 21: Snapshot Request & Fresh Hydration
    // =========================================================================
    console.log("Test 20 & 21: Snapshot Request & Fresh Hydration");

    // User B starts moving Shape 2
    let snapStartAck: any = null;
    await new Promise<void>((resolve) => {
      clientB1.emit(
        SocketEvents.INTERACTION_START,
        {
          boardId: board1Str,
          type: "moving",
          targets: [{ type: "shape", id: shape2Str }],
        },
        (ack: any) => {
          snapStartAck = ack;
          resolve();
        }
      );
    });

    let snapshotAck: any = null;
    await new Promise<void>((resolve) => {
      clientB1.emit(
        SocketEvents.INTERACTION_SNAPSHOT,
        { boardId: board1Str },
        (ack: any) => {
          snapshotAck = ack;
          resolve();
        }
      );
    });

    assert(snapshotAck?.success === true, "Snapshot request must succeed.");
    assert(Array.isArray(snapshotAck?.data?.interactions), "Snapshot must return interactions array.");
    const foundInSnap = snapshotAck.data.interactions.find((i: any) => i.interactionId === snapStartAck.data.interactionId);
    assert(Boolean(foundInSnap), "Active interaction must be included in snapshot.");
    console.log("  ✓ Test 20 & 21 Passed: Interaction snapshot retrieval and hydration verified.\n");

    // =========================================================================
    // Test 22: Stale Socket / Non-Owner Cannot Update Interaction
    // =========================================================================
    console.log("Test 22: Stale Socket / Non-Owner Cannot Update Interaction");

    // Client C attempts to update User B's interaction
    const clientC = clientIO(serverUrl, {
      auth: { token: `Bearer ${tokenUserC}` },
      transports: ["websocket"],
      forceNew: true,
    });
    await new Promise<void>((resolve) => clientC.on("connect", () => resolve()));
    await new Promise<void>((resolve) => clientC.emit(SocketEvents.BOARD_JOIN, { boardId: board2Str }, () => resolve()));

    let staleUpdateAck: any = null;
    await new Promise<void>((resolve) => {
      clientC.emit(
        SocketEvents.INTERACTION_UPDATE,
        {
          boardId: board2Str,
          interactionId: snapStartAck.data.interactionId,
          data: { hacker: true },
        },
        (ack: any) => {
          staleUpdateAck = ack;
          resolve();
        }
      );
    });
    assert(staleUpdateAck?.success === false, "Updating interaction from wrong socket must fail.");
    assert(staleUpdateAck?.error?.code === "NOT_FOUND" || staleUpdateAck?.error?.code === "FORBIDDEN", "Error must be NOT_FOUND or FORBIDDEN.");
    console.log("  ✓ Test 22 Passed: Stale / non-owner socket cannot update interaction.\n");

    // =========================================================================
    // Test 23–26: Ephemeral Purity Guarantees (ZERO DB Writes, ZERO Revision Bumps)
    // =========================================================================
    console.log("Test 23–26: Ephemeral Purity Guarantees (ZERO DB Writes, ZERO Revision Bumps)");

    const boardDocBefore = await BoardModel.findById(board1Id);
    const initialRevision = boardDocBefore?.collaborationRevision ?? 0;

    const shapeDocBefore = await ShapeModel.findById(shape1Id);
    const initialShapeVersion = shapeDocBefore?.version ?? 1;

    const mutationCountBefore = await MutationRecordModel.countDocuments({ boardId: board1Id });

    // Perform high-frequency interaction operations (start, update, end in a rapid loop)
    for (let i = 0; i < 20; i++) {
      clientB1.emit(SocketEvents.INTERACTION_UPDATE, {
        boardId: board1Str,
        interactionId: snapStartAck.data.interactionId,
        data: { step: i },
      });
    }
    await new Promise((resolve) => setTimeout(resolve, 60));

    const boardDocAfter = await BoardModel.findById(board1Id);
    const shapeDocAfter = await ShapeModel.findById(shape1Id);
    const mutationCountAfter = await MutationRecordModel.countDocuments({ boardId: board1Id });

    assert(
      (boardDocAfter?.collaborationRevision ?? 0) === initialRevision,
      "Interaction operations must NEVER increment collaborationRevision."
    );
    assert(
      (shapeDocAfter?.version ?? 1) === initialShapeVersion,
      "Interaction operations must NEVER alter Shape.version."
    );
    assert(
      mutationCountAfter === mutationCountBefore,
      "Interaction operations must NEVER create mutation records in MongoDB."
    );
    console.log("  ✓ Test 23–26 Passed: Ephemeral purity invariant preserved with 0 persistence side-effects.\n");

    // =========================================================================
    // Test 27: Standalone InteractionManager Unit Invariants
    // =========================================================================
    console.log("Test 27: Standalone InteractionManager Unit Invariants");
    const testMgr = new InteractionManager();

    // Start exclusive interaction
    const res1 = testMgr.startInteraction("b-100", "s-1", "u-1", "moving", [{ type: "shape", id: "sh-1" }]);
    assert(res1.success, "testMgr start must succeed.");

    // Conflict check
    const res2 = testMgr.startInteraction("b-100", "s-2", "u-2", "resizing", [{ type: "shape", id: "sh-1" }]);
    assert(!res2.success && res2.conflict?.code === "INTERACTION_CONFLICT", "testMgr conflict must be detected.");

    // Shared check
    const res3 = testMgr.startInteraction("b-100", "s-2", "u-2", "selecting", [{ type: "shape", id: "sh-1" }]);
    assert(res3.success, "testMgr selecting on same shape must succeed.");

    // Disconnect cleanup
    const removed = testMgr.removeSocketInteractions("s-1");
    assert(removed.length === 1, "testMgr removeSocketInteractions must remove 1 interaction.");

    // Target freed
    const res4 = testMgr.startInteraction("b-100", "s-2", "u-2", "resizing", [{ type: "shape", id: "sh-1" }]);
    assert(res4.success, "testMgr resizing must succeed after s-1 disconnects.");

    testMgr.clear();
    assert(testMgr.getBoardInteractions("b-100").length === 0, "testMgr clear must empty all maps.");
    console.log("  ✓ Test 27 Passed: Standalone InteractionManager invariants verified.\n");

    // Cleanup client connections
    clientB1.disconnect();
    clientC.disconnect();

    console.log("=========================================================================");
    console.log("  ALL 27 COLLABORATIVE INTERACTION INTEGRATION TESTS PASSED CLEANLY!");
    console.log("=========================================================================\n");
  } finally {
    // Teardown database and HTTP server
    await BoardModel.deleteMany({ _id: { $in: [board1Id!, board2Id!] } });
    await WorkspaceModel.deleteMany({ _id: { $in: [workspace1Id!, workspace2Id!] } });
    await WorkspaceMemberModel.deleteMany({ workspaceId: { $in: [workspace1Id!, workspace2Id!] } });
    await CanvasModel.deleteMany({ _id: { $in: [canvas1Id!, canvas2Id!] } });
    await ShapeModel.deleteMany({ _id: { $in: [shape1Id!, shape2Id!, shape3Id!] } });
    await UserModel.deleteMany({ _id: { $in: [userAId, userBId, userCId] } });

    await socketServer.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    await mongoose.disconnect();
  }
}

runSocketInteractionTests().catch((err) => {
  console.error("Test Suite Failed:", err);
  process.exit(1);
});
