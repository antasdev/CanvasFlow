import React, { memo } from "react";
import { Group, Line, Path, Rect, Text } from "react-konva";
import { usePresenceStore, useInteractionStore, useCanvasStore } from "../store";
import { useAuthStore } from "@/store";
import { getCursorColor, getCursorLabel } from "../utils/cursor.utils";
import type { PresenceCursor, PresenceUser, CollaborativeInteraction } from "@/services/socket";

const CURSOR_PATH_DATA = "M0 0 L0 16 L4.5 12 L8 19 L10.5 18 L7 11 L13 11 Z";

const INTERACTION_LABELS: Record<string, string> = {
  selecting: "selecting",
  moving: "moving",
  resizing: "resizing",
  rotating: "rotating",
  "editing-text": "editing text",
  commenting: "commenting",
  drawing: "drawing",
};

type RemoteDrawingPreviewProps = {
  interaction: CollaborativeInteraction;
};

const RemoteDrawingPreview = memo(function RemoteDrawingPreview({
  interaction,
}: RemoteDrawingPreviewProps): React.JSX.Element | null {
  const points = interaction.data?.points;
  if (!Array.isArray(points) || points.length < 4) {
    return null;
  }

  const stroke =
    typeof interaction.data?.stroke === "string"
      ? interaction.data.stroke
      : "#1f2937";
  const strokeWidth =
    typeof interaction.data?.strokeWidth === "number"
      ? interaction.data.strokeWidth
      : 2;

  return (
    <Line
      points={points as number[]}
      stroke={stroke}
      strokeWidth={strokeWidth}
      lineCap="round"
      lineJoin="round"
      tension={0.2}
      opacity={0.85}
      listening={false}
    />
  );
});

type RemoteCursorItemProps = {
  cursor: PresenceCursor;
  user?: PresenceUser;
  activeInteraction?: CollaborativeInteraction;
};

const RemoteCursorItem = memo(function RemoteCursorItem({
  cursor,
  user,
  activeInteraction,
}: RemoteCursorItemProps): React.JSX.Element {
  const color = getCursorColor(cursor.userId);
  const name = user?.fullName || getCursorLabel(cursor.userId);

  // Active interaction activity takes precedence over static presence activity
  const interactionType = activeInteraction?.type || user?.activity;
  const activityTag =
    interactionType && INTERACTION_LABELS[interactionType]
      ? ` • ${INTERACTION_LABELS[interactionType]}`
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

type RemoteShapeHighlightProps = {
  interaction: CollaborativeInteraction;
  user?: PresenceUser;
};

const RemoteShapeHighlight = memo(function RemoteShapeHighlight({
  interaction,
  user,
}: RemoteShapeHighlightProps): React.JSX.Element | null {
  const shapes = useCanvasStore((state) => state.shapes);
  const color = getCursorColor(interaction.userId);
  const name = user?.fullName || getCursorLabel(interaction.userId);
  const actionLabel = INTERACTION_LABELS[interaction.type] || interaction.type;

  return (
    <Group listening={false}>
      {interaction.targets.map((target) => {
        if (target.type !== "shape") return null;
        const shape = shapes.find((s) => s.id === target.id);
        if (!shape) return null;

        const pad = 4;
        const labelText = `${name} (${actionLabel})`;
        const tagWidth = Math.max(labelText.length * 5.8 + 10, 60);

        return (
          <Group key={`${interaction.interactionId}-${target.id}`}>
            {/* Outline Halo around remotely manipulated shape */}
            <Rect
              x={shape.x - pad}
              y={shape.y - pad}
              width={shape.width + pad * 2}
              height={shape.height + pad * 2}
              stroke={color}
              strokeWidth={2}
              dash={[6, 3]}
              cornerRadius={2}
              opacity={0.85}
            />

            {/* Subtle User Action Tag atop shape */}
            <Group x={shape.x - pad} y={shape.y - pad - 16}>
              <Rect
                width={tagWidth}
                height={14}
                fill={color}
                cornerRadius={3}
                opacity={0.9}
              />
              <Text
                x={4}
                y={2.5}
                text={labelText}
                fill="#ffffff"
                fontSize={9}
                fontFamily="system-ui, -apple-system, sans-serif"
                fontStyle="bold"
              />
            </Group>
          </Group>
        );
      })}
    </Group>
  );
});

export const RemoteCursorLayer = memo(function RemoteCursorLayer(): React.JSX.Element {
  const cursorsMap = usePresenceStore((state) => state.cursors);
  const usersMap = usePresenceStore((state) => state.users);
  const interactionsMap = useInteractionStore((state) => state.interactions);
  const currentAuthUser = useAuthStore((state) => state.user);

  const cursors = Object.values(cursorsMap);
  const interactions = Object.values(interactionsMap);

  return (
    <Group listening={false}>
      {/* Remote Active Drawing Previews */}
      {interactions.map((interaction: CollaborativeInteraction) => {
        if (
          interaction.userId === currentAuthUser?.id ||
          interaction.type !== "drawing"
        ) {
          return null;
        }

        return (
          <RemoteDrawingPreview
            key={interaction.interactionId}
            interaction={interaction}
          />
        );
      })}

      {/* Remote Shape Manipulation Highlights */}
      {interactions.map((interaction: CollaborativeInteraction) => {
        if (
          interaction.userId === currentAuthUser?.id ||
          interaction.type === "drawing"
        ) {
          return null;
        }

        return (
          <RemoteShapeHighlight
            key={interaction.interactionId}
            interaction={interaction}
            user={usersMap[interaction.userId]}
          />
        );
      })}

      {/* Remote Collaborator Cursors & Labels */}
      {cursors.map((cursor: PresenceCursor) => {
        // Exclude local user's own cursor
        if (cursor.userId === currentAuthUser?.id) {
          return null;
        }

        const userInteraction = interactions.find(
          (i) => i.userId === cursor.userId
        );

        return (
          <RemoteCursorItem
            key={cursor.userId}
            cursor={cursor}
            user={usersMap[cursor.userId]}
            activeInteraction={userInteraction}
          />
        );
      })}
    </Group>
  );
});

export default RemoteCursorLayer;
