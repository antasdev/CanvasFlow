import { NextFunction, Request, Response } from "express";

import { ApiError } from "@/shared/utils";
import { HttpStatus, Messages } from "@/shared/constants";

export const errorMiddleware = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (error instanceof ApiError) {
    res.status(error.statusCode).json({
      success: false,
      message: error.message,
    });

    return;
  }

  console.error(error);

  res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
    success: false,
    message: Messages.INTERNAL_SERVER_ERROR,
  });
};