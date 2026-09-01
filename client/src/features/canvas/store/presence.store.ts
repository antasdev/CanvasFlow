import { create } from "zustand";

import type {
  PresenceActivity,
  PresenceCursor,
  PresenceUser,
} from "@/services/socket";

export interface PresenceState {
  users: Record<string, PresenceUser>;
  cursors: Record<string, PresenceCursor>;
  localActivity: PresenceActivity;

  /**
   * Hydrates state from authoritative presence snapshot
   */
  setSnapshot: (users: PresenceUser[], cursors: PresenceCursor[]) => void;

  /**
   * Adds or updates a user presence model
   */
  addUser: (user: PresenceUser) => void;

  /**
   * Removes a user and associated cursor from active presence
   */
  removeUser: (userId: string) => void;

  /**
   * Updates an individual collaborator cursor position
   */
  updateCursor: (cursor: PresenceCursor) => void;

  /**
   * Updates a collaborator's active interaction state
   */
  updateActivity: (
    userId: string,
    activity: PresenceActivity,
    updatedAt?: string
  ) => void;

  /**
   * Sets the local user's current canvas interaction activity
   */
  setLocalActivity: (activity: PresenceActivity) => void;

  /**
   * Resets all presence state (upon disconnect or epoch invalidation)
   */
  reset: () => void;
}

const initialState = {
  users: {} as Record<string, PresenceUser>,
  cursors: {} as Record<string, PresenceCursor>,
  localActivity: "idle" as PresenceActivity,
};

/**
 * Dedicated Zustand store managing ephemeral collaborative presence state.
 * Strictly decoupled from canvas entity mutations, undo/redo history, and durable board revisions.
 */
export const usePresenceStore = create<PresenceState>()((set) => ({
  ...initialState,

  setSnapshot: (users: PresenceUser[], cursors: PresenceCursor[]): void => {
    const userMap: Record<string, PresenceUser> = {};
    for (const u of users) {
      userMap[u.userId] = u;
    }

    const cursorMap: Record<string, PresenceCursor> = {};
    for (const c of cursors) {
      cursorMap[c.userId] = c;
    }

    set({
      users: userMap,
      cursors: cursorMap,
    });
  },

  addUser: (user: PresenceUser): void => {
    set((state) => ({
      users: {
        ...state.users,
        [user.userId]: user,
      },
    }));
  },

  removeUser: (userId: string): void => {
    set((state) => {
      const nextUsers = { ...state.users };
      delete nextUsers[userId];

      const nextCursors = { ...state.cursors };
      delete nextCursors[userId];

      return {
        users: nextUsers,
        cursors: nextCursors,
      };
    });
  },

  updateCursor: (cursor: PresenceCursor): void => {
    set((state) => ({
      cursors: {
        ...state.cursors,
        [cursor.userId]: cursor,
      },
    }));
  },

  updateActivity: (
    userId: string,
    activity: PresenceActivity,
    updatedAt?: string
  ): void => {
    set((state) => {
      const user = state.users[userId];
      if (!user) return state;

      return {
        users: {
          ...state.users,
          [userId]: {
            ...user,
            activity,
            lastSeenAt: updatedAt ?? new Date().toISOString(),
          },
        },
      };
    });
  },

  setLocalActivity: (activity: PresenceActivity): void => {
    set({ localActivity: activity });
  },

  reset: (): void => {
    set({ ...initialState });
  },
}));
