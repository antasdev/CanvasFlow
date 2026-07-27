import { NextFunction, Request, Response } from "express";

const notFoundMiddleware=(
    _req:Request,
    res:Response,
    _next:NextFunction
):void=>{
    res.status(404).json({
        success:false,
        message:"Routes not found"
    });
};

export default notFoundMiddleware