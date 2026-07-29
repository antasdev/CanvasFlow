// import { Router } from "express";

// import { userController } from "./user.controller";

// const userRouter = Router();

// userRouter.post("/", userController.createUser);

// userRouter.get("/:id", userController.getUserById);

// userRouter.patch("/:id", userController.updateUser);

// userRouter.delete("/:id", userController.deleteUser);

// export default userRouter;

import { Router } from "express";

import { asyncHandler, validate } from "@/shared/middlewares";

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
    asyncHandler(userController.getUserById.bind(userController))
);

userRouter.patch(
    "/:id",
    validate(updateUserSchema),
    asyncHandler(userController.updateUser.bind(userController))
);

userRouter.delete(
    "/:id",
    asyncHandler(userController.deleteUser.bind(userController))
);

export default userRouter;