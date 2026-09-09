import { beforeEach, describe, expect, it } from "vitest";

import { useMutationStore } from "@/features/canvas/store/mutation.store";
import { mutationManager } from "@/features/canvas/services/mutation-manager";
import { useCollaborationStore } from "@/features/canvas/store/collaboration.store";

import { useCommentStore } from "../store";
import type { Comment } from "../types";

describe("Comment Collaboration Reliability Frontend Tests", () => {
  const mockCommentV1: Comment = {
    id: "comment-101",
    boardId: "board-1",
    canvasId: "canvas-1",
    shapeId: null,
    authorId: "user-1",
    author: {
      id: "user-1",
      fullName: "Alice Tester",
    },
    parentCommentId: null,
    position: { x: 100, y: 100 },
    content: "Original text v1",
    mentions: [],
    isResolved: false,
    isEdited: false,
    isDeleted: false,
    version: 1,
    createdAt: "2026-09-09T10:00:00.000Z",
    updatedAt: "2026-09-09T10:00:00.000Z",
  };

  beforeEach(() => {
    useCommentStore.getState().clearComments();
    useMutationStore.getState().reset();
    useCollaborationStore.getState().reset();
  });

  it("1. OCC 409 Conflict Rollback: rolls back optimistic comment update on conflict", () => {
    useCommentStore.getState().addComment(mockCommentV1);

    // User performs optimistic update
    const previous = useCommentStore.getState().comments["comment-101"];
    useCommentStore.getState().updateComment({
      ...previous,
      content: "Optimistically edited text",
      isEdited: true,
      updatedAt: new Date().toISOString(),
    });

    expect(useCommentStore.getState().comments["comment-101"].content).toBe(
      "Optimistically edited text"
    );

    // Simulate OCC 409 error -> Rollback
    useCommentStore.getState().updateComment(previous);

    expect(useCommentStore.getState().comments["comment-101"].content).toBe(
      "Original text v1"
    );
    expect(useCommentStore.getState().comments["comment-101"].isEdited).toBe(false);
  });

  it("2. RBAC 403 Downgrade Rollback: rolls back optimistic resolution when forbidden", () => {
    useCommentStore.getState().addComment(mockCommentV1);

    // User optimistically resolves comment
    useCommentStore.getState().resolveComment("comment-101", true);
    expect(useCommentStore.getState().comments["comment-101"].isResolved).toBe(true);

    // Simulate 403 Forbidden error -> Rollback
    useCommentStore.getState().resolveComment("comment-101", false);
    expect(useCommentStore.getState().comments["comment-101"].isResolved).toBe(false);
  });

  it("3. Version-Aware Freshness: rejects stale entity versions and accepts newer versions", () => {
    const commentV3: Comment = {
      ...mockCommentV1,
      version: 3,
      content: "State at version 3",
    };

    useCommentStore.getState().addComment(commentV3);

    // Stale incoming event at version 2 arrives
    const staleCommentV2: Comment = {
      ...mockCommentV1,
      version: 2,
      content: "Stale out-of-order text v2",
    };

    useCommentStore.getState().updateComment(staleCommentV2);
    expect(useCommentStore.getState().comments["comment-101"].version).toBe(3);
    expect(useCommentStore.getState().comments["comment-101"].content).toBe(
      "State at version 3"
    );

    // Newer incoming event at version 4 arrives
    const newerCommentV4: Comment = {
      ...mockCommentV1,
      version: 4,
      content: "Newest authoritative text v4",
    };

    useCommentStore.getState().updateComment(newerCommentV4);
    expect(useCommentStore.getState().comments["comment-101"].version).toBe(4);
    expect(useCommentStore.getState().comments["comment-101"].content).toBe(
      "Newest authoritative text v4"
    );
  });

  it("4. Recovery Reconciliation: preserves active in-flight optimistic comments during recovery", () => {
    useCommentStore.getState().addComment(mockCommentV1);

    // Add in-flight optimistic comment
    const optimisticComment: Comment = {
      id: "temp_999",
      boardId: "board-1",
      canvasId: "canvas-1",
      shapeId: null,
      authorId: "user-1",
      author: { id: "user-1", fullName: "Alice Tester" },
      parentCommentId: null,
      position: { x: 200, y: 200 },
      content: "In-flight optimistic draft",
      mentions: [],
      isResolved: false,
      isEdited: false,
      isDeleted: false,
      isOptimistic: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    useCommentStore.getState().addOptimisticComment(optimisticComment);

    // Authoritative recovery response arrives from server
    const serverComments: Comment[] = [
      {
        ...mockCommentV1,
        content: "Authoritative server comment 1",
      },
      {
        id: "comment-102",
        boardId: "board-1",
        canvasId: "canvas-1",
        shapeId: null,
        authorId: "user-2",
        author: { id: "user-2", fullName: "Bob Dylan" },
        parentCommentId: null,
        position: { x: 300, y: 300 },
        content: "Authoritative server comment 2",
        mentions: [],
        isResolved: false,
        isEdited: false,
        isDeleted: false,
        version: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    useCommentStore.getState().reconcileAuthoritativeComments(serverComments);

    const finalComments = useCommentStore.getState().comments;
    expect(Object.keys(finalComments).length).toBe(3);
    expect(finalComments["comment-101"]).toBeDefined();
    expect(finalComments["comment-102"]).toBeDefined();
    // In-flight optimistic comment preserved without flickering
    expect(finalComments["temp_999"]).toBeDefined();
    expect(finalComments["temp_999"].isOptimistic).toBe(true);
  });

  it("5. Temporary ID Atomic Replacement: replaces temporary ID with canonical server ID", () => {
    useCommentStore.getState().setActiveThreadId("temp_123");

    const optimisticComment: Comment = {
      id: "temp_123",
      boardId: "board-1",
      canvasId: "canvas-1",
      shapeId: null,
      authorId: "user-1",
      author: { id: "user-1", fullName: "Alice Tester" },
      parentCommentId: null,
      position: { x: 200, y: 200 },
      content: "Optimistic comment text",
      mentions: [],
      isResolved: false,
      isEdited: false,
      isDeleted: false,
      isOptimistic: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    useCommentStore.getState().addOptimisticComment(optimisticComment);

    const authoritative: Comment = {
      ...optimisticComment,
      id: "6aa13b121419752f8e89d799",
      isOptimistic: false,
      version: 1,
    };

    useCommentStore.getState().replaceOptimisticComment("temp_123", authoritative);

    const state = useCommentStore.getState();
    expect(state.comments["temp_123"]).toBeUndefined();
    expect(state.comments["6aa13b121419752f8e89d799"]).toBeDefined();
    expect(state.activeThreadId).toBe("6aa13b121419752f8e89d799");
  });

  it("6. Mutation Journal Tracking: tracks comment mutation lifecycle", () => {
    const mutationId = mutationManager.createMutationId();

    const registered = mutationManager.registerMutation({
      mutationId,
      boardId: "board-1",
      resourceType: "comment",
      resourceId: "comment-101",
      operation: "update",
      expectedVersion: 1,
      intent: {
        resourceType: "comment",
        resourceId: "comment-101",
        operation: "update",
        expectedVersion: 1,
        payload: { content: "Updated content" },
      },
    });

    expect(registered.status).toBe("pending");
    expect(useMutationStore.getState().mutations[mutationId].status).toBe("pending");

    // Test transition to failed
    useMutationStore.getState().markFailed(mutationId, "Network timeout");
    expect(useMutationStore.getState().mutations[mutationId].status).toBe("failed");
    expect(useMutationStore.getState().mutations[mutationId].error).toBe("Network timeout");

    // Test transition to markConfirmed cleans up mutation from active journal
    useMutationStore.getState().markConfirmed(mutationId, 105, "evt-123");
    expect(useMutationStore.getState().mutations[mutationId]).toBeUndefined();
  });

  it("7. Monotonic Collaboration Revision Freshness via checkEventFreshness", () => {
    const boardId = "board-1";
    useCollaborationStore.getState().setRevision(boardId, 10);

    // Freshness check for older revision (e.g. 8) -> Action: ignore
    const staleCheck = useCollaborationStore
      .getState()
      .checkEventFreshness(boardId, 8);
    expect(staleCheck.action).toBe("ignore");

    // Freshness check for current revision (10) -> Action: ignore (duplicate)
    const duplicateCheck = useCollaborationStore
      .getState()
      .checkEventFreshness(boardId, 10);
    expect(duplicateCheck.action).toBe("ignore");

    // Freshness check for next contiguous revision (11) -> Action: apply
    const validCheck = useCollaborationStore
      .getState()
      .checkEventFreshness(boardId, 11);
    expect(validCheck.action).toBe("apply");
    expect(useCollaborationStore.getState().getRevision(boardId)).toBe(11);

    // Freshness check for gap revision (15) -> Action: gap
    const gapCheck = useCollaborationStore
      .getState()
      .checkEventFreshness(boardId, 15);
    expect(gapCheck.action).toBe("gap");
  });
});
