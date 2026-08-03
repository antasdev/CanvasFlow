import { Types } from "mongoose";
import { Socket } from "socket.io";
import { Shape } from "@/modules/shape";
import { CreateShapeDto } from "@/modules/shape";
import { UpdateShapeDto } from "@/modules/shape";
export type SocketUser = {
    userId: Types.ObjectId;
};


export type SocketData = {
    user: SocketUser;
};


export type JoinBoardPayload = {
    boardId: string;

    canvasId: string;
};


export type LeaveBoardPayload = {
    boardId: string;
};


export type ClientToServerEvents = {
    "board:join": (
        payload: JoinBoardPayload
    ) => void;

    "board:leave": (
        payload: LeaveBoardPayload
    ) => void;

    "shape:create": (
        payload: CreateShapePayload
    ) => void;

    "shape:update": (
        payload: UpdateShapePayload
    ) => void;

    "shape:delete": (
        payload: DeleteShapePayload
    ) => void;

    "cursor:move": (
        payload: CursorMovePayload
    ) => void;
};


export type ServerToClientEvents = {
    "shape:created": (
        shape: Shape
    ) => void;

    "shape:updated": (
        shape: Shape
    ) => void;

    "shape:deleted": (
        payload: DeleteShapePayload
    ) => void;

    "cursor:moved": (
        payload: CursorMovedPayload
    ) => void;

    "canvas:sync": (
        payload: CanvasSyncPayload
    ) => void;

    "user:joined": (
        payload: UserJoinedPayload
    ) => void;

    "user:left": (
        payload: UserLeftPayload
    ) => void;

    error: (
        message: string
    ) => void;
};

export type AuthSocket = Socket<
    ClientToServerEvents,
    ServerToClientEvents,
    {},
    SocketData
>;


/**
 * Shape Create Event
 */
export type CreateShapePayload = CreateShapeDto;

/**
 * Shape Update Event
 */
export type UpdateShapePayload = {
    shapeId: string;

    data: UpdateShapeDto;
};

/**
 * Shape Delete Event
 */
export type DeleteShapePayload = {
    shapeId: string;
};

export type CanvasSyncPayload = {
    canvasId: string;

    shapes: Shape[];
};

export type CursorPosition = {
    x: number;
    y: number;
};

export type CursorMovePayload = {
    boardId: string;
    position: CursorPosition;
};

export type CursorMovedPayload = {
    boardId: string;

    position: CursorPosition;

    userId: string;
};

export type UserJoinedPayload = {
    userId: string;
};

export type UserLeftPayload = {
    userId: string;
};