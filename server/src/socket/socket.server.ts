import { Server as HttpServer } from "http";

import { Server } from "socket.io";

import { SocketEvents } from "./socket.events";

import { registerBoardHandlers } from "./handlers/board.handler";
import { socketAuthMiddleware } from "./socket.middleware";
import { registerShapeHandlers } from "./handlers/shape.handler";


import {
    ClientToServerEvents,
    ServerToClientEvents,
    SocketData,
} from "./socket.types";

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


                registerBoardHandlers(
                    this.io,
                    socket
                );

                registerShapeHandlers(
                    this.io,
                    socket
                );


                socket.on(
                    SocketEvents.DISCONNECT,
                    () => {
                        console.log(
                            `Socket disconnected: ${socket.id}`
                        );
                    }
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