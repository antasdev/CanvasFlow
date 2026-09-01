import React, { memo } from "react";
import { Group, Line } from "react-konva";

import { useCanvasStore } from "../store";

/**
 * Ephemeral Smart Guide overlay for Konva Stage.
 * Renders edge, center, and equal-spacing snapping guidelines above shapes.
 * Operates with listening={false} to ensure zero pointer event interference.
 */
export const SmartGuideOverlay = memo(function SmartGuideOverlay(): React.JSX.Element | null {
  const smartGuides = useCanvasStore((state) => state.smartGuides);
  const zoom = useCanvasStore((state) => state.zoom);

  if (!smartGuides || smartGuides.length === 0) {
    return null;
  }

  const effectiveZoom = Math.max(0.1, zoom);
  const strokeWidth = 1 / effectiveZoom;
  const dashPattern = [4 / effectiveZoom, 4 / effectiveZoom];
  const alignGuideColor = "#f43f5e"; // Rose-500
  const spacingGuideColor = "#06b6d4"; // Cyan-500

  return (
    <Group listening={false}>
      {smartGuides.map((guide) => {
        const color = guide.kind === "spacing" ? spacingGuideColor : alignGuideColor;

        if (guide.orientation === "vertical") {
          return (
            <Line
              key={guide.id}
              points={[guide.position, guide.start, guide.position, guide.end]}
              stroke={color}
              strokeWidth={strokeWidth}
              dash={dashPattern}
              listening={false}
            />
          );
        }

        return (
          <Line
            key={guide.id}
            points={[guide.start, guide.position, guide.end, guide.position]}
            stroke={color}
            strokeWidth={strokeWidth}
            dash={dashPattern}
            listening={false}
          />
        );
      })}
    </Group>
  );
});
