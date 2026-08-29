import { useCallback, useRef, useState } from "react";
import type Konva from "konva";
import { useCanvasStore } from "../store";
import type {
  MarqueeState,
  LassoState,
  SelectionPoint,
  SelectionMode,
} from "../types";
import { SelectionController } from "../services/selection.controller";
import type { PresenceActivity } from "@/services/socket";

export type UseCanvasSelectionOptions = {
  boardId?: string;
  canEditCanvas?: boolean;
  emitActivity?: (activity: PresenceActivity) => void;
};

export function useCanvasSelection({
  emitActivity,
}: UseCanvasSelectionOptions = {}) {
  const activeTool = useCanvasStore((state) => state.activeTool);
  const shapes = useCanvasStore((state) => state.shapes);
  const selectedShapeIds = useCanvasStore((state) => state.selectedShapeIds);
  const editingGroupId = useCanvasStore((state) => state.editingGroupId);
  const setSelectedShapeIds = useCanvasStore((state) => state.setSelectedShapeIds);
  const clearSelection = useCanvasStore((state) => state.clearSelection);
  const exitGroup = useCanvasStore((state) => state.exitGroup);

  const [marquee, setMarquee] = useState<MarqueeState | null>(null);
  const [lasso, setLasso] = useState<LassoState | null>(null);
  const [isSelecting, setIsSelecting] = useState<boolean>(false);

  // Keep latest values accessible in controller closures
  const stateRef = useRef({
    activeTool,
    shapes,
    selectedShapeIds,
    editingGroupId,
    setSelectedShapeIds,
    clearSelection,
    exitGroup,
    emitActivity,
  });

  stateRef.current = {
    activeTool,
    shapes,
    selectedShapeIds,
    editingGroupId,
    setSelectedShapeIds,
    clearSelection,
    exitGroup,
    emitActivity,
  };

  const controllerRef = useRef<SelectionController | null>(null);
  if (!controllerRef.current) {
    controllerRef.current = new SelectionController({
      getActiveTool: () => stateRef.current.activeTool,
      getShapes: () => stateRef.current.shapes,
      getSelectedShapeIds: () => stateRef.current.selectedShapeIds,
      getEditingGroupId: () => stateRef.current.editingGroupId,
      setSelectedShapeIds: (ids) => stateRef.current.setSelectedShapeIds(ids),
      clearSelection: () => stateRef.current.clearSelection(),
      exitGroup: () => stateRef.current.exitGroup(),
      onActivity: (activity) => stateRef.current.emitActivity?.(activity),
    });
  }

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
    const ctrl = controllerRef.current;
    if (ctrl) {
      setMarquee(ctrl.getMarquee());
      setLasso(ctrl.getLasso());
      setIsSelecting(ctrl.isSelecting());
    }
  }, []);

  const startSelection = useCallback(
    (
      worldPoint: SelectionPoint,
      event: Konva.KonvaEventObject<MouseEvent | TouchEvent>
    ): boolean => {
      const mode = getSelectionMode(event);
      const started = controllerRef.current?.startSelection(worldPoint, mode) ?? false;
      syncStateFromController();
      return started;
    },
    [getSelectionMode, syncStateFromController]
  );

  const updateSelection = useCallback(
    (worldPoint: SelectionPoint): void => {
      controllerRef.current?.updateSelection(worldPoint);
      syncStateFromController();
    },
    [syncStateFromController]
  );

  const endSelection = useCallback((): void => {
    controllerRef.current?.endSelection();
    syncStateFromController();
  }, [syncStateFromController]);

  const handleShapeClick = useCallback(
    (
      shapeId: string,
      event: Konva.KonvaEventObject<MouseEvent | TouchEvent>
    ): void => {
      const mode = getSelectionMode(event);
      controllerRef.current?.handleShapeClick(shapeId, mode);
    },
    [getSelectionMode]
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
