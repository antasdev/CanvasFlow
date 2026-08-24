import type { Shape, TextShape, StickyNoteShape } from "../types";

import RectangleNode from "./RectangleNode";
import TextNode from "./TextNode";
import StickyNoteNode from "./StickyNoteNode";

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