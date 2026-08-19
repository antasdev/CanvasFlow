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

    res.cookie(
      "refreshToken",
      result.tokens.refreshToken,
      {
        httpOnly: true,
        secure: false, // development
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.tokens.accessToken,
      },
    });
  }

  async me(req: Request, res: Response): Promise<void> {
    const user = await authService.getCurrentUser(
      req.user.userId
    );

    res.status(HttpStatus.OK).json({
      success: true,
      data: {
        user,
      },
    });
  }

  async refreshToken(req: Request, res: Response): Promise<void> {
    const refreshToken = req.cookies.refreshToken;
    const result = await authService.refreshToken(refreshToken);
    res.cookie(
      "refreshToken",
      result.tokens.refreshToken,
      {
        httpOnly: true,
        secure: false,
        sameSite: "lax",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      }
    );
    res.status(HttpStatus.OK).json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.tokens.accessToken,
      },
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