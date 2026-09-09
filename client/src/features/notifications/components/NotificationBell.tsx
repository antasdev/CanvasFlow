import { Bell } from "lucide-react";
import React from "react";

import { useNotifications, useNotificationSocket } from "../hooks";
import { NotificationBadge } from "./NotificationBadge";
import { NotificationPanel } from "./NotificationPanel";

export interface NotificationBellProps {
  className?: string;
}

export function NotificationBell({
  className = "",
}: NotificationBellProps): React.JSX.Element {
  // Initialize Socket.IO subscription & reconnect recovery
  useNotificationSocket();

  const { unreadCount, isOpen, togglePanel, setIsOpen } = useNotifications();

  return (
    <div className={`relative inline-block ${className}`}>
      <button
        type="button"
        onClick={togglePanel}
        className={`relative flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200/80 bg-white/95 backdrop-blur-md text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-1 ${
          isOpen ? "bg-gray-100 text-gray-900 ring-2 ring-blue-500" : ""
        }`}
        aria-label={`Notifications (${unreadCount} unread)`}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <Bell className="h-4 w-4" />
        <NotificationBadge count={unreadCount} />
      </button>

      <NotificationPanel isOpen={isOpen} onClose={() => setIsOpen(false)} />
    </div>
  );
}
