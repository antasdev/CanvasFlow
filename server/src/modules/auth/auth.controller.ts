import { Request, Response } from "express";

import env from "@/config/env";
import { authService } from "./auth.service";
import { RegisterDto, LoginDto } from "./auth.dto";
import { HttpStatus } from "@/shared/constants/http-status";

const getRefreshTokenCookieOptions = () => ({
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
});

export class AuthController {
  async register(req: Request, res: Response): Promise<void> {
    const result = await authService.register(
      req.body as RegisterDto
    );

    res.cookie(
      "refreshToken",
      result.tokens.refreshToken,
      getRefreshTokenCookieOptions()
    );

    res.status(HttpStatus.CREATED).json({
      success: true,
      data: {
        user: result.user,
        accessToken: result.tokens.accessToken,
      },
    });
  }

  async login(req: Request, res: Response): Promise<void> {
    const result = await authService.login(
      req.body as LoginDto
    );

    res.cookie(
      "refreshToken",
      result.tokens.refreshToken,
      getRefreshTokenCookieOptions()
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
      getRefreshTokenCookieOptions()
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

    res.clearCookie("refreshToken", {
      httpOnly: true,
      secure: env.NODE_ENV === "production",
      sameSite: "lax",
    });

    res.status(HttpStatus.OK).json({
      success: true,
      message: "Logged out successfully."
    });
  }
}

export const authController = new AuthController();