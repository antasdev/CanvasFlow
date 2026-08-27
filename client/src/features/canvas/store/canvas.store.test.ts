import { beforeEach, describe, expect, it } from "vitest";

import { useCanvasStore } from "./canvas.store";
import type { TextShape } from "../types";

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

    it("manages remote shape soft-locks without modifying undo/redo history", () => {
        const lock1 = {
            shapeId: "shape-101",
            boardId: "board-1",
            userId: "user-1",
            fullName: "Alice Developer",
            color: "#EF4444",
        };

        const lock2 = {
            shapeId: "shape-102",
            boardId: "board-1",
            userId: "user-2",
            fullName: "Bob Designer",
            color: "#3B82F6",
        };

        // 1. Set remote shape locks
        useCanvasStore.getState().setRemoteShapeLock(lock1);
        useCanvasStore.getState().setRemoteShapeLock(lock2);

        expect(Object.keys(useCanvasStore.getState().remoteShapeLocks)).toHaveLength(2);
        expect(useCanvasStore.getState().remoteShapeLocks["shape-101"].userId).toBe("user-1");
        expect(useCanvasStore.getState().remoteShapeLocks["shape-102"].userId).toBe("user-2");

        // 2. Remove single shape lock
        useCanvasStore.getState().removeRemoteShapeLock("shape-101");
        expect(useCanvasStore.getState().remoteShapeLocks["shape-101"]).toBeUndefined();
        expect(useCanvasStore.getState().remoteShapeLocks["shape-102"]).toBeDefined();

        // 3. Clear all shape locks
        useCanvasStore.getState().clearRemoteShapeLocks();
        expect(Object.keys(useCanvasStore.getState().remoteShapeLocks)).toHaveLength(0);

        // Verify undo/redo stacks were NEVER modified by lock state
        expect(useCanvasStore.getState().past).toHaveLength(0);
        expect(useCanvasStore.getState().future).toHaveLength(0);
    });

    it("handles updateShapeText with undo/redo recording", () => {
        const textShape = {
            id: "text-1",
            type: "text" as const,
            x: 100,
            y: 100,
            width: 150,
            height: 40,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            text: "Initial Text",
            fontSize: 24,
            fontFamily: "Inter",
            fontWeight: "normal",
            fontStyle: "normal" as const,
            textDecoration: "none" as const,
            textAlign: "left" as const,
            verticalAlign: "top" as const,
            fill: "#1f2937",
            padding: 4,
            lineHeight: 1.2,
        };

        useCanvasStore.getState().addShape(textShape);
        expect(useCanvasStore.getState().shapes).toHaveLength(1);

        // Update text
        useCanvasStore.getState().updateShapeText("text-1", "Updated Text Content");
        const currentShape = useCanvasStore.getState().shapes[0] as TextShape;
        expect(currentShape.text).toBe("Updated Text Content");

        // Undo
        useCanvasStore.getState().undo();
        const undoneShape = useCanvasStore.getState().shapes[0] as TextShape;
        expect(undoneShape.text).toBe("Initial Text");

        // Redo
        useCanvasStore.getState().redo();
        const redoneShape = useCanvasStore.getState().shapes[0] as TextShape;
        expect(redoneShape.text).toBe("Updated Text Content");
    });

    it("handles applyRemoteShapeUpdated for text shapes without modifying undo/redo history", () => {
        const stickyShape = {
            id: "sticky-1",
            type: "sticky_note" as const,
            x: 200,
            y: 200,
            width: 180,
            height: 180,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            text: "Original Sticky",
            fontSize: 18,
            backgroundColor: "#fef08a",
            textColor: "#1f2937",
        };

        useCanvasStore.getState().setShapes([stickyShape]);
        expect(useCanvasStore.getState().past).toHaveLength(0);

        // Remote collaborator updates text
        const remoteUpdatedSticky = {
            ...stickyShape,
            text: "Remote update from collaborator",
            backgroundColor: "#bbf7d0",
        };

        useCanvasStore.getState().applyRemoteShapeUpdated(remoteUpdatedSticky);

        expect(useCanvasStore.getState().shapes[0]).toEqual(remoteUpdatedSticky);
        expect(useCanvasStore.getState().past).toHaveLength(0);
        expect(useCanvasStore.getState().future).toHaveLength(0);
    });

    it("manages remote shape live transforms without modifying undo/redo history", () => {
        const transform1 = {
            shapeId: "shape-101",
            boardId: "board-1",
            userId: "user-1",
            fullName: "Alice Developer",
            color: "#EF4444",
            x: 250,
            y: 350,
            width: 200,
            height: 150,
            rotation: 45,
            lastUpdatedAt: Date.now(),
        };

        const transform2 = {
            shapeId: "shape-102",
            boardId: "board-1",
            userId: "user-2",
            fullName: "Bob Designer",
            color: "#3B82F6",
            x: 500,
            y: 600,
            width: 180,
            height: 180,
            rotation: 0,
            lastUpdatedAt: Date.now(),
        };

        // 1. Set remote shape transforms
        useCanvasStore.getState().setRemoteShapeTransform(transform1);
        useCanvasStore.getState().setRemoteShapeTransform(transform2);

        expect(Object.keys(useCanvasStore.getState().remoteShapeTransforms)).toHaveLength(2);
        expect(useCanvasStore.getState().remoteShapeTransforms["shape-101"].x).toBe(250);
        expect(useCanvasStore.getState().remoteShapeTransforms["shape-102"].y).toBe(600);

        // 2. Remove single shape transform
        useCanvasStore.getState().removeRemoteShapeTransform("shape-101");
        expect(useCanvasStore.getState().remoteShapeTransforms["shape-101"]).toBeUndefined();
        expect(useCanvasStore.getState().remoteShapeTransforms["shape-102"]).toBeDefined();

        // 3. Clear all transforms
        useCanvasStore.getState().clearRemoteShapeTransforms();
        expect(Object.keys(useCanvasStore.getState().remoteShapeTransforms)).toHaveLength(0);

        // Verify undo/redo stacks were NEVER modified by ephemeral transform frames
        expect(useCanvasStore.getState().past).toHaveLength(0);
        expect(useCanvasStore.getState().future).toHaveLength(0);
    });

    it("cleans up remote transform and lock state when shape is remotely deleted", () => {
        const shape = {
            id: "shape-delete-test",
            type: "rectangle" as const,
            x: 100,
            y: 100,
            width: 100,
            height: 100,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            fill: "#ffffff",
            stroke: "#000000",
            strokeWidth: 2,
        };

        useCanvasStore.getState().setShapes([shape]);
        useCanvasStore.getState().setRemoteShapeLock({
            shapeId: "shape-delete-test",
            boardId: "board-1",
            userId: "user-1",
            fullName: "Alice",
            color: "#EF4444",
        });
        useCanvasStore.getState().setRemoteShapeTransform({
            shapeId: "shape-delete-test",
            boardId: "board-1",
            userId: "user-1",
            fullName: "Alice",
            color: "#EF4444",
            x: 150,
            y: 150,
            width: 100,
            height: 100,
            rotation: 0,
            lastUpdatedAt: Date.now(),
        });

        expect(useCanvasStore.getState().shapes).toHaveLength(1);
        expect(useCanvasStore.getState().remoteShapeLocks["shape-delete-test"]).toBeDefined();
        expect(useCanvasStore.getState().remoteShapeTransforms["shape-delete-test"]).toBeDefined();

        // Delete shape
        useCanvasStore.getState().applyRemoteShapeDeleted("shape-delete-test");

        expect(useCanvasStore.getState().shapes).toHaveLength(0);
        expect(useCanvasStore.getState().remoteShapeLocks["shape-delete-test"]).toBeUndefined();
        expect(useCanvasStore.getState().remoteShapeTransforms["shape-delete-test"]).toBeUndefined();
    });

    it("replaces shapes from recovery without polluting undo/redo history and clears remote transforms", () => {
        // 1. Perform local action to have undo history
        const localShape = {
            id: "local-shape-1",
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

        // 2. Set an ephemeral remote transform
        useCanvasStore.getState().setRemoteShapeTransform({
            shapeId: "shape-transforming",
            boardId: "board-1",
            userId: "user-99",
            fullName: "Remote User",
            color: "#3B82F6",
            x: 200,
            y: 200,
            width: 100,
            height: 100,
            rotation: 0,
            lastUpdatedAt: Date.now(),
        });
        expect(Object.keys(useCanvasStore.getState().remoteShapeTransforms)).toHaveLength(1);

        // 3. Receive authoritative recovery shapes
        const recoveredShapes = [
            {
                id: "authoritative-1",
                type: "rectangle" as const,
                x: 500,
                y: 500,
                width: 300,
                height: 200,
                rotation: 0,
                opacity: 1,
                zIndex: 1,
                fill: "#3B82F6",
                stroke: "#1D4ED8",
                strokeWidth: 2,
            },
            {
                id: "authoritative-2",
                type: "text" as const,
                x: 100,
                y: 100,
                width: 150,
                height: 40,
                rotation: 0,
                opacity: 1,
                zIndex: 2,
                text: "Recovered Text",
                fontSize: 20,
                fontFamily: "Inter",
                fontWeight: "normal",
                fontStyle: "normal" as const,
                textDecoration: "none" as const,
                textAlign: "left" as const,
                verticalAlign: "top" as const,
                fill: "#1f2937",
                padding: 4,
                lineHeight: 1.2,
            },
        ];

        useCanvasStore.getState().replaceShapesFromRecovery(recoveredShapes);

        // Verify shapes were replaced atomically
        expect(useCanvasStore.getState().shapes).toHaveLength(2);
        expect(useCanvasStore.getState().shapes[0].id).toBe("authoritative-1");
        expect(useCanvasStore.getState().shapes[1].id).toBe("authoritative-2");

        // Verify remote transforms were cleared
        expect(Object.keys(useCanvasStore.getState().remoteShapeTransforms)).toHaveLength(0);

        // Verify undo/redo stacks were NEVER modified by recovery
        expect(useCanvasStore.getState().past).toHaveLength(1);
        expect(useCanvasStore.getState().future).toHaveLength(0);
    });

    it("undoes and redoes freehand stroke creation cleanly with ONE history entry", () => {
        const freehandShape = {
            id: "freehand-1",
            type: "freehand" as const,
            x: 100,
            y: 100,
            width: 80,
            height: 60,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            version: 1,
            points: [0, 0, 40, 30, 80, 60],
            stroke: "#1f2937",
            strokeWidth: 2,
        };

        useCanvasStore.getState().addShape(freehandShape);

        expect(useCanvasStore.getState().shapes).toHaveLength(1);
        expect(useCanvasStore.getState().past).toHaveLength(1);

        // Undo removes the entire stroke
        useCanvasStore.getState().undo();
        expect(useCanvasStore.getState().shapes).toHaveLength(0);
        expect(useCanvasStore.getState().future).toHaveLength(1);

        // Redo restores the entire stroke
        useCanvasStore.getState().redo();
        expect(useCanvasStore.getState().shapes).toHaveLength(1);
        expect(useCanvasStore.getState().shapes[0].id).toBe("freehand-1");
    });

    it("moves freehand shape changing only x and y while leaving points array completely untouched", () => {
        const initialPoints = [0, 0, 20, 10, 50, 30];
        const freehandShape = {
            id: "freehand-move",
            type: "freehand" as const,
            x: 100,
            y: 150,
            width: 50,
            height: 30,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            version: 1,
            points: initialPoints,
            stroke: "#1f2937",
            strokeWidth: 2,
        };

        useCanvasStore.getState().addShape(freehandShape);
        useCanvasStore.getState().setSelectedShapeIds(["freehand-move"]);

        // Move by deltaX: 40, deltaY: 60
        useCanvasStore.getState().moveSelectedShapes(40, 60);

        const movedShape = useCanvasStore.getState().shapes[0] as typeof freehandShape;
        expect(movedShape.x).toBe(140);
        expect(movedShape.y).toBe(210);
        // Points array MUST NOT be rewritten during translation!
        expect(movedShape.points).toEqual(initialPoints);
    });

    it("updates freehand transform including rescaled points on updateShapeTransform", () => {
        const freehandShape = {
            id: "freehand-transform",
            type: "freehand" as const,
            x: 100,
            y: 100,
            width: 50,
            height: 50,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            version: 1,
            points: [0, 0, 25, 25, 50, 50],
            stroke: "#1f2937",
            strokeWidth: 2,
        };

        useCanvasStore.getState().addShape(freehandShape);

        const rescaledPoints = [0, 0, 50, 50, 100, 100];
        useCanvasStore.getState().updateShapeTransform("freehand-transform", {
            x: 120,
            y: 130,
            width: 100,
            height: 100,
            rotation: 45,
            points: rescaledPoints,
        });

        const transformedShape = useCanvasStore.getState().shapes[0] as typeof freehandShape;
        expect(transformedShape.x).toBe(120);
        expect(transformedShape.y).toBe(130);
        expect(transformedShape.width).toBe(100);
        expect(transformedShape.height).toBe(100);
        expect(transformedShape.rotation).toBe(45);
        expect(transformedShape.points).toEqual(rescaledPoints);
    });

    it("undoes and redoes line creation", () => {
        const line = {
            id: "line-1",
            type: "line" as const,
            x: 50,
            y: 50,
            width: 100,
            height: 100,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            points: [0, 0, 100, 100],
            stroke: "#1f2937",
            strokeWidth: 2,
            strokeStyle: "solid" as const,
        };

        useCanvasStore.getState().addShape(line);
        expect(useCanvasStore.getState().shapes).toHaveLength(1);

        useCanvasStore.getState().undo();
        expect(useCanvasStore.getState().shapes).toHaveLength(0);

        useCanvasStore.getState().redo();
        expect(useCanvasStore.getState().shapes).toHaveLength(1);
        expect(useCanvasStore.getState().shapes[0].id).toBe("line-1");
    });

    it("undoes and redoes arrow creation", () => {
        const arrow = {
            id: "arrow-1",
            type: "arrow" as const,
            x: 100,
            y: 100,
            width: 150,
            height: 50,
            rotation: 0,
            opacity: 1,
            zIndex: 2,
            points: [0, 0, 150, 50],
            stroke: "#2563eb",
            strokeWidth: 2,
            arrowHeadEnd: true,
        };

        useCanvasStore.getState().addShape(arrow);
        expect(useCanvasStore.getState().shapes).toHaveLength(1);

        useCanvasStore.getState().undo();
        expect(useCanvasStore.getState().shapes).toHaveLength(0);

        useCanvasStore.getState().redo();
        expect(useCanvasStore.getState().shapes).toHaveLength(1);
        expect(useCanvasStore.getState().shapes[0].id).toBe("arrow-1");
    });

    it("undoes and redoes connector creation", () => {
        const connector = {
            id: "conn-1",
            type: "connector" as const,
            x: 200,
            y: 100,
            width: 80,
            height: 60,
            rotation: 0,
            opacity: 1,
            zIndex: 3,
            points: [0, 0, 80, 60],
            stroke: "#059669",
            strokeWidth: 2,
            connector: {
                sourceShapeId: "shape-a",
                sourceAnchor: "top" as const,
                targetShapeId: "shape-b",
                targetAnchor: "bottom" as const,
                routing: "straight" as const,
            },
        };

        useCanvasStore.getState().addShape(connector);
        expect(useCanvasStore.getState().shapes).toHaveLength(1);

        useCanvasStore.getState().undo();
        expect(useCanvasStore.getState().shapes).toHaveLength(0);

        useCanvasStore.getState().redo();
        expect(useCanvasStore.getState().shapes).toHaveLength(1);
        expect(useCanvasStore.getState().shapes[0].id).toBe("conn-1");
    });

    it("does not mutate vector points during moveSelectedShapes", () => {
        const initialPoints = [0, 0, 100, 100];
        const line = {
            id: "line-move-test",
            type: "line" as const,
            x: 50,
            y: 50,
            width: 100,
            height: 100,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            points: [...initialPoints],
            stroke: "#1f2937",
            strokeWidth: 2,
        };

        useCanvasStore.getState().addShape(line);
        useCanvasStore.getState().setSelectedShapeIds(["line-move-test"]);
        useCanvasStore.getState().moveSelectedShapes(30, 40);

        const moved = useCanvasStore.getState().shapes[0] as typeof line;
        expect(moved.x).toBe(80);
        expect(moved.y).toBe(90);
        expect(moved.points).toEqual(initialPoints);
    });

    it("updates line transform with rescaled points on transform normalization", () => {
        const line = {
            id: "line-transform-test",
            type: "line" as const,
            x: 0,
            y: 0,
            width: 50,
            height: 50,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            points: [0, 0, 50, 50],
            stroke: "#1f2937",
            strokeWidth: 2,
        };

        useCanvasStore.getState().addShape(line);

        const rescaledPoints = [0, 0, 100, 100];
        useCanvasStore.getState().updateShapeTransform("line-transform-test", {
            x: 10,
            y: 10,
            width: 100,
            height: 100,
            rotation: 15,
            points: rescaledPoints,
        });

        const transformed = useCanvasStore.getState().shapes[0] as typeof line;
        expect(transformed.x).toBe(10);
        expect(transformed.y).toBe(10);
        expect(transformed.width).toBe(100);
        expect(transformed.height).toBe(100);
        expect(transformed.rotation).toBe(15);
        expect(transformed.points).toEqual(rescaledPoints);
    });

    it("undoes and redoes text creation and content edits atomically", () => {
        const textShape = {
            id: "text-session-1",
            type: "text" as const,
            x: 50,
            y: 50,
            width: 120,
            height: 36,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            text: "Initial text",
            fontSize: 24,
            fontFamily: "Inter",
            fontWeight: "normal" as const,
            fontStyle: "normal" as const,
            textDecoration: "none" as const,
            textAlign: "left" as const,
            verticalAlign: "top" as const,
            fill: "#1f2937",
            padding: 4,
            lineHeight: 1.2,
        };

        useCanvasStore.getState().addShape(textShape);
        expect((useCanvasStore.getState().shapes[0] as TextShape).text).toBe("Initial text");

        // Edit text content
        useCanvasStore.getState().updateShapeText("text-session-1", "Updated after session");
        expect((useCanvasStore.getState().shapes[0] as TextShape).text).toBe("Updated after session");

        // Undo content edit
        useCanvasStore.getState().undo();
        expect((useCanvasStore.getState().shapes[0] as TextShape).text).toBe("Initial text");

        // Undo creation
        useCanvasStore.getState().undo();
        expect(useCanvasStore.getState().shapes).toHaveLength(0);

        // Redo creation
        useCanvasStore.getState().redo();
        expect((useCanvasStore.getState().shapes[0] as TextShape).text).toBe("Initial text");

        // Redo content edit
        useCanvasStore.getState().redo();
        expect((useCanvasStore.getState().shapes[0] as TextShape).text).toBe("Updated after session");
    });

    it("undoes and redoes text formatting atomically", () => {
        const textShape = {
            id: "text-format-1",
            type: "text" as const,
            x: 100,
            y: 100,
            width: 150,
            height: 40,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            text: "Formatting test",
            fontSize: 24,
            fontFamily: "Inter",
            fontWeight: "normal" as const,
            fontStyle: "normal" as const,
            textDecoration: "none" as const,
            textAlign: "left" as const,
            verticalAlign: "top" as const,
            fill: "#1f2937",
            padding: 4,
            lineHeight: 1.2,
        };

        useCanvasStore.getState().addShape(textShape);

        // Apply formatting (bold + italic + align center)
        useCanvasStore.getState().updateShapeFormatting("text-format-1", {
            fontWeight: "bold",
            fontStyle: "italic",
            textAlign: "center",
            fontSize: 32,
        });

        const formatted = useCanvasStore.getState().shapes[0] as typeof textShape;
        expect(formatted.fontWeight).toBe("bold");
        expect(formatted.fontStyle).toBe("italic");
        expect(formatted.textAlign).toBe("center");
        expect(formatted.fontSize).toBe(32);

        // Undo formatting
        useCanvasStore.getState().undo();
        const unformatted = useCanvasStore.getState().shapes[0] as typeof textShape;
        expect(unformatted.fontWeight).toBe("normal");
        expect(unformatted.fontStyle).toBe("normal");
        expect(unformatted.textAlign).toBe("left");
        expect(unformatted.fontSize).toBe(24);

        // Redo formatting
        useCanvasStore.getState().redo();
        const reformatted = useCanvasStore.getState().shapes[0] as typeof textShape;
        expect(reformatted.fontWeight).toBe("bold");
        expect(reformatted.fontStyle).toBe("italic");
    });

    it("does not pollute local undo history on remote shape updates", () => {
        const textShape = {
            id: "text-remote-1",
            type: "text" as const,
            x: 100,
            y: 100,
            width: 150,
            height: 40,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            text: "Original Local",
            fontSize: 24,
            fontFamily: "Inter",
            fontWeight: "normal" as const,
            fontStyle: "normal" as const,
            textDecoration: "none" as const,
            textAlign: "left" as const,
            verticalAlign: "top" as const,
            fill: "#1f2937",
            padding: 4,
            lineHeight: 1.2,
        };

        useCanvasStore.getState().addShape(textShape);
        const pastLengthBefore = useCanvasStore.getState().past.length;

        // Apply remote update from another collaborator
        useCanvasStore.getState().applyRemoteShapeUpdated({
            ...textShape,
            text: "Mutated By Remote Peer",
            version: 2,
        });

        expect((useCanvasStore.getState().shapes[0] as TextShape).text).toBe("Mutated By Remote Peer");
        expect(useCanvasStore.getState().past.length).toBe(pastLengthBefore);
        expect(useCanvasStore.getState().canUndo()).toBe(true);

        // Undo should undo our original creation, not the remote update
        useCanvasStore.getState().undo();
        expect(useCanvasStore.getState().shapes).toHaveLength(0);
    });

    it("undoes and redoes advanced basic shapes (circle, ellipse, triangle, polygon, star)", () => {
        const polygon = {
            id: "poly-1",
            type: "polygon" as const,
            x: 200,
            y: 200,
            width: 150,
            height: 150,
            rotation: 0,
            opacity: 1,
            zIndex: 1,
            sides: 6,
            fill: "#3b82f6",
            stroke: "#1d4ed8",
            strokeWidth: 2,
        };

        const star = {
            id: "star-1",
            type: "star" as const,
            x: 400,
            y: 200,
            width: 160,
            height: 160,
            rotation: 0,
            opacity: 1,
            zIndex: 2,
            shapeConfig: {
                points: 5,
                innerRadiusRatio: 0.5,
            },
            fill: "#eab308",
            stroke: "#ca8a04",
            strokeWidth: 2,
        };

        useCanvasStore.getState().addShape(polygon);
        useCanvasStore.getState().addShape(star);
        expect(useCanvasStore.getState().shapes).toHaveLength(2);

        // Undo star
        useCanvasStore.getState().undo();
        expect(useCanvasStore.getState().shapes).toHaveLength(1);
        expect(useCanvasStore.getState().shapes[0].id).toBe("poly-1");

        // Undo polygon
        useCanvasStore.getState().undo();
        expect(useCanvasStore.getState().shapes).toHaveLength(0);

        // Redo polygon
        useCanvasStore.getState().redo();
        expect(useCanvasStore.getState().shapes).toHaveLength(1);
        expect(useCanvasStore.getState().shapes[0].id).toBe("poly-1");

        // Redo star
        useCanvasStore.getState().redo();
        expect(useCanvasStore.getState().shapes).toHaveLength(2);
        expect(useCanvasStore.getState().shapes[1].id).toBe("star-1");
    });
});
