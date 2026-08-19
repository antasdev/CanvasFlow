import { beforeEach, describe, expect, it } from "vitest";

import { useCanvasStore } from "./canvas.store";

describe("canvas store history", () => {
    beforeEach(() => {
        useCanvasStore.getState().resetCanvas();
    });

    it("undoes and redoes rectangle creation", () => {
        const rectangle = {
            id: "rectangle-1",
            type: "rectangle" as const,
            x: 100,
            y: 100,
            width: 200,
            height: 100,
            rotation: 0,
            opacity: 1,
            zIndex: 0,
            fill: "#ffffff",
            stroke: "#1f2937",
            strokeWidth: 2,
        };

        useCanvasStore
            .getState()
            .addShape(rectangle);

        expect(
            useCanvasStore.getState().shapes,
        ).toHaveLength(1);

        useCanvasStore.getState().undo();

        expect(
            useCanvasStore.getState().shapes,
        ).toHaveLength(0);

        useCanvasStore.getState().redo();

        expect(
            useCanvasStore.getState().shapes,
        ).toHaveLength(1);

        expect(
            useCanvasStore.getState().shapes[0].id,
        ).toBe("rectangle-1");
    });

    it("clears redo history after a new operation", () => {
        const rectangle = {
            id: "rectangle-1",
            type: "rectangle" as const,
            x: 100,
            y: 100,
            width: 200,
            height: 100,
            rotation: 0,
            opacity: 1,
            zIndex: 0,
            fill: "#ffffff",
            stroke: "#1f2937",
            strokeWidth: 2,
        };

        useCanvasStore
            .getState()
            .addShape(rectangle);

        useCanvasStore.getState().undo();

        expect(
            useCanvasStore.getState().canRedo(),
        ).toBe(true);

        useCanvasStore
            .getState()
            .addShape({
                ...rectangle,
                id: "rectangle-2",
            });

        expect(
            useCanvasStore.getState().canRedo(),
        ).toBe(false);
    });

    it("hydrates shapes via setShapes without creating undo history", () => {
        const shapes = [
            {
                id: "shape-server-1",
                type: "rectangle" as const,
                x: 200,
                y: 300,
                width: 150,
                height: 80,
                rotation: 0,
                opacity: 1,
                zIndex: 1,
                fill: "#ffffff",
                stroke: "#1f2937",
                strokeWidth: 2,
            },
        ];

        useCanvasStore.getState().setShapes(shapes);

        expect(useCanvasStore.getState().shapes).toHaveLength(1);
        expect(useCanvasStore.getState().shapes[0].id).toBe("shape-server-1");
        expect(useCanvasStore.getState().canUndo()).toBe(false);
        expect(useCanvasStore.getState().canRedo()).toBe(false);
        expect(useCanvasStore.getState().past).toHaveLength(0);
        expect(useCanvasStore.getState().future).toHaveLength(0);
    });
});
