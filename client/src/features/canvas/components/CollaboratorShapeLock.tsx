import { Group, Rect, Text } from "react-konva";
import type { RemoteShapeLock } from "@/services/socket";
import type { Shape } from "../types";

type CollaboratorShapeLockProps = {
  lock: RemoteShapeLock;
  shapes: Shape[];
};

/**
 * Computes bounding dimensions for any supported shape type.
 */
function getShapeDimensions(shape: Shape): { width: number; height: number } {
  if (
    "width" in shape &&
    typeof shape.width === "number" &&
    "height" in shape &&
    typeof shape.height === "number"
  ) {
    return { width: shape.width, height: shape.height };
  }

  if ("radius" in shape && typeof shape.radius === "number") {
    return { width: shape.radius * 2, height: shape.radius * 2 };
  }

  return { width: 100, height: 100 };
}

/**
 * Renders real-time soft-lock indicators on shapes currently being transformed by collaborators.
 * Purely presentation overlay with listening={false} to avoid intercepting Konva events.
 */
export default function CollaboratorShapeLock({
  lock,
  shapes,
}: CollaboratorShapeLockProps): React.JSX.Element | null {
  const shape = shapes.find((s) => s.id === lock.shapeId);

  if (!shape) {
    return null;
  }

  const { width, height } = getShapeDimensions(shape);
  const labelText = `🔒 ${lock.fullName || "Collaborator"} editing`;
  const badgeWidth = labelText.length * 6.2 + 10;

  return (
    <Group listening={false}>
      {/* Soft-lock border highlight */}
      <Rect
        x={shape.x - 3}
        y={shape.y - 3}
        width={width + 6}
        height={height + 6}
        rotation={shape.rotation ?? 0}
        stroke={lock.color}
        strokeWidth={2.5}
        strokeScaleEnabled={false}
        dash={[4, 4]}
        opacity={0.9}
        cornerRadius={3}
        listening={false}
      />

      {/* Editing badge */}
      <Group
        x={shape.x}
        y={shape.y - 20}
        rotation={shape.rotation ?? 0}
        listening={false}
      >
        <Rect
          width={badgeWidth}
          height={16}
          fill={lock.color}
          cornerRadius={3}
          shadowColor="rgba(0, 0, 0, 0.2)"
          shadowBlur={3}
          shadowOffset={{ x: 0, y: 1 }}
        />
        <Text
          x={5}
          y={2.5}
          text={labelText}
          fill="#ffffff"
          fontSize={9.5}
          fontFamily="system-ui, -apple-system, sans-serif"
          fontStyle="bold"
        />
      </Group>
    </Group>
  );
}
