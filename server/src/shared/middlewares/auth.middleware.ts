import { NextFunction, Request, Response } from "express";

import { verifyAccessToken } from "@/modules/auth/auth.tokens";
import { HttpStatus } from "@/shared/constants/http-status";
import { ApiError } from "@/shared/utils/ApiError";

export const authenticate = (
  req: Request,
  _res: Response,
  next: NextFunction
): void => {
  const authorization = req.headers.authorization;

  if (!authorization) {
    throw new ApiError(
      HttpStatus.UNAUTHORIZED,
      "Authentication required."
    );
  }

  if (!authorization.startsWith("Bearer ")) {
    throw new ApiError(
      HttpStatus.UNAUTHORIZED,
      "Invalid authorization header."
    );
  }

  const token = authorization.split(" ")[1];

  const payload = verifyAccessToken(token);

  req.user = payload;

  next();
};