import { Server as HttpServer } from "http";

import { Server } from "socket.io";

import { SocketEvents } from "./socket.events";

import { registerBoardHandlers } from "./handlers/board.handler";
import { socketAuthMiddleware } from "./socket.middleware";
import { registerShapeHandlers } from "./handlers/shape.handler";
import { registerPresenceHandlers } from "./handlers/presence.handler";


import {
    ClientToServerEvents,
    ServerToClientEvents,
    SocketData,
    AuthSocket,
    JoinBoardPayload,
    LeaveBoardPayload,
} from "./socket.types";

import { presenceManager } from "./presence/presence.manager";
import { getBoardRoom } from "./socket.rooms";

export class SocketServer {
    private io: Server<
        ClientToServerEvents,
        ServerToClientEvents,
        {},
        SocketData
    >;

    constructor(httpServer: HttpServer) {
        this.io = new Server<
            ClientToServerEvents,
            ServerToClientEvents,
            {},
            SocketData
        >(httpServer, {
            cors: {
                origin: process.env.CLIENT_URL,
                credentials: true,
            },
        });


        this.io.use(
            socketAuthMiddleware
        );


        this.registerConnection();
    }


    private registerConnection(): void {
        this.io.on(
            SocketEvents.CONNECTION,
            (socket) => {

                console.log(
                    `Socket connected: ${socket.id}`
                );


                registerBoardHandlers(socket);

                registerShapeHandlers(
                    this.io,
                    socket
                );


                socket.on(
                    SocketEvents.DISCONNECT,
                    () => {
                        const boardId =
                            presenceManager.getBoardId(
                                socket.id
                            );

                        if (boardId) {
                            presenceManager.removeSocket(
                                socket.id
                            );

                            socket
                                .to(getBoardRoom(boardId))
                                .emit(
                                    SocketEvents.USER_LEFT,
                                    {
                                        userId:
                                            socket.data.user.userId.toString(),
                                    }
                                );
                        }

                        console.log(
                            `Socket disconnected: ${socket.id}`
                        );
                    }
                );

                registerPresenceHandlers(
                    this.io,
                    socket
                );

            }
        );
    }


    public getIO(): Server<
        ClientToServerEvents,
        ServerToClientEvents,
        {},
        SocketData
    > {
        return this.io;
    }
}