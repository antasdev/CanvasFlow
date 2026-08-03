import { Server } from "socket.io";

import { SocketEvents } from "../socket.events";
import { getBoardRoom } from "../socket.rooms";

import {
    AuthSocket,
    CursorMovePayload,
    ClientToServerEvents,
    ServerToClientEvents,
    SocketData,
} from "../socket.types";

export const registerPresenceHandlers = (
    io: Server<
        ClientToServerEvents,
        ServerToClientEvents,
        {},
        SocketData
    >,
    socket: AuthSocket
): void => {
    socket.on(
        SocketEvents.CURSOR_MOVE,
        (payload: CursorMovePayload) => {
            socket.to(getBoardRoom(payload.boardId)).emit(
                SocketEvents.CURSOR_MOVED,
                {
                    ...payload,
                    userId: socket.data.user.userId.toString(),
                }
            );
        }
    );
};