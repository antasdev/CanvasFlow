import React, { useState } from "react";

import type { PresenceActivity, PresenceUser } from "@/services/socket";
import { useAuthStore } from "@/store";

import { usePresenceStore } from "../store";
import { getCursorColor } from "../utils/cursor.utils";

const ACTIVITY_LABELS: Record<PresenceActivity, string> = {
  idle: "Idle",
  cursor: "Viewing",
  selecting: "Selecting",
  moving: "Moving shape",
  resizing: "Resizing shape",
  "editing-text": "Editing text",
  commenting: "Commenting",
  drawing: "Drawing",
};

const MAX_VISIBLE_AVATARS = 4;

export default function PresenceAvatars(): React.JSX.Element | null {
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const usersMap = usePresenceStore((state) => state.users);
  const currentAuthUser = useAuthStore((state) => state.user);

  const users = Object.values(usersMap);
  if (users.length === 0) {
    return null;
  }

  const visibleUsers = users.slice(0, MAX_VISIBLE_AVATARS);
  const overflowUsers = users.slice(MAX_VISIBLE_AVATARS);

  const getInitials = (name: string): string => {
    if (!name) return "?";
    const parts = name.trim().split(" ");
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <div className="relative inline-flex items-center">
      {/* Avatar Stack Container */}
      <div
        className="flex items-center -space-x-2 overflow-hidden py-1 px-1 cursor-pointer select-none"
        onClick={() => setIsDropdownOpen((prev) => !prev)}
        title="Active Collaborators"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            setIsDropdownOpen((prev) => !prev);
          }
        }}
      >
        {visibleUsers.map((user: PresenceUser) => {
          const isCurrentUser = user.userId === currentAuthUser?.id;
          const color = getCursorColor(user.userId);
          const initials = getInitials(user.fullName);

          return (
            <div
              key={user.userId}
              className={`relative group rounded-full ${
                isCurrentUser ? "ring-2 ring-blue-500 shadow-sm" : "ring-2 ring-slate-800"
              }`}
              style={{ backgroundColor: color }}
            >
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.fullName}
                  className="h-7 w-7 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-bold text-white shadow-sm">
                  {initials}
                </div>
              )}

              {/* Online Status Dot */}
              <span className="absolute bottom-0 right-0 block h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-slate-900" />
            </div>
          );
        })}

        {/* Overflow Count Badge */}
        {overflowUsers.length > 0 && (
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-700 text-[10px] font-bold text-slate-200 ring-2 ring-slate-800">
            +{overflowUsers.length}
          </div>
        )}
      </div>

      {/* Collaborator Details Dropdown Popover */}
      {isDropdownOpen && (
        <>
          <div
            className="fixed inset-0 z-40"
            onClick={() => setIsDropdownOpen(false)}
          />
          <div className="absolute right-0 top-10 z-50 w-64 rounded-xl border border-slate-700 bg-slate-900/95 p-3 shadow-2xl backdrop-blur-md animate-in fade-in zoom-in-95 duration-100">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Collaborators ({users.length})
              </span>
            </div>

            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {users.map((user: PresenceUser) => {
                const isCurrentUser = user.userId === currentAuthUser?.id;
                const color = getCursorColor(user.userId);
                const initials = getInitials(user.fullName);
                const activityText =
                  ACTIVITY_LABELS[user.activity] ?? "Active";

                return (
                  <div
                    key={user.userId}
                    className="flex items-center gap-2.5 rounded-lg p-1.5 transition-colors hover:bg-slate-800/60"
                  >
                    <div
                      className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {user.avatar ? (
                        <img
                          src={user.avatar}
                          alt={user.fullName}
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        initials
                      )}
                      <span className="absolute bottom-0 right-0 h-2 w-2 rounded-full bg-emerald-400 ring-1 ring-slate-900" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-semibold text-slate-200">
                          {user.fullName}
                        </span>
                        {isCurrentUser && (
                          <span className="rounded bg-blue-500/20 px-1 py-0.2 text-[9px] font-medium text-blue-400">
                            You
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                        <span className="truncate text-blue-400/90 font-medium">
                          {activityText}
                        </span>
                        {user.sessionCount > 1 && (
                          <span className="text-[10px] text-slate-500">
                            • {user.sessionCount} tabs
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
