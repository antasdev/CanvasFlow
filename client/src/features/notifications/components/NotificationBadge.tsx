import React from "react";

export interface NotificationBadgeProps {
  count: number;
  maxDisplay?: number;
  className?: string;
}

export function NotificationBadge({
  count,
  maxDisplay = 99,
  className = "",
}: NotificationBadgeProps): React.JSX.Element | null {
  if (count <= 0) {
    return null;
  }

  const displayCount = count > maxDisplay ? `${maxDisplay}+` : count.toString();

  return (
    <span
      className={`absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white shadow-sm ring-2 ring-white transition-transform duration-150 animate-in zoom-in-50 ${className}`}
      aria-label={`${count} unread notifications`}
    >
      {displayCount}
    </span>
  );
}
