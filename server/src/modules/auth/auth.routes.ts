import { Router } from "express";

import {
  asyncHandler,
  authenticate,
  validate,
} from "@/shared/middlewares";

import { authController } from "./auth.controller";

import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
} from "./auth.validation";

const authRouter = Router();

authRouter.post(
  "/register",
  validate(registerSchema),
  asyncHandler(
    authController.register.bind(authController)
  )
);

authRouter.post(
  "/login",
  validate(loginSchema),
  asyncHandler(
    authController.login.bind(authController)
  )
);

authRouter.post(
  "/refresh",
  asyncHandler(
    authController.refreshToken.bind(authController)
  )
);
authRouter.get(
  "/me",
  authenticate,
  asyncHandler(
    authController.me.bind(authController)
  )
);

authRouter.post(
  "/logout",
  authenticate,
  asyncHandler(
    authController.logout.bind(authController)
  )
);

export default authRouter;