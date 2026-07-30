import { NextFunction, Request, Response } from "express";

import { UserRole } from "@/modules/user/user.types";

import { HttpStatus } from "@/shared/constants/http-status";
import { ApiError } from "@/shared/utils/ApiError";

export const authorize =
  (...roles: UserRole[]) =>
  (
    req: Request,
    _res: Response,
    next: NextFunction
  ): void => {
    if (!roles.includes(req.user.role)) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        "You do not have permission to perform this action."
      );
    }

    next();
  };