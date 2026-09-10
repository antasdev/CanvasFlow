import { Router } from "express";
import {
  asyncHandler,
  authenticate,
  validate,
} from "@/shared/middlewares";
import { searchController } from "./search.controller";
import { searchQuerySchema } from "./search.validation";

export const searchRouter = Router();

/**
 * Unified Search Endpoint
 * GET /api/v1/search
 */
searchRouter.get(
  "/",
  authenticate,
  validate(searchQuerySchema),
  asyncHandler(searchController.search.bind(searchController))
);
