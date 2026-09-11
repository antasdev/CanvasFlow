import { Request, Response } from "express";
import { Types } from "mongoose";
import { HttpStatus } from "@/shared/constants";
import { searchService } from "./search.service";
import {
  SearchEntityType,
  SearchQueryInput,
  SearchScopeType,
} from "./search.types";

export class SearchController {
  async search(req: Request, res: Response): Promise<void> {
    const userId = new Types.ObjectId(req.user.userId);

    const input: SearchQueryInput = {
      q: String(req.query.q || ""),
      scope: req.query.scope as SearchScopeType,
      workspaceId: req.query.workspaceId ? String(req.query.workspaceId) : undefined,
      boardId: req.query.boardId ? String(req.query.boardId) : undefined,
      types: Array.isArray(req.query.types)
        ? (req.query.types as SearchEntityType[])
        : typeof req.query.types === "string"
        ? (req.query.types.split(",").map((s) => s.trim()) as SearchEntityType[])
        : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      cursor:
        req.query.cursor && String(req.query.cursor).trim().length > 0
          ? String(req.query.cursor).trim()
          : undefined,
    };

    const result = await searchService.search(userId, input);

    res.status(HttpStatus.OK).json({
      success: true,
      data: result,
    });
  }
}

export const searchController = new SearchController();
