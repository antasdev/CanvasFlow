import { Fragment } from "react";
import { Group, Rect, Text } from "react-konva";

import type { RemoteSelection } from "@/services/socket";

import type { Shape } from "../types";
import { getCursorColor, getCursorLabel } from "../utils/cursor.utils";

type CollaboratorSelectionProps = {
  selection: RemoteSelection;
  shapes: Shape[];
};

/**
 * Computes bounding dimensions for any supported shape type.
 */
function getShapeDimensions(shape: Shape): { width: number; height: number } {
  if ("width" in shape && typeof shape.width === "number" && "height" in shape && typeof shape.height === "number") {
    return { width: shape.width, height: shape.height };
  }

  if ("radius" in shape && typeof shape.radius === "number") {
    return { width: shape.radius * 2, height: shape.radius * 2 };
  }

  return { width: 100, height: 100 };
}

/**
 * Renders real-time collaborator selection highlights and name badges on selected canvas shapes.
 * Operates purely as a presentation overlay with listening={false}.
 */
export default function CollaboratorSelection({
  selection,
  shapes,
}: CollaboratorSelectionProps): React.JSX.Element {
  const color = getCursorColor(selection.userId);
  const label = getCursorLabel(selection.userId);

  return (
    <Group listening={false}>
      {selection.shapeIds.map((shapeId) => {
        const shape = shapes.find((s) => s.id === shapeId);

        if (!shape) {
          return null;
        }

        const { width, height } = getShapeDimensions(shape);
        const badgeWidth = label.length * 6.5 + 8;

        return (
          <Fragment key={shapeId}>
            {/* Collaborator Selection Outline */}
            <Rect
              x={shape.x - 2}
              y={shape.y - 2}
              width={width + 4}
              height={height + 4}
              rotation={shape.rotation ?? 0}
              stroke={color}
              strokeWidth={2}
              strokeScaleEnabled={false}
              dash={[6, 3]}
              cornerRadius={2}
              listening={false}
            />

            {/* Collaborator Label Badge */}
            <Group
              x={shape.x}
              y={shape.y - 18}
              rotation={shape.rotation ?? 0}
              listening={false}
            >
              <Rect
                width={badgeWidth}
                height={15}
                fill={color}
                cornerRadius={3}
                shadowColor="rgba(0, 0, 0, 0.15)"
                shadowBlur={2}
                shadowOffset={{ x: 0, y: 1 }}
              />
              <Text
                x={4}
                y={2.5}
                text={label}
                fill="#ffffff"
                fontSize={9}
                fontFamily="system-ui, -apple-system, sans-serif"
                fontStyle="bold"
              />
            </Group>
          </Fragment>
        );
      })}
    </Group>
  );
}
