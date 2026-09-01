import type Konva from "konva";
import { useCallback, useMemo, useState } from "react";

import type { PresenceActivity } from "@/services/socket";

import { SelectionController } from "../services/selection.controller";
import { useCanvasStore } from "../store";
import type {
  MarqueeState,
  LassoState,
  SelectionPoint,
  SelectionMode,
} from "../types";


export interface UseCanvasSelectionReturn {
  marquee: MarqueeState | null;
  lasso: LassoState | null;
  isSelecting: boolean;
  startSelection: (
    worldPoint: SelectionPoint,
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>
  ) => boolean;
  updateSelection: (worldPoint: SelectionPoint) => void;
  endSelection: () => void;
  handleShapeClick: (
    shapeId: string,
    event: Konva.KonvaEventObject<MouseEvent | TouchEvent>
  ) => void;
}

export type UseCanvasSelectionOptions = {
  boardId?: string;
  canEditCanvas?: boolean;
  emitActivity?: (activity: PresenceActivity) => void;
};

export function useCanvasSelection(
  optionsOrEmitActivity?: UseCanvasSelectionOptions | ((activity: PresenceActivity) => void)
): UseCanvasSelectionReturn {
  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const [lasso, setLasso] = useState<LassoState | null>(null);
  const [isSelecting, setIsSelecting] = useState<boolean>(false);

  const emitActivity =
    typeof optionsOrEmitActivity === "function"
      ? optionsOrEmitActivity
      : optionsOrEmitActivity?.emitActivity;

  const controller = useMemo(
    () =>
      new SelectionController({
        getActiveTool: () => useCanvasStore.getState().activeTool,
        getShapes: () => useCanvasStore.getState().shapes,
        getSelectedShapeIds: () => useCanvasStore.getState().selectedShapeIds,
        getEditingGroupId: () => useCanvasStore.getState().editingGroupId,
        setSelectedShapeIds: (ids) => useCanvasStore.getState().setSelectedShapeIds(ids),
        clearSelection: () => useCanvasStore.getState().clearSelection(),
        exitGroup: () => useCanvasStore.getState().exitGroup(),
        onActivity: (activity) => {
          emitActivity?.(activity);
        },
      }),
    [emitActivity]
  );

  const getSelectionMode = useCallback(
    (event: Konva.KonvaEventObject<MouseEvent | TouchEvent>): SelectionMode => {
      const evt = event.evt;
      if ("ctrlKey" in evt && (evt.ctrlKey || evt.metaKey)) {
        return "toggle";
      }
      if ("shiftKey" in evt && evt.shiftKey) {
        return "add";
      }
      return "replace";
    },
    []
  );

  const syncStateFromController = useCallback(() => {
    setMarquee(controller.getMarquee());
    setLasso(controller.getLasso());
    setIsSelecting(controller.isSelecting());
  }, [controller]);

  const startSelection = useCallback(
    (
      worldPoint: SelectionPoint,
      event: Konva.KonvaEventObject<MouseEvent | TouchEvent>
    ): boolean => {
      const mode = getSelectionMode(event);
      const started = controller.startSelection(worldPoint, mode);
      syncStateFromController();
      return started;
    },
    [controller, getSelectionMode, syncStateFromController]
  );

  const updateSelection = useCallback(
    (worldPoint: SelectionPoint): void => {
      controller.updateSelection(worldPoint);
      syncStateFromController();
    },
    [controller, syncStateFromController]
  );

  const endSelection = useCallback((): void => {
    controller.endSelection();
    syncStateFromController();
  }, [controller, syncStateFromController]);

  const handleShapeClick = useCallback(
    (
      shapeId: string,
      event: Konva.KonvaEventObject<MouseEvent | TouchEvent>
    ): void => {
      const mode = getSelectionMode(event);
      controller.handleShapeClick(shapeId, mode);
    },
    [controller, getSelectionMode]
  );

  return {
    marquee,
    lasso,
    isSelecting,
    startSelection,
    updateSelection,
    endSelection,
    handleShapeClick,
  };
}
