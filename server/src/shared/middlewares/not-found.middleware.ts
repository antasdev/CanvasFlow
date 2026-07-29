import { NextFunction, Request, Response } from "express";

import { HttpStatus, Messages } from "@/shared/constants";

export const notFoundMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  res.status(HttpStatus.NOT_FOUND).json({
    success: false,
    message: Messages.RESOURCE_NOT_FOUND,
  });
};