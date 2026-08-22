/**
 * Curated palette of high-contrast collaborator cursor colors.
 */
export const CURSOR_PALETTE = [
  "#EF4444", // Red
  "#F59E0B", // Amber
  "#10B981", // Emerald
  "#3B82F6", // Blue
  "#6366F1", // Indigo
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#14B8A6", // Teal
  "#F97316", // Orange
  "#06B6D4", // Cyan
] as const;

/**
 * Generates a deterministic color for a collaborator based on their userId.
 * Guarantees the same userId always receives the identical color across renders.
 *
 * @param userId - Unique user identifier
 * @returns Hex color string from CURSOR_PALETTE
 */
export function getCursorColor(userId: string): string {
  if (!userId) {
    return CURSOR_PALETTE[0];
  }

  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash << 5) - hash + userId.charCodeAt(i);
    hash |= 0;
  }

  const index = Math.abs(hash) % CURSOR_PALETTE.length;
  return CURSOR_PALETTE[index];
}

/**
 * Returns a friendly, short display label for a collaborator's cursor.
 *
 * @param userId - Unique user identifier
 * @returns Short human-readable collaborator label
 */
export function getCursorLabel(userId: string): string {
  if (!userId) {
    return "Collaborator";
  }

  if (userId.length <= 6) {
    return `User ${userId}`;
  }

  return `User ${userId.slice(-4)}`;
}
