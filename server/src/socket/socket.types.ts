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
};


export type ServerToClientEvents = {
    "shape:created": (shape: Shape) => void;

    error: (message: string) => void;

    "shape:updated": (
        shape: Shape
    ) => void;

    "shape:deleted": (
        payload: DeleteShapePayload
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