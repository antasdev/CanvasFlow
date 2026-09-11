import { Types } from "mongoose";
import { BoardModel } from "../board/board.model";
import { CanvasModel } from "../canvas/canvas.model";
import { ShapeModel } from "../shape/shape.model";
import { CommentModel } from "../comment/comment.model";
import {
  EntityCursor,
  RawBoardSearchResult,
  RawCanvasSearchResult,
  RawShapeSearchResult,
  RawCommentSearchResult,
} from "./search.types";

export interface CursorFilter {
  timestamp: Date;
  id?: string;
}

export type EntityQueryCursor = EntityCursor | CursorFilter;

export interface QueryPlanExecutionStats {
  winningPlan: Record<string, unknown>;
  keysExamined: number;
  docsExamined: number;
  nReturned: number;
  executionTimeMillis: number;
  stages: string[];
}

export class SearchRepository {
  /**
   * Builds the Mongoose cursor condition for deterministic createdAt DESC, _id DESC ordering.
   */
  buildCursorCondition(
    cursor?: EntityQueryCursor
  ): Record<string, unknown> | null {
    if (!cursor) {
      return null;
    }

    const date = "t" in cursor ? new Date(cursor.t) : cursor.timestamp;
    const id = cursor.id;

    if (id) {
      return {
        $or: [
          { createdAt: { $lt: date } },
          {
            createdAt: date,
            _id: { $lt: new Types.ObjectId(id) },
          },
        ],
      };
    }

    return {
      createdAt: { $lt: date },
    };
  }

  /**
   * Search boards by matching name or description, scoped to accessible board IDs.
   */
  async searchBoards(
    accessibleBoardIds: Types.ObjectId[],
    escapedRegex: string,
    limit: number,
    cursor?: EntityQueryCursor
  ): Promise<RawBoardSearchResult[]> {
    if (accessibleBoardIds.length === 0) {
      return [];
    }

    const regex = new RegExp(escapedRegex, "i");
    const query: Record<string, unknown> = {
      _id: { $in: accessibleBoardIds },
      isArchived: false,
      $or: [{ name: regex }, { description: regex }],
    };

    const cursorCondition = this.buildCursorCondition(cursor);
    if (cursorCondition) {
      query.$and = [cursorCondition];
    }

    return BoardModel.find(query)
      .select({
        _id: 1,
        name: 1,
        description: 1,
        workspaceId: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean<RawBoardSearchResult[]>()
      .exec();
  }

  /**
   * Search canvases by matching name, scoped to accessible board IDs.
   */
  async searchCanvases(
    accessibleBoardIds: Types.ObjectId[],
    escapedRegex: string,
    limit: number,
    cursor?: EntityQueryCursor
  ): Promise<RawCanvasSearchResult[]> {
    if (accessibleBoardIds.length === 0) {
      return [];
    }

    const regex = new RegExp(escapedRegex, "i");
    const query: Record<string, unknown> = {
      boardId: { $in: accessibleBoardIds },
      name: regex,
    };

    const cursorCondition = this.buildCursorCondition(cursor);
    if (cursorCondition) {
      query.$and = [cursorCondition];
    }

    return CanvasModel.find(query)
      .select({
        _id: 1,
        name: 1,
        boardId: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean<RawCanvasSearchResult[]>()
      .exec();
  }

  /**
   * Search shapes by matching text property, scoped to canvases of accessible boards.
   */
  async searchShapes(
    accessibleCanvasIds: Types.ObjectId[],
    escapedRegex: string,
    limit: number,
    cursor?: EntityQueryCursor
  ): Promise<RawShapeSearchResult[]> {
    if (accessibleCanvasIds.length === 0) {
      return [];
    }

    const regex = new RegExp(escapedRegex, "i");
    const query: Record<string, unknown> = {
      canvasId: { $in: accessibleCanvasIds },
      text: regex,
    };

    const cursorCondition = this.buildCursorCondition(cursor);
    if (cursorCondition) {
      query.$and = [cursorCondition];
    }

    return ShapeModel.find(query)
      .select({
        _id: 1,
        type: 1,
        text: 1,
        canvasId: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean<RawShapeSearchResult[]>()
      .exec();
  }

  /**
   * Search comments by matching content, scoped to accessible board IDs.
   */
  async searchComments(
    accessibleBoardIds: Types.ObjectId[],
    escapedRegex: string,
    limit: number,
    cursor?: EntityQueryCursor
  ): Promise<RawCommentSearchResult[]> {
    if (accessibleBoardIds.length === 0) {
      return [];
    }

    const regex = new RegExp(escapedRegex, "i");
    const query: Record<string, unknown> = {
      boardId: { $in: accessibleBoardIds },
      deletedAt: null,
      content: regex,
    };

    const cursorCondition = this.buildCursorCondition(cursor);
    if (cursorCondition) {
      query.$and = [cursorCondition];
    }

    return CommentModel.find(query)
      .select({
        _id: 1,
        content: 1,
        boardId: 1,
        canvasId: 1,
        shapeId: 1,
        createdAt: 1,
        updatedAt: 1,
      })
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .lean<RawCommentSearchResult[]>()
      .exec();
  }

  /**
   * Retrieves all canvas IDs belonging to a list of boards.
   */
  async findCanvasIdsByBoardIds(
    boardIds: Types.ObjectId[]
  ): Promise<Types.ObjectId[]> {
    if (boardIds.length === 0) {
      return [];
    }

    const canvases = await CanvasModel.find({
      boardId: { $in: boardIds },
    })
      .select({ _id: 1 })
      .lean<{ _id: Types.ObjectId }[]>()
      .exec();

    return canvases.map((c) => c._id);
  }

  /**
   * Batch resolves board names to prevent N+1 query patterns.
   */
  async getBoardNames(
    boardIds: Types.ObjectId[]
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (boardIds.length === 0) {
      return map;
    }

    const boards = await BoardModel.find({
      _id: { $in: boardIds },
    })
      .select({ _id: 1, name: 1 })
      .lean<{ _id: Types.ObjectId; name: string }[]>()
      .exec();

    for (const b of boards) {
      map.set(b._id.toString(), b.name);
    }

    return map;
  }

  /**
   * Batch resolves canvas metadata (name and boardId) to prevent N+1 query patterns.
   */
  async getCanvasMetadata(
    canvasIds: Types.ObjectId[]
  ): Promise<Map<string, { name: string; boardId: string }>> {
    const map = new Map<string, { name: string; boardId: string }>();
    if (canvasIds.length === 0) {
      return map;
    }

    const canvases = await CanvasModel.find({
      _id: { $in: canvasIds },
    })
      .select({ _id: 1, name: 1, boardId: 1 })
      .lean<{ _id: Types.ObjectId; name: string; boardId: Types.ObjectId }[]>()
      .exec();

    for (const c of canvases) {
      map.set(c._id.toString(), {
        name: c.name,
        boardId: c.boardId.toString(),
      });
    }

    return map;
  }

  /**
   * Diagnostic test-only helper to inspect MongoDB execution plans with executionStats.
   * Internal / test-only - never exposed via public endpoints.
   */
  async explainQuery(
    entity: "board" | "canvas" | "shape" | "comment",
    filter: Record<string, unknown>,
    sort: Record<string, 1 | -1> = { createdAt: -1, _id: -1 },
    limit: number = 20
  ): Promise<QueryPlanExecutionStats> {
    let rawExplain: Record<string, unknown>;

    switch (entity) {
      case "board":
        rawExplain = (await BoardModel.find(filter)
          .sort(sort)
          .limit(limit)
          .explain("executionStats")) as unknown as Record<string, unknown>;
        break;
      case "canvas":
        rawExplain = (await CanvasModel.find(filter)
          .sort(sort)
          .limit(limit)
          .explain("executionStats")) as unknown as Record<string, unknown>;
        break;
      case "shape":
        rawExplain = (await ShapeModel.find(filter)
          .sort(sort)
          .limit(limit)
          .explain("executionStats")) as unknown as Record<string, unknown>;
        break;
      case "comment":
        rawExplain = (await CommentModel.find(filter)
          .sort(sort)
          .limit(limit)
          .explain("executionStats")) as unknown as Record<string, unknown>;
        break;
    }

    const executionStats = (rawExplain.executionStats || {}) as Record<string, unknown>;
    const queryPlanner = (rawExplain.queryPlanner || {}) as Record<string, unknown>;
    const winningPlan = (queryPlanner.winningPlan || {}) as Record<string, unknown>;

    const stages: string[] = [];
    const collectStages = (plan: Record<string, unknown>) => {
      if (typeof plan.stage === "string") {
        stages.push(plan.stage);
      }
      if (plan.inputStage && typeof plan.inputStage === "object") {
        collectStages(plan.inputStage as Record<string, unknown>);
      }
      if (Array.isArray(plan.inputStages)) {
        for (const inputStage of plan.inputStages) {
          if (typeof inputStage === "object" && inputStage !== null) {
            collectStages(inputStage as Record<string, unknown>);
          }
        }
      }
    };
    collectStages(winningPlan);

    return {
      winningPlan,
      keysExamined: Number(executionStats.totalKeysExamined || 0),
      docsExamined: Number(executionStats.totalDocsExamined || 0),
      nReturned: Number(executionStats.nReturned || 0),
      executionTimeMillis: Number(executionStats.executionTimeMillis || 0),
      stages,
    };
  }
}

export const searchRepository = new SearchRepository();
