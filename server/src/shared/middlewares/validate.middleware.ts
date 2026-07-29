import { NextFunction, Request, Response } from "express";
import { ZodSchema } from "zod";

import { HttpStatus } from "@/shared/constants";

export const validate =
  <T>(schema: ZodSchema<T>) =>
  (
    req: Request,
    res: Response,
    next: NextFunction
  ): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: "Validation failed.",
        errors: result.error.flatten(),
      });

      return;
    }

    req.body = result.data;

    next();
  };