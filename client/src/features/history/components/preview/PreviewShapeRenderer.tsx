import React from "react";
import { Arrow, Circle, Ellipse, Group, Line, Rect, Text } from "react-konva";

import type { ConnectorShape, GroupShape, Shape } from "@/features/canvas/types";
import { getShapeWorldAnchorPoint } from "@/features/canvas/utils/anchor.utils";
import {
  calculateCircleGeometry,
  calculateEllipseGeometry,
  calculatePolygonPoints,
  calculateStarPoints,
  calculateTrianglePoints,
} from "@/features/canvas/utils/shape-geometry.utils";
import { getKonvaStyleProps } from "@/features/canvas/utils/shape-style.utils";

export interface PreviewShapeRendererProps {
  shape: Shape;
  allShapes: Shape[];
}

export function PreviewShapeRenderer({
  shape,
  allShapes,
}: PreviewShapeRendererProps): React.JSX.Element | null {
  const styleProps = getKonvaStyleProps(shape, false);

  switch (shape.type) {
    case "rectangle":
      return (
        <Rect
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          rotation={shape.rotation ?? 0}
          opacity={styleProps.opacity}
          fill={styleProps.fill}
          stroke={styleProps.stroke}
          strokeWidth={styleProps.strokeWidth}
          dash={styleProps.dash}
          shadowEnabled={styleProps.shadowEnabled}
          shadowColor={styleProps.shadowColor}
          shadowBlur={styleProps.shadowBlur}
          shadowOffsetX={styleProps.shadowOffset.x}
          shadowOffsetY={styleProps.shadowOffset.y}
          shadowOpacity={styleProps.shadowOpacity}
          listening={false}
        />
      );

    case "circle": {
      const geo = calculateCircleGeometry(shape.width, shape.height);
      return (
        <Circle
          x={shape.x + geo.centerX}
          y={shape.y + geo.centerY}
          radius={geo.radius}
          rotation={shape.rotation ?? 0}
          opacity={styleProps.opacity}
          fill={styleProps.fill}
          stroke={styleProps.stroke}
          strokeWidth={styleProps.strokeWidth}
          dash={styleProps.dash}
          shadowEnabled={styleProps.shadowEnabled}
          shadowColor={styleProps.shadowColor}
          shadowBlur={styleProps.shadowBlur}
          shadowOffsetX={styleProps.shadowOffset.x}
          shadowOffsetY={styleProps.shadowOffset.y}
          shadowOpacity={styleProps.shadowOpacity}
          listening={false}
        />
      );
    }

    case "ellipse": {
      const geo = calculateEllipseGeometry(shape.width, shape.height);
      return (
        <Ellipse
          x={shape.x + geo.centerX}
          y={shape.y + geo.centerY}
          radiusX={geo.radiusX}
          radiusY={geo.radiusY}
          rotation={shape.rotation ?? 0}
          opacity={styleProps.opacity}
          fill={styleProps.fill}
          stroke={styleProps.stroke}
          strokeWidth={styleProps.strokeWidth}
          dash={styleProps.dash}
          shadowEnabled={styleProps.shadowEnabled}
          shadowColor={styleProps.shadowColor}
          shadowBlur={styleProps.shadowBlur}
          shadowOffsetX={styleProps.shadowOffset.x}
          shadowOffsetY={styleProps.shadowOffset.y}
          shadowOpacity={styleProps.shadowOpacity}
          listening={false}
        />
      );
    }

    case "triangle":
      return (
        <Line
          x={shape.x}
          y={shape.y}
          points={calculateTrianglePoints(shape.width, shape.height)}
          rotation={shape.rotation ?? 0}
          closed
          opacity={styleProps.opacity}
          fill={styleProps.fill}
          stroke={styleProps.stroke}
          strokeWidth={styleProps.strokeWidth}
          dash={styleProps.dash}
          shadowEnabled={styleProps.shadowEnabled}
          shadowColor={styleProps.shadowColor}
          shadowBlur={styleProps.shadowBlur}
          shadowOffsetX={styleProps.shadowOffset.x}
          shadowOffsetY={styleProps.shadowOffset.y}
          shadowOpacity={styleProps.shadowOpacity}
          listening={false}
        />
      );

    case "polygon":
      return (
        <Line
          x={shape.x}
          y={shape.y}
          points={calculatePolygonPoints(
            shape.width,
            shape.height,
            shape.shapeConfig?.sides ?? shape.sides ?? 5
          )}
          rotation={shape.rotation ?? 0}
          closed
          opacity={styleProps.opacity}
          fill={styleProps.fill}
          stroke={styleProps.stroke}
          strokeWidth={styleProps.strokeWidth}
          dash={styleProps.dash}
          shadowEnabled={styleProps.shadowEnabled}
          shadowColor={styleProps.shadowColor}
          shadowBlur={styleProps.shadowBlur}
          shadowOffsetX={styleProps.shadowOffset.x}
          shadowOffsetY={styleProps.shadowOffset.y}
          shadowOpacity={styleProps.shadowOpacity}
          listening={false}
        />
      );

    case "star":
      return (
        <Line
          x={shape.x}
          y={shape.y}
          points={calculateStarPoints(
            shape.width,
            shape.height,
            shape.shapeConfig?.points ?? 5,
            shape.shapeConfig?.innerRadiusRatio ?? 0.5
          )}
          rotation={shape.rotation ?? 0}
          closed
          opacity={styleProps.opacity}
          fill={styleProps.fill}
          stroke={styleProps.stroke}
          strokeWidth={styleProps.strokeWidth}
          dash={styleProps.dash}
          shadowEnabled={styleProps.shadowEnabled}
          shadowColor={styleProps.shadowColor}
          shadowBlur={styleProps.shadowBlur}
          shadowOffsetX={styleProps.shadowOffset.x}
          shadowOffsetY={styleProps.shadowOffset.y}
          shadowOpacity={styleProps.shadowOpacity}
          listening={false}
        />
      );

    case "line":
      return (
        <Line
          x={shape.x}
          y={shape.y}
          points={shape.points ?? [0, 0, shape.width, shape.height]}
          rotation={shape.rotation ?? 0}
          lineCap="round"
          lineJoin="round"
          opacity={styleProps.opacity}
          stroke={styleProps.stroke}
          strokeWidth={styleProps.strokeWidth}
          dash={styleProps.dash}
          shadowEnabled={styleProps.shadowEnabled}
          shadowColor={styleProps.shadowColor}
          shadowBlur={styleProps.shadowBlur}
          shadowOffsetX={styleProps.shadowOffset.x}
          shadowOffsetY={styleProps.shadowOffset.y}
          shadowOpacity={styleProps.shadowOpacity}
          listening={false}
        />
      );

    case "arrow":
      return (
        <Arrow
          x={shape.x}
          y={shape.y}
          points={shape.points ?? [0, 0, shape.width, shape.height]}
          rotation={shape.rotation ?? 0}
          stroke={styleProps.stroke}
          fill={styleProps.stroke}
          strokeWidth={styleProps.strokeWidth}
          pointerLength={shape.pointerLength ?? 10}
          pointerWidth={shape.pointerWidth ?? 10}
          pointerAtEnding={shape.arrowHeadEnd !== false}
          pointerAtBeginning={Boolean(shape.arrowHeadStart)}
          lineCap="round"
          lineJoin="round"
          opacity={styleProps.opacity}
          dash={styleProps.dash}
          shadowEnabled={styleProps.shadowEnabled}
          shadowColor={styleProps.shadowColor}
          shadowBlur={styleProps.shadowBlur}
          shadowOffsetX={styleProps.shadowOffset.x}
          shadowOffsetY={styleProps.shadowOffset.y}
          shadowOpacity={styleProps.shadowOpacity}
          listening={false}
        />
      );

    case "connector": {
      const connectorShape = shape as ConnectorShape;
      const connector = connectorShape.connector;

      const sourceShape = connector?.sourceShapeId
        ? allShapes.find((s) => s.id === connector.sourceShapeId)
        : undefined;
      const targetShape = connector?.targetShapeId
        ? allShapes.find((s) => s.id === connector.targetShapeId)
        : undefined;

      const fallbackStartX = shape.x + (shape.points?.[0] ?? 0);
      const fallbackStartY = shape.y + (shape.points?.[1] ?? 0);
      const fallbackEndX = shape.x + (shape.points?.[2] ?? shape.width);
      const fallbackEndY = shape.y + (shape.points?.[3] ?? shape.height);

      const startWorld =
        sourceShape && connector?.sourceAnchor
          ? getShapeWorldAnchorPoint(sourceShape, allShapes, connector.sourceAnchor)
          : { x: fallbackStartX, y: fallbackStartY };

      const endWorld =
        targetShape && connector?.targetAnchor
          ? getShapeWorldAnchorPoint(targetShape, allShapes, connector.targetAnchor)
          : { x: fallbackEndX, y: fallbackEndY };

      const isAttached = Boolean(connector?.sourceShapeId || connector?.targetShapeId);
      const points = isAttached
        ? [startWorld.x, startWorld.y, endWorld.x, endWorld.y]
        : (shape.points ?? [0, 0, shape.width, shape.height]);

      return (
        <Arrow
          x={isAttached ? 0 : shape.x}
          y={isAttached ? 0 : shape.y}
          points={points}
          rotation={isAttached ? 0 : (shape.rotation ?? 0)}
          stroke={styleProps.stroke}
          fill={styleProps.stroke}
          strokeWidth={styleProps.strokeWidth}
          pointerLength={shape.pointerLength ?? 10}
          pointerWidth={shape.pointerWidth ?? 10}
          pointerAtEnding={shape.arrowHeadEnd !== false}
          pointerAtBeginning={Boolean(shape.arrowHeadStart)}
          lineCap="round"
          lineJoin="round"
          dash={styleProps.dash}
          opacity={styleProps.opacity}
          shadowEnabled={styleProps.shadowEnabled}
          shadowColor={styleProps.shadowColor}
          shadowBlur={styleProps.shadowBlur}
          shadowOffsetX={styleProps.shadowOffset.x}
          shadowOffsetY={styleProps.shadowOffset.y}
          shadowOpacity={styleProps.shadowOpacity}
          listening={false}
        />
      );
    }

    case "freehand":
      return (
        <Line
          x={shape.x}
          y={shape.y}
          points={shape.points ?? []}
          rotation={shape.rotation ?? 0}
          tension={0.5}
          lineCap="round"
          lineJoin="round"
          opacity={styleProps.opacity}
          stroke={styleProps.stroke}
          strokeWidth={styleProps.strokeWidth}
          dash={styleProps.dash}
          shadowEnabled={styleProps.shadowEnabled}
          shadowColor={styleProps.shadowColor}
          shadowBlur={styleProps.shadowBlur}
          shadowOffsetX={styleProps.shadowOffset.x}
          shadowOffsetY={styleProps.shadowOffset.y}
          shadowOpacity={styleProps.shadowOpacity}
          listening={false}
        />
      );

    case "text": {
      const fontStyle = `${shape.fontWeight === "bold" ? "bold " : ""}${
        shape.fontStyle === "italic" ? "italic" : ""
      }`.trim() || "normal";

      return (
        <Text
          x={shape.x}
          y={shape.y}
          width={shape.width}
          height={shape.height}
          rotation={shape.rotation ?? 0}
          text={shape.text ?? ""}
          fontSize={shape.fontSize ?? 16}
          fontFamily={shape.fontFamily ?? "Inter, sans-serif"}
          fontStyle={fontStyle}
          textDecoration={shape.textDecoration ?? ""}
          align={shape.textAlign ?? "left"}
          verticalAlign={shape.verticalAlign ?? "top"}
          padding={shape.padding ?? 8}
          lineHeight={shape.lineHeight ?? 1.2}
          fill={styleProps.fill ?? "#1f2937"}
          opacity={styleProps.opacity}
          shadowEnabled={styleProps.shadowEnabled}
          shadowColor={styleProps.shadowColor}
          shadowBlur={styleProps.shadowBlur}
          shadowOffsetX={styleProps.shadowOffset.x}
          shadowOffsetY={styleProps.shadowOffset.y}
          shadowOpacity={styleProps.shadowOpacity}
          wrap="word"
          listening={false}
        />
      );
    }

    case "sticky_note":
      return (
        <Group
          x={shape.x}
          y={shape.y}
          rotation={shape.rotation ?? 0}
          opacity={styleProps.opacity}
          listening={false}
        >
          <Rect
            width={shape.width}
            height={shape.height}
            fill={shape.backgroundColor ?? "#fef08a"}
            stroke="#eab308"
            strokeWidth={1}
            cornerRadius={4}
            shadowEnabled={true}
            shadowColor="#000000"
            shadowBlur={8}
            shadowOffsetX={0}
            shadowOffsetY={3}
            shadowOpacity={0.15}
          />
          <Text
            width={shape.width}
            height={shape.height}
            text={shape.text ?? ""}
            fill={shape.textColor ?? "#1f2937"}
            fontSize={shape.fontSize ?? 14}
            fontFamily="Inter, sans-serif"
            padding={12}
            wrap="word"
          />
        </Group>
      );

    case "group": {
      const groupShape = shape as GroupShape;
      const children = allShapes.filter((s) => s.parentId === groupShape.id);

      return (
        <Group
          x={groupShape.x}
          y={groupShape.y}
          rotation={groupShape.rotation ?? 0}
          opacity={groupShape.opacity ?? 1}
          listening={false}
        >
          {children.map((child) => (
            <PreviewShapeRenderer
              key={child.id}
              shape={child}
              allShapes={allShapes}
            />
          ))}
        </Group>
      );
    }

    default:
      return null;
  }
}
