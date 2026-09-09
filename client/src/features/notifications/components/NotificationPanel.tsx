import { CheckCheck, X } from "lucide-react";
import React, { useEffect, useRef } from "react";

import { useNotifications } from "../hooks";
import { NotificationList } from "./NotificationList";

export interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  className?: string;
}

export function NotificationPanel({
  isOpen,
  onClose,
  className = "",
}: NotificationPanelProps): React.JSX.Element | null {
  const panelRef = useRef<HTMLDivElement>(null);
  const { unreadCount, markAllAsRead, fetchNotifications } = useNotifications();

  // Load initial notifications on open
  useEffect(() => {
    if (isOpen) {
      void fetchNotifications(true);
    }
  }, [isOpen, fetchNotifications]);

  // Click outside and Escape key handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    const handleClickOutside = (event: MouseEvent): void => {
      if (
        panelRef.current &&
        !panelRef.current.contains(event.target as Node)
      ) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handleClickOutside);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      className={`absolute right-0 top-full mt-2 w-80 sm:w-96 rounded-xl bg-white shadow-2xl ring-1 ring-black/10 z-50 overflow-hidden flex flex-col animate-in fade-in-0 zoom-in-95 duration-150 ${className}`}
      role="dialog"
      aria-label="Notifications popover"
      aria-modal="true"
    >
      {/* Panel Header */}
      <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3 bg-white">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-900">Notifications</h3>
          {unreadCount > 0 && (
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-700">
              {unreadCount} unread
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void markAllAsRead()}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors"
              title="Mark all as read"
              aria-label="Mark all as read"
            >
              <CheckCheck className="h-3.5 w-3.5 text-blue-600" />
              <span>Mark all read</span>
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
            title="Close notifications panel"
            aria-label="Close notifications panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Notifications List */}
      <NotificationList onClosePanel={onClose} />
    </div>
  );
}
