import type { Shape, TextShape, StickyNoteShape } from "../types";

import RectangleNode from "./RectangleNode";
import TextNode from "./TextNode";
import StickyNoteNode from "./StickyNoteNode";

type ShapeRendererProps = {
  shape: Shape;
  boardId?: string;
  onStartEditing?: (shape: TextShape | StickyNoteShape) => void;
};

export default function ShapeRenderer({
  shape,
  boardId,
  onStartEditing,
}: ShapeRendererProps): React.JSX.Element | null {
  switch (shape.type) {
    case "rectangle":
      return <RectangleNode shape={shape} boardId={boardId} />;

    case "text":
      return (
        <TextNode
          shape={shape}
          boardId={boardId}
          onStartEditing={onStartEditing ?? (() => {})}
        />
      );

    case "sticky_note":
      return (
        <StickyNoteNode
          shape={shape}
          boardId={boardId}
          onStartEditing={onStartEditing ?? (() => {})}
        />
      );

    default:
      return null;
  }
}