import { Group, Path, Rect, Text } from "react-konva";
import type { RemoteCursor } from "@/services/socket";
import { getCursorColor, getCursorLabel } from "../utils/cursor.utils";

type CollaboratorCursorProps = {
  cursor: RemoteCursor;
};

// Pointer icon SVG Path
const CURSOR_PATH_DATA = "M0 0 L0 16 L4.5 12 L8 19 L10.5 18 L7 11 L13 11 Z";

/**
 * Renders a collaborator's live cursor and identity badge on the canvas overlay.
 */
export default function CollaboratorCursor({
  cursor,
}: CollaboratorCursorProps): React.JSX.Element {
  const color = getCursorColor(cursor.userId);
  const label = getCursorLabel(cursor.userId);

  return (
    <Group
      x={cursor.x}
      y={cursor.y}
      listening={false}
    >
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

      {/* Collaborator Identity Badge */}
      <Group x={12} y={14}>
        <Rect
          width={label.length * 7 + 12}
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
          text={label}
          fill="#ffffff"
          fontSize={10}
          fontFamily="system-ui, -apple-system, sans-serif"
          fontStyle="bold"
        />
      </Group>
    </Group>
  );
}
