import { create } from "zustand";
import type {
  CollaborativeInteraction,
  InteractionTarget,
  InteractionType,
} from "@/services/socket";

export interface InteractionState {
  // All active interactions on the current board (indexed by interactionId)
  interactions: Record<string, CollaborativeInteraction>;

  // Interactions initiated locally on this client (indexed by interactionId)
  localInteractions: Record<string, CollaborativeInteraction>;

  // Hydrates authoritative snapshot from server
  setSnapshot: (interactions: CollaborativeInteraction[]) => void;

  // Adds or replaces an interaction in the store
  addInteraction: (interaction: CollaborativeInteraction) => void;

  // Updates an existing interaction
  updateInteraction: (
    interactionId: string,
    updates: {
      targets?: InteractionTarget[];
      data?: Record<string, unknown>;
      updatedAt?: string;
    }
  ) => void;

  // Removes an interaction by ID
  removeInteraction: (interactionId: string) => void;

  // Tracks a locally initiated interaction
  setLocalInteraction: (interaction: CollaborativeInteraction) => void;

  // Removes a locally tracked interaction
  removeLocalInteraction: (interactionId: string) => void;

  // Fast helper to query if a target has an active exclusive owner (e.g. moving, resizing, editing text)
  getTargetOwner: (
    targetType: string,
    targetId: string,
    excludeUserId?: string
  ) => CollaborativeInteraction | null;

  // Resets store state (e.g. board navigation or reconnect epoch reset)
  reset: () => void;
}

function isExclusiveType(type: InteractionType): boolean {
  return (
    type === "moving" ||
    type === "resizing" ||
    type === "rotating" ||
    type === "editing-text"
  );
}

export const useInteractionStore = create<InteractionState>((set, get) => ({
  interactions: {},
  localInteractions: {},

  setSnapshot: (interactions: CollaborativeInteraction[]) => {
    const map: Record<string, CollaborativeInteraction> = {};
    for (const interaction of interactions) {
      map[interaction.interactionId] = interaction;
    }
    set({ interactions: map });
  },

  addInteraction: (interaction: CollaborativeInteraction) => {
    set((state) => ({
      interactions: {
        ...state.interactions,
        [interaction.interactionId]: interaction,
      },
    }));
  },

  updateInteraction: (
    interactionId: string,
    updates: {
      targets?: InteractionTarget[];
      data?: Record<string, unknown>;
      updatedAt?: string;
    }
  ) => {
    set((state) => {
      const existing = state.interactions[interactionId];
      if (!existing) return state;

      const updated: CollaborativeInteraction = {
        ...existing,
        targets: updates.targets ? [...updates.targets] : existing.targets,
        data: updates.data !== undefined ? { ...existing.data, ...updates.data } : existing.data,
        updatedAt: updates.updatedAt ?? new Date().toISOString(),
      };

      return {
        interactions: {
          ...state.interactions,
          [interactionId]: updated,
        },
      };
    });
  },

  removeInteraction: (interactionId: string) => {
    set((state) => {
      const { [interactionId]: _, ...rest } = state.interactions;
      return { interactions: rest };
    });
  },

  setLocalInteraction: (interaction: CollaborativeInteraction) => {
    set((state) => ({
      localInteractions: {
        ...state.localInteractions,
        [interaction.interactionId]: interaction,
      },
      interactions: {
        ...state.interactions,
        [interaction.interactionId]: interaction,
      },
    }));
  },

  removeLocalInteraction: (interactionId: string) => {
    set((state) => {
      const { [interactionId]: _, ...restLocal } = state.localInteractions;
      const { [interactionId]: __, ...restAll } = state.interactions;
      return {
        localInteractions: restLocal,
        interactions: restAll,
      };
    });
  },

  getTargetOwner: (
    targetType: string,
    targetId: string,
    excludeUserId?: string
  ): CollaborativeInteraction | null => {
    const all = Object.values(get().interactions);
    for (const interaction of all) {
      if (excludeUserId && interaction.userId === excludeUserId) {
        continue;
      }

      if (isExclusiveType(interaction.type)) {
        const matches = interaction.targets.some(
          (t) => t.type === targetType && t.id === targetId
        );
        if (matches) {
          return interaction;
        }
      }
    }

    return null;
  },

  reset: () => {
    set({
      interactions: {},
      localInteractions: {},
    });
  },
}));
