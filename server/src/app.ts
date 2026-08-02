import express,{Application} from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import healthRoutes from "./routes/health.routes";
import {
  errorMiddleware,
  notFoundMiddleware,
} from "./shared/middlewares";

import { userRouter } from "./modules/user";
import { authRouter } from "./modules/auth";
import { workspaceRouter } from "./modules/workspace";
import { boardRouter } from "@/modules/board";
import { canvasRouter } from "@/modules/canvas";
import { shapeRouter } from "@/modules/shape";


const app:Application=express();

app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));

app.use("/api/v1", healthRoutes);

app.use("/api/v1/auth", authRouter);

app.use("/api/v1/users", userRouter);

app.use("/api/v1/workspaces", workspaceRouter);

app.use("/api/v1/boards", boardRouter);

app.use("/api/v1/canvases", canvasRouter);

app.use("/api/v1/shapes", shapeRouter);

//404 middleware
app.use(notFoundMiddleware);

// Global error middleware
app.use(errorMiddleware);


export default app;