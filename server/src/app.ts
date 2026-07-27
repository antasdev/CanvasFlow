import express,{Application} from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

import healthRoutes from "./routes/health.routes";
import notFoundMiddleware from "./middlewares/notFound.middleware";
import errorMiddleware from "./middlewares/error.middleware";

const app:Application=express();

app.use(express.json());
app.use(cors());
app.use(helmet());
app.use(morgan("dev"));

app.use("/api/v1",healthRoutes)

//404 middleware
app.use(notFoundMiddleware);

// Global error middleware
app.use(errorMiddleware);

app.get("/",(_req,res)=>{
    res.status(200).json({
        success:true,
        message:"CanvasFlow Backend is running"
    })
})

export default app;