import { Request, Response } from "express";
import { Types } from "mongoose";

import { shapeService } from "./shape.service";

import {
    HttpStatus,
    Messages,
} from "@/shared/constants";

import {
    IdParams,
    ShapeCanvasParams,
} from "@/shared/types/route-params.types";

export class ShapeController {
    async createShape(
        req: Request,
        res: Response
    ): Promise<void> {
        const createdBy = new Types.ObjectId(
            req.user!.userId
        );

        const shape =
            await shapeService.createShape(
                createdBy,
                req.body
            );

        res.status(HttpStatus.CREATED).json({
            success: true,
            data: shape,
        });
    }

    async getShape(
        req: Request<IdParams>,
        res: Response
    ): Promise<void> {
        const id = new Types.ObjectId(
            req.params.id
        );

        const shape =
            await shapeService.getShapeById(id);

        res.status(HttpStatus.OK).json({
            success: true,
            data: shape,
        });
    }

    async getCanvasShapes(
        req: Request<ShapeCanvasParams>,
        res: Response
    ): Promise<void> {
        const canvasId = new Types.ObjectId(
            req.params.canvasId
        );

        const shapes =
            await shapeService.getCanvasShapes(
                canvasId
            );

        res.status(HttpStatus.OK).json({
            success: true,
            data: shapes,
        });
    }

    async updateShape(
        req: Request<IdParams>,
        res: Response
    ): Promise<void> {
        const id = new Types.ObjectId(
            req.params.id
        );

        const shape =
            await shapeService.updateShape(
                id,
                req.body
            );

        res.status(HttpStatus.OK).json({
            success: true,
            data: shape,
        });
    }

    async deleteShape(
        req: Request<IdParams>,
        res: Response
    ): Promise<void> {
        const id = new Types.ObjectId(
            req.params.id
        );

        await shapeService.deleteShape(id);

        res.status(HttpStatus.OK).json({
            success: true,
            message:
                Messages.SHAPE_DELETED,
        });
    }
}

export const shapeController =
    new ShapeController();