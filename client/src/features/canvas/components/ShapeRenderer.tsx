import type { Shape, TextShape, StickyNoteShape } from "../types";

import ArrowNode from "./ArrowNode";
import CircleNode from "./CircleNode";
import ConnectorNode from "./ConnectorNode";
import EllipseNode from "./EllipseNode";
import FreehandNode from "./FreehandNode";
import GroupNode from "./GroupNode";
import LineNode from "./LineNode";
import PolygonNode from "./PolygonNode";
import RectangleNode from "./RectangleNode";
import StarNode from "./StarNode";
import StickyNoteNode from "./StickyNoteNode";
import TextNode from "./TextNode";
import TriangleNode from "./TriangleNode";

type ShapeRendererProps = {
  shape: Shape;
  boardId?: string;
  canEditCanvas?: boolean;
  onStartEditing?: (shape: TextShape | StickyNoteShape) => void;
};

export default function ShapeRenderer({
  shape,
  boardId,
  canEditCanvas = true,
  onStartEditing,
}: ShapeRendererProps): React.JSX.Element | null {
  switch (shape.type) {
    case "freehand":
      return (
        <FreehandNode
          shape={shape}
          boardId={boardId}
          canEditCanvas={canEditCanvas}
        />
      );

    case "line":
      return (
        <LineNode
          shape={shape}
          boardId={boardId}
          canEditCanvas={canEditCanvas}
        />
      );

    case "arrow":
      return (
        <ArrowNode
          shape={shape}
          boardId={boardId}
          canEditCanvas={canEditCanvas}
        />
      );

    case "connector":
      return (
        <ConnectorNode
          shape={shape}
          boardId={boardId}
          canEditCanvas={canEditCanvas}
        />
      );

    case "rectangle":
      return (
        <RectangleNode
          shape={shape}
          boardId={boardId}
          canEditCanvas={canEditCanvas}
        />
      );

    case "circle":
      return (
        <CircleNode
          shape={shape}
          boardId={boardId}
          canEditCanvas={canEditCanvas}
        />
      );

    case "ellipse":
      return (
        <EllipseNode
          shape={shape}
          boardId={boardId}
          canEditCanvas={canEditCanvas}
        />
      );

    case "triangle":
      return (
        <TriangleNode
          shape={shape}
          boardId={boardId}
          canEditCanvas={canEditCanvas}
        />
      );

    case "polygon":
      return (
        <PolygonNode
          shape={shape}
          boardId={boardId}
          canEditCanvas={canEditCanvas}
        />
      );

    case "star":
      return (
        <StarNode
          shape={shape}
          boardId={boardId}
          canEditCanvas={canEditCanvas}
        />
      );

    case "text":
      return (
        <TextNode
          shape={shape}
          boardId={boardId}
          canEditCanvas={canEditCanvas}
          onStartEditing={onStartEditing ?? (() => {})}
        />
      );

    case "sticky_note":
      return (
        <StickyNoteNode
          shape={shape}
          boardId={boardId}
          canEditCanvas={canEditCanvas}
          onStartEditing={onStartEditing ?? (() => {})}
        />
      );

    case "group":
      return (
        <GroupNode
          shape={shape}
          boardId={boardId}
          canEditCanvas={canEditCanvas}
          onStartEditing={onStartEditing}
        />
      );

    default:
      return null;
  }
}