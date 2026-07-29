import { Request, Response } from "express";

import { HttpStatus, Messages } from "@/shared/constants";
import { ApiResponse } from "@/shared/utils";
import { IdParams } from "@/shared/types/route-params.types";

import { userService } from "./user.service";

export class UserController {
  async createUser(req: Request, res: Response): Promise<void> {
    const user = await userService.createUser(req.body);

    ApiResponse.success(
      res,
      HttpStatus.CREATED,
      Messages.USER_CREATED,
      user
    );
  }

  async getUserById(
    req: Request<IdParams>,
    res: Response
  ): Promise<void> {
    const user = await userService.getUserById(req.params.id);

    ApiResponse.success(
      res,
      HttpStatus.OK,
      Messages.USER_FOUND,
      user
    );
  }

  async updateUser(
    req: Request<IdParams>,
    res: Response
  ): Promise<void> {
    const user = await userService.updateUser(req.params.id, req.body);

    ApiResponse.success(
      res,
      HttpStatus.OK,
      Messages.USER_UPDATED,
      user
    );
  }

  async deleteUser(
    req: Request<IdParams>,
    res: Response
  ): Promise<void> {
    await userService.deleteUser(req.params.id);

    ApiResponse.success(
      res,
      HttpStatus.OK,
      Messages.USER_DELETED
    );
  }
}

export const userController = new UserController();