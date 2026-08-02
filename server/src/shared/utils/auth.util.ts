import { Types } from "mongoose";

import { verifyAccessToken } from "@/modules/auth/auth.tokens";
import { SocketUser } from "@/socket/socket.types";

export const authenticateToken = (
  token: string
): SocketUser => {
  const payload = verifyAccessToken(token);

  return {
    userId: new Types.ObjectId(payload.userId),
  };
};