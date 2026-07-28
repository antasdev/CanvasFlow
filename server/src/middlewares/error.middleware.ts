import { NextFunction, Request, Response } from "express";

const errorMiddleware = (
    error: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
): void => {
    console.error(error);

    res.status(500).json({
        success: false,
        message: "Internal Server Error"
    });
};

export default errorMiddleware;