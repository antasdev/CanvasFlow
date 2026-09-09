import { BellOff, Loader2 } from "lucide-react";
import React from "react";

import { useNotifications } from "../hooks";
import type { NotificationFilterType } from "../types";
import { NotificationItem } from "./NotificationItem";

export interface NotificationListProps {
  onClosePanel?: () => void;
}

export function NotificationList({
  onClosePanel,
}: NotificationListProps): React.JSX.Element {
  const {
    notifications,
    filter,
    isLoading,
    isLoadingMore,
    hasMore,
    setFilter,
    fetchMore,
    markAsRead,
  } = useNotifications();

  return (
    <div className="flex flex-col h-full max-h-[420px]">
      {/* Filter Tabs */}
      <div className="flex border-b border-gray-200 bg-gray-50/50 px-3 py-1.5 gap-2">
        <button
          type="button"
          onClick={() => setFilter("all" as NotificationFilterType)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            filter === "all"
              ? "bg-white text-gray-900 shadow-xs ring-1 ring-gray-200"
              : "text-gray-500 hover:text-gray-900"
          }`}
        >
          All
        </button>
        <button
          type="button"
          onClick={() => setFilter("unread" as NotificationFilterType)}
          className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
            filter === "unread"
              ? "bg-white text-gray-900 shadow-xs ring-1 ring-gray-200"
              : "text-gray-500 hover:text-gray-900"
          }`}
        >
          Unread
        </button>
      </div>

      {/* Notifications Scrollable Container */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center p-8 text-gray-400 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
            <span className="text-xs">Loading notifications...</span>
          </div>
        ) : notifications.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center text-gray-400 gap-2">
            <BellOff className="h-8 w-8 text-gray-300 stroke-[1.5]" />
            <p className="text-xs font-medium text-gray-600">
              {filter === "unread"
                ? "No unread notifications"
                : "No notifications yet"}
            </p>
            <p className="text-[11px] text-gray-400 max-w-[200px]">
              {filter === "unread"
                ? "You're all caught up! Check back later."
                : "When someone mentions you or replies to your comments, they will appear here."}
            </p>
          </div>
        ) : (
          <div>
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onMarkAsRead={markAsRead}
                onClosePanel={onClosePanel}
              />
            ))}

            {/* Load More Button */}
            {hasMore && (
              <div className="p-2 text-center border-t border-gray-100 bg-gray-50/50">
                <button
                  type="button"
                  onClick={() => void fetchMore()}
                  disabled={isLoadingMore}
                  className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 hover:text-blue-700 disabled:opacity-50 transition-colors"
                >
                  {isLoadingMore ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Load more notifications"
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
