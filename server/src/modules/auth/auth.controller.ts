import { Request, Response } from "express";

import { authService } from "./auth.service";

import { RegisterDto, LoginDto } from "./auth.dto";

import { HttpStatus } from "@/shared/constants/http-status";

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    const result = await authService.register(
      req.body as RegisterDto
    );

    res.status(HttpStatus.CREATED).json({
      success: true,
      data: result,
    });
  }

  async login(req: Request, res: Response): Promise<void> {
    const result = await authService.login(
      req.body as LoginDto
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data: result,
    });
  }

  async refreshToken(req: Request, res: Response): Promise<void> {
  const result = await authService.refreshToken(
    req.body
  );

  res.status(HttpStatus.OK).json({
    success: true,
    data: result,
  });
}

  async logout(req: Request, res: Response): Promise<void> {
    await authService.logout(
      req.user.userId
    );

    res.status(HttpStatus.OK).json({
      success: true,
      message: "Logged out successfully."
    });
  }
}

export const authController = new AuthController();