import { Router } from "express";

const router = Router();

router.get("/health", (_req,res)=>{
    res.status(200).json({
        success:true,
        message:"CanvasFlow Backend is running"
    })
})

export default router;