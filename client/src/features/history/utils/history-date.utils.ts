import type { VersionSummary } from "../types";

export interface DateGroupedVersions {
  dateGroup: string;
  versions: VersionSummary[];
}

/**
 * Formats a timestamp into a friendly calendar day group label ("Today", "Yesterday", or "MMM d, yyyy").
 */
export function formatDateGroup(dateInput: string | Date): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "Unknown Date";

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  const diffDays = Math.round(
    (today.getTime() - targetDay.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== now.getFullYear() ? "numeric" : undefined,
  });
}

/**
 * Formats a timestamp into friendly time format (e.g., "6:42 PM").
 */
export function formatVersionTime(dateInput: string | Date): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "";

  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Formats a timestamp into full datetime (e.g., "Sep 10, 2026, 6:42 PM").
 */
export function formatFullDateTime(dateInput: string | Date): string {
  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "";

  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

/**
 * Groups an array of versions into date buckets in chronological descending order.
 */
export function groupVersionsByDate(
  versions: VersionSummary[]
): DateGroupedVersions[] {
  const groups: Map<string, VersionSummary[]> = new Map();

  for (const version of versions) {
    const groupKey = formatDateGroup(version.createdAt);
    const existing = groups.get(groupKey);
    if (existing) {
      existing.push(version);
    } else {
      groups.set(groupKey, [version]);
    }
  }

  const result: DateGroupedVersions[] = [];
  groups.forEach((groupVersions, dateGroup) => {
    result.push({
      dateGroup,
      versions: groupVersions,
    });
  });

  return result;
}
