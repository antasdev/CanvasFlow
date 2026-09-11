import { useEffect } from "react";

import { useCanvasStore } from "../store";
import { useSearchDialogStore } from "@/features/search";

export function useCanvasHistory(): void {
    const undo = useCanvasStore((state) => state.undo);
    const redo = useCanvasStore((state) => state.redo);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent): void => {
            if (useSearchDialogStore.getState().isOpen) {
                return;
            }

            const target = event.target;

            if (
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target instanceof HTMLSelectElement ||
                (target instanceof HTMLElement &&
                    (target.isContentEditable || target.closest('[role="dialog"]') !== null))
            ) {
                return;
            }

            if (!event.ctrlKey && !event.metaKey) {
                return;
            }

            if (event.key.toLowerCase() === "z") {
                event.preventDefault();

                if (event.shiftKey) {
                    redo();
                    return;
                }

                undo();
                return;
            }

            if (event.key.toLowerCase() === "y") {
                event.preventDefault();
                redo();
            }
        };

        window.addEventListener(
            "keydown",
            handleKeyDown,
        );

        return (): void => {
            window.removeEventListener(
                "keydown",
                handleKeyDown,
            );
        };
    }, [redo, undo]);
}