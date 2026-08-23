import React, { memo } from "react";
import { Group, Path, Rect, Text } from "react-konva";
import { usePresenceStore } from "../store";
import { useAuthStore } from "@/store";
import { getCursorColor, getCursorLabel } from "../utils/cursor.utils";
import type { PresenceActivity, PresenceCursor, PresenceUser } from "@/services/socket";

const CURSOR_PATH_DATA = "M0 0 L0 16 L4.5 12 L8 19 L10.5 18 L7 11 L13 11 Z";

const SHORT_ACTIVITY_LABELS: Partial<Record<PresenceActivity, string>> = {
  selecting: "selecting",
  moving: "moving",
  resizing: "resizing",
  "editing-text": "typing",
  commenting: "commenting",
};

type RemoteCursorItemProps = {
  cursor: PresenceCursor;
  user?: PresenceUser;
};

const RemoteCursorItem = memo(function RemoteCursorItem({
  cursor,
  user,
}: RemoteCursorItemProps): React.JSX.Element {
  const color = getCursorColor(cursor.userId);
  const name = user?.fullName || getCursorLabel(cursor.userId);
  const activityTag =
    user?.activity && SHORT_ACTIVITY_LABELS[user.activity]
      ? ` • ${SHORT_ACTIVITY_LABELS[user.activity]}`
      : "";
  const displayLabel = `${name}${activityTag}`;

  const badgeWidth = Math.max(displayLabel.length * 6.5 + 14, 50);

  return (
    <Group x={cursor.x} y={cursor.y} listening={false}>
      {/* Collaborator Cursor Pointer Icon */}
      <Path
        data={CURSOR_PATH_DATA}
        fill={color}
        stroke="#ffffff"
        strokeWidth={1}
        shadowColor="rgba(0, 0, 0, 0.25)"
        shadowBlur={4}
        shadowOffset={{ x: 1, y: 1 }}
      />

      {/* Collaborator Identity & Activity Badge */}
      <Group x={12} y={14}>
        <Rect
          width={badgeWidth}
          height={18}
          fill={color}
          cornerRadius={4}
          shadowColor="rgba(0, 0, 0, 0.2)"
          shadowBlur={3}
          shadowOffset={{ x: 0, y: 1 }}
        />
        <Text
          x={6}
          y={3.5}
          text={displayLabel}
          fill="#ffffff"
          fontSize={10}
          fontFamily="system-ui, -apple-system, sans-serif"
          fontStyle="bold"
        />
      </Group>
    </Group>
  );
});

export const RemoteCursorLayer = memo(function RemoteCursorLayer(): React.JSX.Element {
  const cursorsMap = usePresenceStore((state) => state.cursors);
  const usersMap = usePresenceStore((state) => state.users);
  const currentAuthUser = useAuthStore((state) => state.user);

  const cursors = Object.values(cursorsMap);

  return (
    <Group listening={false}>
      {cursors.map((cursor: PresenceCursor) => {
        // Exclude local user's own cursor
        if (cursor.userId === currentAuthUser?.id) {
          return null;
        }

        return (
          <RemoteCursorItem
            key={cursor.userId}
            cursor={cursor}
            user={usersMap[cursor.userId]}
          />
        );
      })}
    </Group>
  );
});

export default RemoteCursorLayer;
