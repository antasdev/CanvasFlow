import { User, Loader2 } from "lucide-react";
import React from "react";

import { getCursorColor } from "@/features/canvas/utils/cursor.utils";
import type { WorkspaceMember } from "@/features/workspace/types";

export type MentionListboxProps = {
  isOpen: boolean;
  searchQuery: string;
  selectedIndex: number;
  members: WorkspaceMember[];
  isLoading: boolean;
  onSelect: (member: WorkspaceMember) => void;
  className?: string;
};

export default function MentionListbox({
  isOpen,
  searchQuery,
  selectedIndex,
  members,
  isLoading,
  onSelect,
  className = "",
}: MentionListboxProps): React.JSX.Element | null {
  if (!isOpen) return null;

  return (
    <div
      role="listbox"
      id="mention-listbox"
      aria-label="Mention workspace members"
      className={`absolute bottom-full left-0 mb-1.5 w-64 max-h-52 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl ring-1 ring-black/5 z-50 animate-in fade-in zoom-in-95 duration-100 ${className}`}
    >
      <div className="border-b border-gray-100 px-2.5 py-1.5 text-[11px] font-medium text-gray-500 bg-gray-50 flex items-center justify-between">
        <span>Mention workspace member</span>
        {searchQuery && <span className="text-gray-400 font-normal">@{searchQuery}</span>}
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 py-4 text-xs text-gray-500">
          <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
          <span>Searching members...</span>
        </div>
      ) : members.length === 0 ? (
        <div className="px-3 py-3 text-center text-xs text-gray-400">
          No members found
        </div>
      ) : (
        <div className="py-1">
          {members.map((member, idx) => {
            const isSelected = idx === selectedIndex;
            const fullName = member.user?.fullName || "Collaborator";
            const email = member.user?.email;
            const avatarColor = getCursorColor(member.userId);
            const initials = fullName
              .split(" ")
              .map((n: string) => n[0])
              .join("")
              .slice(0, 2)
              .toUpperCase();

            return (
              <button
                type="button"
                key={member.id || member.userId}
                role="option"
                id={`mention-option-${idx}`}
                aria-selected={isSelected}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onSelect(member);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-xs transition-colors ${
                  isSelected ? "bg-blue-50 text-blue-900" : "text-gray-700 hover:bg-gray-50"
                }`}
              >
                {/* Avatar with initials or icon */}
                <div
                  style={{ backgroundColor: avatarColor }}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-xs"
                >
                  {initials || <User className="h-3 w-3" />}
                </div>

                {/* Name & Role / Email */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate font-medium text-gray-900">
                      {fullName}
                    </span>
                    <span className="text-[10px] text-gray-400 font-normal shrink-0 uppercase">
                      {member.role.toLowerCase()}
                    </span>
                  </div>
                  {email && (
                    <div className="truncate text-[10px] text-gray-400">
                      {email}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
