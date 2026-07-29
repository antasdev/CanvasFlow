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



const app:Application=express();

app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));

app.use("/api/v1",healthRoutes)
app.use("/api/v1/users", userRouter);

//404 middleware
app.use(notFoundMiddleware);

// Global error middleware
app.use(errorMiddleware);


export default app;