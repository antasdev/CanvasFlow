import { Server } from "socket.io";

import {
  AuthSocket,
  JoinBoardPayload,
  LeaveBoardPayload,
} from "../socket.types";

import { SocketEvents } from "../socket.events";
import { getBoardRoom } from "../socket.rooms";


export const registerBoardHandlers = (
  _io: Server,
  socket: AuthSocket
): void => {

  socket.on(
    SocketEvents.BOARD_JOIN,
    ({ boardId }: JoinBoardPayload) => {
      socket.join(
        getBoardRoom(boardId)
      );

      console.log(
        `User ${socket.data.user.userId} joined board ${boardId}`
      );
    }
  );


  socket.on(
    SocketEvents.BOARD_LEAVE,
    ({ boardId }: LeaveBoardPayload) => {
      socket.leave(
        getBoardRoom(boardId)
      );
    }
  );
};