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
    const result = schema.safeParse({
      body: req.body,
      params: req.params,
      query: req.query,
    });

    if (!result.success) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: "Validation failed.",
        errors: result.error.flatten(),
      });

      return;
    }

    const validated = result.data as {
      body?: Request["body"];
      params?: Request["params"];
      query?: Request["query"];
    };

    if (validated.body !== undefined) {
      req.body = validated.body;
    }

    if (validated.params !== undefined) {
      req.params = validated.params;
    }

    if (validated.query !== undefined) {
      Object.defineProperty(req, "query", {
        value: validated.query,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }

    next();
  };