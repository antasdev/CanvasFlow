import { Response } from "express";

export class ApiResponse {
  static success<T>(
    res: Response,
    statusCode: number,
    message: string,
    data?: T
  ): Response {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
    });
  }

  static error(
    res: Response,
    statusCode: number,
    message: string,
    errors?: unknown
  ): Response {
    return res.status(statusCode).json({
      success: false,
      message,
      errors,
    });
  }
}