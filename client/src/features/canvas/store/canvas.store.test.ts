import { beforeEach, describe, expect, it } from "vitest";

import { useCanvasStore } from "./canvas.store";

describe("canvas store history & remote synchronization", () => {
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

    it("applies remote shape creation without modifying undo/redo history", () => {
        // 1. Perform local action to have undo history
        const localShape = {
            id: "local-1",
            type: "rectangle" as const,
            x: 10,
            y: 10,
            width: 50,
            height: 50,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            fill: "#ffffff",
            stroke: "#1f2937",
            strokeWidth: 2,
        };
        useCanvasStore.getState().addShape(localShape);
        expect(useCanvasStore.getState().past).toHaveLength(1);

        // 2. Receive remote shape creation
        const remoteShape = {
            id: "remote-1",
            type: "rectangle" as const,
            x: 100,
            y: 100,
            width: 80,
            height: 80,
            rotation: 0,
            opacity: 1,
            zIndex: 2,
            fill: "#3b82f6",
            stroke: "#1e40af",
            strokeWidth: 2,
        };
        useCanvasStore.getState().applyRemoteShapeCreated(remoteShape);

        // Verify shape added
        expect(useCanvasStore.getState().shapes).toHaveLength(2);
        expect(useCanvasStore.getState().shapes.find((s) => s.id === "remote-1")).toBeDefined();

        // Verify undo/redo stacks were NOT polluted or altered
        expect(useCanvasStore.getState().past).toHaveLength(1);
        expect(useCanvasStore.getState().future).toHaveLength(0);
    });

    it("applies remote shape update without modifying undo/redo history", () => {
        const shape = {
            id: "shape-1",
            type: "rectangle" as const,
            x: 50,
            y: 50,
            width: 100,
            height: 100,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            fill: "#ffffff",
            stroke: "#1f2937",
            strokeWidth: 2,
        };
        useCanvasStore.getState().setShapes([shape]);

        // Remote collaborator updates position and rotation
        const updatedRemoteShape = {
            ...shape,
            x: 200,
            y: 250,
            rotation: 45,
        };
        useCanvasStore.getState().applyRemoteShapeUpdated(updatedRemoteShape);

        const current = useCanvasStore.getState().shapes[0];
        expect(current.x).toBe(200);
        expect(current.y).toBe(250);
        expect(current.rotation).toBe(45);

        // Verify undo stack remains empty
        expect(useCanvasStore.getState().past).toHaveLength(0);
        expect(useCanvasStore.getState().future).toHaveLength(0);
    });

    it("applies remote shape deletion without modifying undo/redo history and clears selection", () => {
        const shape1 = {
            id: "shape-1",
            type: "rectangle" as const,
            x: 10,
            y: 10,
            width: 50,
            height: 50,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            fill: "#ffffff",
            stroke: "#1f2937",
            strokeWidth: 2,
        };
        useCanvasStore.getState().setShapes([shape1]);
        useCanvasStore.getState().setSelectedShapeIds(["shape-1"]);

        expect(useCanvasStore.getState().selectedShapeIds).toContain("shape-1");

        // Remote collaborator deletes shape-1
        useCanvasStore.getState().applyRemoteShapeDeleted("shape-1");

        expect(useCanvasStore.getState().shapes).toHaveLength(0);
        expect(useCanvasStore.getState().selectedShapeIds).not.toContain("shape-1");

        // Verify undo stack remains empty
        expect(useCanvasStore.getState().past).toHaveLength(0);
        expect(useCanvasStore.getState().future).toHaveLength(0);
    });

    it("manages remote cursors without modifying undo/redo history", () => {
        const cursor1 = {
            userId: "user-1",
            boardId: "board-1",
            x: 100,
            y: 200,
        };

        const cursor2 = {
            userId: "user-2",
            boardId: "board-1",
            x: 300,
            y: 400,
        };

        // 1. Set remote cursors
        useCanvasStore.getState().setRemoteCursor(cursor1);
        useCanvasStore.getState().setRemoteCursor(cursor2);

        expect(Object.keys(useCanvasStore.getState().remoteCursors)).toHaveLength(2);
        expect(useCanvasStore.getState().remoteCursors["user-1"].x).toBe(100);
        expect(useCanvasStore.getState().remoteCursors["user-2"].x).toBe(300);

        // 2. Update existing cursor
        useCanvasStore.getState().setRemoteCursor({
            ...cursor1,
            x: 150,
            y: 250,
        });
        expect(useCanvasStore.getState().remoteCursors["user-1"].x).toBe(150);

        // 3. Remove single cursor
        useCanvasStore.getState().removeRemoteCursor("user-1");
        expect(useCanvasStore.getState().remoteCursors["user-1"]).toBeUndefined();
        expect(useCanvasStore.getState().remoteCursors["user-2"]).toBeDefined();

        // 4. Clear all cursors
        useCanvasStore.getState().clearRemoteCursors();
        expect(Object.keys(useCanvasStore.getState().remoteCursors)).toHaveLength(0);

        // Verify undo/redo stacks were NEVER modified by cursor state
        expect(useCanvasStore.getState().past).toHaveLength(0);
        expect(useCanvasStore.getState().future).toHaveLength(0);
    });

    it("manages remote selections without modifying undo/redo history", () => {
        const selection1 = {
            userId: "user-1",
            boardId: "board-1",
            shapeIds: ["shape-101", "shape-102"],
        };

        const selection2 = {
            userId: "user-2",
            boardId: "board-1",
            shapeIds: ["shape-201"],
        };

        // 1. Set remote selections
        useCanvasStore.getState().setRemoteSelection(selection1);
        useCanvasStore.getState().setRemoteSelection(selection2);

        expect(Object.keys(useCanvasStore.getState().remoteSelections)).toHaveLength(2);
        expect(useCanvasStore.getState().remoteSelections["user-1"].shapeIds).toEqual(["shape-101", "shape-102"]);
        expect(useCanvasStore.getState().remoteSelections["user-2"].shapeIds).toEqual(["shape-201"]);

        // 2. Update existing selection
        useCanvasStore.getState().setRemoteSelection({
            ...selection1,
            shapeIds: ["shape-101"],
        });
        expect(useCanvasStore.getState().remoteSelections["user-1"].shapeIds).toEqual(["shape-101"]);

        // 3. Remove single user selection
        useCanvasStore.getState().removeRemoteSelection("user-1");
        expect(useCanvasStore.getState().remoteSelections["user-1"]).toBeUndefined();
        expect(useCanvasStore.getState().remoteSelections["user-2"]).toBeDefined();

        // 4. Clear all selections
        useCanvasStore.getState().clearRemoteSelections();
        expect(Object.keys(useCanvasStore.getState().remoteSelections)).toHaveLength(0);

        // Verify undo/redo stacks were NEVER modified by selection state
        expect(useCanvasStore.getState().past).toHaveLength(0);
        expect(useCanvasStore.getState().future).toHaveLength(0);
    });
});
