import { useEffect } from "react";

import { useCanvasStore } from "../store";

export function useCanvasHistory(): void {
    const undo = useCanvasStore((state) => state.undo);
    const redo = useCanvasStore((state) => state.redo);

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent): void => {
            const target = event.target;

            if (
                target instanceof HTMLInputElement ||
                target instanceof HTMLTextAreaElement ||
                target instanceof HTMLSelectElement ||
                (target instanceof HTMLElement &&
                    target.isContentEditable)
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