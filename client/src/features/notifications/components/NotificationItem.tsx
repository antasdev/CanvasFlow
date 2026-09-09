import {
  AtSign,
  MessageSquareReply,
  Activity,
  UserPlus,
  Info,
  CheckCircle2,
} from "lucide-react";
import React from "react";
import { useNavigate } from "react-router-dom";

import { useCommentStore } from "@/features/comments/store";

import { NotificationType, type Notification } from "../types";

export interface NotificationItemProps {
  notification: Notification;
  onMarkAsRead?: (id: string) => void;
  onClosePanel?: () => void;
}

function formatRelativeTime(dateString: string): string {
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (isNaN(diffInSeconds) || diffInSeconds < 30) return "just now";
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays < 7) return `${diffInDays}d ago`;
    return date.toLocaleDateString();
  } catch {
    return "";
  }
}

export function NotificationItem({
  notification,
  onMarkAsRead,
  onClosePanel,
}: NotificationItemProps): React.JSX.Element {
  const navigate = useNavigate();
  const actorName = notification.actor?.name || "Someone";
  const actorInitials = (notification.actor?.name || "?")
    .split(" ")
    .map((part) => part[0])
    .join("")
    .substring(0, 2)
    .toUpperCase();

  const getNotificationIcon = (): React.JSX.Element => {
    switch (notification.type) {
      case NotificationType.MENTION:
        return <AtSign className="h-3.5 w-3.5 text-blue-500" />;
      case NotificationType.COMMENT_REPLY:
        return <MessageSquareReply className="h-3.5 w-3.5 text-indigo-500" />;
      case NotificationType.THREAD_ACTIVITY:
        return notification.metadata.resolved ? (
          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
        ) : (
          <Activity className="h-3.5 w-3.5 text-amber-500" />
        );
      case NotificationType.BOARD_INVITATION:
      case NotificationType.WORKSPACE_INVITATION:
        return <UserPlus className="h-3.5 w-3.5 text-purple-500" />;
      default:
        return <Info className="h-3.5 w-3.5 text-gray-500" />;
    }
  };

  const getNotificationMessage = (): React.JSX.Element => {
    switch (notification.type) {
      case NotificationType.MENTION:
        return (
          <span>
            <strong className="font-semibold text-gray-900">{actorName}</strong>{" "}
            mentioned you in a comment
          </span>
        );
      case NotificationType.COMMENT_REPLY:
        return (
          <span>
            <strong className="font-semibold text-gray-900">{actorName}</strong>{" "}
            replied to your comment thread
          </span>
        );
      case NotificationType.THREAD_ACTIVITY:
        return notification.metadata.resolved ? (
          <span>
            <strong className="font-semibold text-gray-900">{actorName}</strong>{" "}
            resolved a comment thread you participated in
          </span>
        ) : (
          <span>
            <strong className="font-semibold text-gray-900">{actorName}</strong>{" "}
            updated activity on a comment thread
          </span>
        );
      case NotificationType.BOARD_INVITATION:
        return (
          <span>
            <strong className="font-semibold text-gray-900">{actorName}</strong>{" "}
            invited you to a board
          </span>
        );
      case NotificationType.WORKSPACE_INVITATION:
        return (
          <span>
            <strong className="font-semibold text-gray-900">{actorName}</strong>{" "}
            invited you to a workspace
          </span>
        );
      default:
        return (
          <span>
            <strong className="font-semibold text-gray-900">{actorName}</strong>{" "}
            sent you a notification
          </span>
        );
    }
  };

  const handleClick = (): void => {
    if (!notification.isRead && onMarkAsRead) {
      onMarkAsRead(notification.id);
    }

    const { boardId, commentId, rootCommentId } = notification.metadata;
    const targetThreadId = (rootCommentId || commentId) as string | undefined;

    if (boardId) {
      // If navigating to board
      const targetUrl = `/boards/${boardId}${targetThreadId ? `?commentId=${targetThreadId}` : ""}`;
      
      if (targetThreadId) {
        useCommentStore.getState().setActiveThreadId(targetThreadId);
        useCommentStore.getState().togglePanel(true);
      }

      onClosePanel?.();
      navigate(targetUrl);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`group flex w-full items-start gap-3 border-b border-gray-100 p-3 text-left transition-colors hover:bg-gray-50 focus:bg-gray-50 focus:outline-none ${
        !notification.isRead ? "bg-blue-50/40" : "bg-white"
      }`}
      aria-label={`Notification: ${actorName} - ${notification.type}`}
    >
      {/* Actor Avatar or Fallback Initials */}
      <div className="relative flex-shrink-0">
        {notification.actor?.avatarUrl ? (
          <img
            src={notification.actor.avatarUrl}
            alt={actorName}
            className="h-8 w-8 rounded-full object-cover ring-1 ring-gray-200"
          />
        ) : (
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700 ring-1 ring-gray-200">
            {actorInitials}
          </div>
        )}
        <div className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-xs ring-1 ring-gray-200">
          {getNotificationIcon()}
        </div>
      </div>

      {/* Content */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="text-xs text-gray-700 leading-snug break-words line-clamp-2">
          {getNotificationMessage()}
        </p>
        <span className="text-[10px] text-gray-400">
          {formatRelativeTime(notification.createdAt)}
        </span>
      </div>

      {/* Unread Indicator Dot */}
      {!notification.isRead && (
        <div
          className="mt-1.5 h-2 w-2 flex-shrink-0 rounded-full bg-blue-600"
          title="Unread"
          aria-hidden="true"
        />
      )}
    </button>
  );
}
