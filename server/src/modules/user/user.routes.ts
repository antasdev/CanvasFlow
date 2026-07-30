import { Router } from "express";
import { UserRole } from "./user.types";


import {
  asyncHandler,
  authenticate,
  authorize,
  validate,
} from "@/shared/middlewares";

import { userController } from "./user.controller";
import {
  createUserSchema,
  updateUserSchema,
} from "./user.validation";

const userRouter = Router();

userRouter.post(
  "/",
  validate(createUserSchema),
  asyncHandler(userController.createUser.bind(userController))
);

userRouter.get(
  "/:id",
  authenticate,
  asyncHandler(userController.getUserById.bind(userController))
);

userRouter.patch(
  "/:id",
  authenticate,
  validate(updateUserSchema),
  asyncHandler(userController.updateUser.bind(userController))
);

userRouter.delete(
  "/:id",
  authenticate,
  authorize(UserRole.ADMIN),
  asyncHandler(userController.deleteUser.bind(userController))
);

export default userRouter;