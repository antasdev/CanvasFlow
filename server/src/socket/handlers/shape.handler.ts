import { Server } from "socket.io";
import { Types } from "mongoose";

import { shapeService } from "@/modules/shape";

import { SocketEvents } from "../socket.events";
import { getBoardRoom } from "../socket.rooms";

import {
    AuthSocket,
    CreateShapePayload,
    UpdateShapePayload,
    DeleteShapePayload,
    ClientToServerEvents,
    ServerToClientEvents,
    SocketData,
} from "../socket.types";

export const registerShapeHandlers = (
    io: Server<
        ClientToServerEvents,
        ServerToClientEvents,
        {},
        SocketData
    >,
    socket: AuthSocket
): void => {
    socket.on(
        SocketEvents.SHAPE_CREATE,
        async (payload: CreateShapePayload) => {
            console.log("Received shape:create", payload);
            try {
                const createdBy = socket.data.user.userId;

                const result =
                    await shapeService.createShape(
                        createdBy,
                        payload
                    );

                io.to(
                    getBoardRoom(
                        result.boardId.toString()
                    )
                ).emit(
                    SocketEvents.SHAPE_CREATED,
                    result.shape
                );
            } catch (error) {
                console.error(error);

                socket.emit(
                    SocketEvents.ERROR,
                    error instanceof Error
                        ? error.message
                        : "Unexpected error."
                );
            }
        }
    );

    socket.on(
        SocketEvents.SHAPE_UPDATE,
        async (payload: UpdateShapePayload) => {
            console.log("Received shape:update", payload);
            try {
                const result =
                    await shapeService.updateShape(
                        new Types.ObjectId(payload.shapeId),
                        payload.data
                    );

                io.to(
                    getBoardRoom(
                        result.boardId.toString()
                    )
                ).emit(
                    SocketEvents.SHAPE_UPDATED,
                    result.shape
                );
            } catch (error) {
                console.error("Shape Update Error:", error);

                socket.emit(
                    SocketEvents.ERROR,
                    error instanceof Error
                        ? error.message
                        : "Unexpected error."
                );
            }
        }
    );

    socket.on(
        SocketEvents.SHAPE_DELETE,
        async (payload: DeleteShapePayload) => {
            try {
                const result =
                    await shapeService.deleteShape(
                        new Types.ObjectId(payload.shapeId)
                    );

                io.to(
                    getBoardRoom(
                        result.boardId.toString()
                    )
                ).emit(
                    SocketEvents.SHAPE_DELETED,
                    payload
                );
            } catch (error) {
                console.error("Shape Delete Error:", error);

                socket.emit(
                    SocketEvents.ERROR,
                    error instanceof Error
                        ? error.message
                        : "Unexpected error."
                );
            }
        }
    );
};