import { Request, Response } from "express";

import { userService } from "./user.service";


type UserIdParams = {
  id: string;
};


export class UserController {
  async createUser(req: Request, res: Response): Promise<void> {
    const user = await userService.createUser(req.body);

    res.status(201).json({
      success: true,
      data: user,
    });
  }

  async getUserById(
    req: Request<UserIdParams>,
    res: Response
  ): Promise<void> {
    const user = await userService.getUserById(req.params.id);

    res.status(200).json({
      success: true,
      data: user,
    });
  }

  async updateUser(
    req: Request<UserIdParams>,
    res: Response
  ): Promise<void> {
    const user = await userService.updateUser(req.params.id, req.body);

    res.status(200).json({
      success: true,
      data: user,
    });
  }

  async deleteUser(
    req: Request<UserIdParams>,
    res: Response
  ): Promise<void> {
    await userService.deleteUser(req.params.id);

    res.status(204).send();
  }
}

export const userController = new UserController();