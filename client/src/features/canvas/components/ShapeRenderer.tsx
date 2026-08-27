import type { Shape, TextShape, StickyNoteShape } from "../types";

import RectangleNode from "./RectangleNode";
import TextNode from "./TextNode";
import StickyNoteNode from "./StickyNoteNode";
import FreehandNode from "./FreehandNode";
import LineNode from "./LineNode";
import ArrowNode from "./ArrowNode";
import ConnectorNode from "./ConnectorNode";

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

    default:
      return null;
  }
}