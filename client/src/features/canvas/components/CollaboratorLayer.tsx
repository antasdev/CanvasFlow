import React, { memo } from "react";
import { Layer } from "react-konva";

import { useCanvasStore, usePresenceStore } from "../store";
import type { Shape } from "../types";

import CollaboratorCursor from "./CollaboratorCursor";
import CollaboratorSelection from "./CollaboratorSelection";
import CollaboratorShapeLock from "./CollaboratorShapeLock";
import { RemoteCursorLayer } from "./RemoteCursorLayer";

type CollaboratorLayerProps = {
  shapes?: Shape[];
};

/**
 * Dedicated Collaborator Overlay Layer (Layer 4 of Konva Stage).
 * Strictly isolates real-time 60Hz peer cursors, remote selections, and shape locks
 * from triggering re-renders of the root CanvasEditor component.
 */
export const CollaboratorLayer = memo(function CollaboratorLayer({
  shapes: propShapes,
}: CollaboratorLayerProps): React.JSX.Element {
  const storeShapes = useCanvasStore((state) => state.shapes);
  const shapes = propShapes ?? storeShapes;

  const remoteCursors = useCanvasStore((state) => state.remoteCursors);
  const remoteSelections = useCanvasStore((state) => state.remoteSelections);
  const remoteShapeLocks = useCanvasStore((state) => state.remoteShapeLocks);
  const presenceCursors = usePresenceStore((state) => state.cursors);

  return (
    <Layer listening={false}>
      {Object.values(remoteSelections).map((selection) => (
        <CollaboratorSelection
          key={selection.userId}
          selection={selection}
          shapes={shapes}
        />
      ))}

      {Object.values(remoteShapeLocks).map((lock) => (
        <CollaboratorShapeLock
          key={lock.shapeId}
          lock={lock}
          shapes={shapes}
        />
      ))}

      {Object.values(remoteCursors)
        .filter((cursor) => !presenceCursors[cursor.userId])
        .map((cursor) => (
          <CollaboratorCursor
            key={cursor.userId}
            cursor={cursor}
          />
        ))}

      <RemoteCursorLayer />
    </Layer>
  );
});

export default CollaboratorLayer;
