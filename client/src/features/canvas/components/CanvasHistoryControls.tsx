import Button from "@/components/ui/Button";

import { useCanvasStore } from "../store";

export default function CanvasHistoryControls(): React.JSX.Element {
    const undo = useCanvasStore((state) => state.undo);
    const redo = useCanvasStore((state) => state.redo);

    const canUndo = useCanvasStore(
        (state) => state.canUndo(),
    );

    const canRedo = useCanvasStore(
        (state) => state.canRedo(),
    );

    return (
        <>
            <Button
                type="button"
                disabled={!canUndo}
                onClick={undo}
            >
                Undo
            </Button>

            <Button
                type="button"
                disabled={!canRedo}
                onClick={redo}
            >
                Redo
            </Button>
        </>
    );
}