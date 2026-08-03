import { Server } from "socket.io";
import { Types } from "mongoose";

import { shapeService } from "@/modules/shape";

import {
  AuthSocket,
  JoinBoardPayload,
  LeaveBoardPayload,
} from "../socket.types";

import { SocketEvents } from "../socket.events";
import { getBoardRoom } from "../socket.rooms";
import { presenceManager } from "../presence/presence.manager";

export const registerBoardHandlers = (
  socket: AuthSocket
): void => {

  socket.on(
    SocketEvents.BOARD_JOIN,
    async ({
      boardId,
      canvasId,
    }: JoinBoardPayload) => {
      const shapes =
        await shapeService.getCanvasShapes(
          new Types.ObjectId(canvasId)
        );

      socket.emit(
        SocketEvents.CANVAS_SYNC,
        {
          canvasId,
          shapes,
        }
      );

      presenceManager.joinBoard(
        boardId,
        socket.id,
        socket.data.user
      );
      console.log(
        "Users in board:",
        presenceManager.getUsers(boardId)
      );
      socket.to(
        getBoardRoom(boardId)
      ).emit(
        SocketEvents.USER_JOINED,
        {
          userId:
            socket.data.user.userId.toString(),
        }
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

      presenceManager.leaveBoard(
        boardId,
        socket.id
      );

      socket.to(
        getBoardRoom(boardId)
      ).emit(
        SocketEvents.USER_LEFT,
        {
          userId:
            socket.data.user.userId.toString(),
        }
      );

      console.log(
        `User ${socket.data.user.userId} left board ${boardId}`
      );
    }
  );
};