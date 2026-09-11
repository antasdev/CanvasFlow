import { Types } from "mongoose";
import { ApiError } from "@/shared/utils/ApiError";
import { HttpStatus } from "@/shared/constants/http-status";
import { boardRepository } from "../board/board.repository";
import { BoardService } from "../board/board.service";
import { workspaceRepository } from "../workspace/workspace.repository";
import { workspaceMemberRepository } from "../workspace/workspaceMember.repository";
import { WorkspaceRole, WorkspaceVisibility } from "../workspace/workspace.types";
import { BoardVisibility } from "../board/board.types";
import { searchRepository, CursorFilter, EntityQueryCursor } from "./search.repository";
import {
  SearchEntityType,
  SearchResultItem,
  SearchResponseDto,
  SearchQueryInput,
  EntityCursor,
  CompositeCursorPayload,
  ENTITY_TYPE_PRIORITY,
} from "./search.types";
import {
  escapeRegex,
  encodeV2Cursor,
  decodeCursor,
} from "./search.validation";

const DEFAULT_ENTITY_TYPES: readonly SearchEntityType[] = [
  "board",
  "canvas",
  "shape",
  "comment",
] as const;

export class SearchService {
  private boardService: BoardService;

  constructor(boardService?: BoardService) {
    this.boardService = boardService || new BoardService();
  }

  /**
   * Helper to generate a contextual snippet around a matched keyword.
   */
  private createSnippet(
    text: string | undefined,
    query: string,
    maxLength: number = 120
  ): string | undefined {
    if (!text) {
      return undefined;
    }

    const lowerText = text.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const index = lowerText.indexOf(lowerQuery);

    if (index === -1) {
      return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
    }

    const start = Math.max(0, index - 30);
    const end = Math.min(text.length, index + query.length + 60);
    const prefix = start > 0 ? "..." : "";
    const suffix = end < text.length ? "..." : "";

    return `${prefix}${text.slice(start, end).trim()}${suffix}`;
  }

  /**
   * Authorizes the user and determines the accessible board IDs for the search request.
   * Leverages lightweight projections to avoid hydrating full Board documents.
   */
  private async resolveAccessibleBoardIds(
    userId: Types.ObjectId,
    scope: "workspace" | "board",
    workspaceId?: string,
    boardId?: string
  ): Promise<Types.ObjectId[]> {
    if (scope === "board") {
      if (!boardId) {
        throw new ApiError(
          HttpStatus.BAD_REQUEST,
          "boardId is required for board-scoped search."
        );
      }

      const boardObjId = new Types.ObjectId(boardId);
      const authorizedBoard = await this.boardService.authorizeBoardAccess(
        boardObjId,
        userId
      );

      return [authorizedBoard._id];
    }

    if (!workspaceId) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "workspaceId is required for workspace-scoped search."
      );
    }

    const wsObjId = new Types.ObjectId(workspaceId);
    const workspace = await workspaceRepository.findById(wsObjId);

    if (!workspace) {
      throw new ApiError(HttpStatus.NOT_FOUND, "Workspace not found.");
    }

    const isOwner = workspace.ownerId.equals(userId);
    const isPublicWorkspace = workspace.visibility === WorkspaceVisibility.PUBLIC;

    let memberRole: WorkspaceRole | null = null;
    if (!isOwner) {
      const member = await workspaceMemberRepository.findByWorkspaceAndUser(
        wsObjId,
        userId
      );
      if (member) {
        memberRole = member.role;
      }
    }

    if (!isOwner && !isPublicWorkspace && !memberRole) {
      throw new ApiError(
        HttpStatus.FORBIDDEN,
        "You do not have permission to search this workspace."
      );
    }

    // Optimization: query lightweight auth summaries ({ _id, visibility, createdBy })
    const allBoards = await boardRepository.findBoardAuthSummaries(wsObjId);

    if (isOwner || memberRole === WorkspaceRole.OWNER || memberRole === WorkspaceRole.ADMIN) {
      return allBoards.map((b) => b._id);
    }

    const accessibleBoards = allBoards.filter((b) => {
      if (b.visibility === BoardVisibility.PUBLIC) {
        return true;
      }
      if (b.createdBy.equals(userId)) {
        return true;
      }
      if (memberRole) {
        return true;
      }
      return false;
    });

    return accessibleBoards.map((b) => b._id);
  }

  /**
   * Converts a cursor to an EntityCursor if possible.
   */
  private toEntityCursor(
    c?: EntityQueryCursor
  ): EntityCursor | undefined {
    if (!c) return undefined;
    if ("t" in c) return c;
    if (c.id) {
      return { t: c.timestamp.getTime(), id: c.id };
    }
    return undefined;
  }

  /**
   * Primary search execution entry point.
   */
  async search(
    userId: Types.ObjectId,
    input: SearchQueryInput
  ): Promise<SearchResponseDto> {
    const trimmedQuery = input.q.trim();
    if (!trimmedQuery) {
      throw new ApiError(
        HttpStatus.BAD_REQUEST,
        "Search query cannot be empty."
      );
    }

    const limit = Math.min(Math.max(input.limit ?? 20, 1), 50);

    const requestedTypes =
      input.types && input.types.length > 0
        ? input.types
        : DEFAULT_ENTITY_TYPES;

    let cursorBoard: EntityQueryCursor | undefined;
    let cursorCanvas: EntityQueryCursor | undefined;
    let cursorShape: EntityQueryCursor | undefined;
    let cursorComment: EntityQueryCursor | undefined;

    if (input.cursor) {
      const decoded = decodeCursor(input.cursor);
      if (!decoded) {
        throw new ApiError(HttpStatus.BAD_REQUEST, "Invalid cursor.");
      }

      if (decoded.version === 2 && decoded.v2) {
        cursorBoard = decoded.v2.b;
        cursorCanvas = decoded.v2.c;
        cursorShape = decoded.v2.s;
        cursorComment = decoded.v2.m;
      } else if (decoded.version === 1 && decoded.v1) {
        const v1Date = new Date(decoded.v1.timestamp);
        const isSingleEntity = requestedTypes.length === 1;

        if (isSingleEntity) {
          const v1Filter: CursorFilter = {
            timestamp: v1Date,
            id: decoded.v1.id,
          };
          cursorBoard = v1Filter;
          cursorCanvas = v1Filter;
          cursorShape = v1Filter;
          cursorComment = v1Filter;
        } else {
          const v1Filter: CursorFilter = {
            timestamp: v1Date,
          };
          cursorBoard = v1Filter;
          cursorCanvas = v1Filter;
          cursorShape = v1Filter;
          cursorComment = v1Filter;
        }
      }
    }

    const accessibleBoardIds = await this.resolveAccessibleBoardIds(
      userId,
      input.scope,
      input.workspaceId,
      input.boardId
    );

    if (accessibleBoardIds.length === 0) {
      return {
        results: [],
        pagination: {
          limit,
          nextCursor: null,
          hasMore: false,
        },
      };
    }

    const escapedQuery = escapeRegex(trimmedQuery);
    const queryLimit = limit + 1;

    const candidateItems: SearchResultItem[] = [];
    let anySubQueryHasMore = false;

    // 1. Search Boards (if requested)
    if (requestedTypes.includes("board")) {
      const rawBoards = await searchRepository.searchBoards(
        accessibleBoardIds,
        escapedQuery,
        queryLimit,
        cursorBoard
      );

      if (rawBoards.length > limit) {
        anySubQueryHasMore = true;
      }

      for (const b of rawBoards.slice(0, limit + 1)) {
        const titleMatch = b.name.toLowerCase().includes(trimmedQuery.toLowerCase());
        const matchedField = titleMatch ? "name" : "description";
        const snippet = this.createSnippet(
          matchedField === "description" ? b.description : b.name,
          trimmedQuery
        );

        candidateItems.push({
          id: b._id.toString(),
          entityType: "board",
          title: b.name,
          snippet,
          boardId: b._id.toString(),
          boardName: b.name,
          matchedField,
          createdAt: b.createdAt.toISOString(),
          updatedAt: b.updatedAt.toISOString(),
        });
      }
    }

    // 2. Search Canvases (if requested)
    if (requestedTypes.includes("canvas")) {
      const rawCanvases = await searchRepository.searchCanvases(
        accessibleBoardIds,
        escapedQuery,
        queryLimit,
        cursorCanvas
      );

      if (rawCanvases.length > limit) {
        anySubQueryHasMore = true;
      }

      for (const c of rawCanvases.slice(0, limit + 1)) {
        candidateItems.push({
          id: c._id.toString(),
          entityType: "canvas",
          title: c.name,
          snippet: this.createSnippet(c.name, trimmedQuery),
          boardId: c.boardId.toString(),
          canvasId: c._id.toString(),
          canvasName: c.name,
          matchedField: "name",
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        });
      }
    }

    // 3. Search Shapes (if requested)
    if (requestedTypes.includes("shape")) {
      const canvasIds = await searchRepository.findCanvasIdsByBoardIds(
        accessibleBoardIds
      );

      if (canvasIds.length > 0) {
        const rawShapes = await searchRepository.searchShapes(
          canvasIds,
          escapedQuery,
          queryLimit,
          cursorShape
        );

        if (rawShapes.length > limit) {
          anySubQueryHasMore = true;
        }

        for (const s of rawShapes.slice(0, limit + 1)) {
          const text = s.text || "";
          const snippet = this.createSnippet(text, trimmedQuery);
          const title = text.length > 40 ? `${text.slice(0, 40)}...` : text || `${s.type} Shape`;

          candidateItems.push({
            id: s._id.toString(),
            entityType: "shape",
            title,
            snippet,
            boardId: "", // Resolved in batch below
            canvasId: s.canvasId.toString(),
            shapeId: s._id.toString(),
            matchedField: "text",
            createdAt: s.createdAt.toISOString(),
            updatedAt: s.updatedAt.toISOString(),
          });
        }
      }
    }

    // 4. Search Comments (if requested)
    if (requestedTypes.includes("comment")) {
      const rawComments = await searchRepository.searchComments(
        accessibleBoardIds,
        escapedQuery,
        queryLimit,
        cursorComment
      );

      if (rawComments.length > limit) {
        anySubQueryHasMore = true;
      }

      for (const cm of rawComments.slice(0, limit + 1)) {
        const snippet = this.createSnippet(cm.content, trimmedQuery);
        const title =
          cm.content.length > 40
            ? `${cm.content.slice(0, 40)}...`
            : cm.content || "Comment";

        candidateItems.push({
          id: cm._id.toString(),
          entityType: "comment",
          title,
          snippet,
          boardId: cm.boardId.toString(),
          canvasId: cm.canvasId.toString(),
          shapeId: cm.shapeId ? cm.shapeId.toString() : undefined,
          commentId: cm._id.toString(),
          matchedField: "content",
          createdAt: cm.createdAt.toISOString(),
          updatedAt: cm.updatedAt.toISOString(),
        });
      }
    }

    // Deterministic ordering:
    // 1. createdAt DESC
    // 2. ENTITY_TYPE_PRIORITY (board=1, canvas=2, shape=3, comment=4)
    // 3. id DESC (within same entity type)
    candidateItems.sort((a, b) => {
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      if (timeA !== timeB) {
        return timeB - timeA;
      }
      const priorityA = ENTITY_TYPE_PRIORITY[a.entityType];
      const priorityB = ENTITY_TYPE_PRIORITY[b.entityType];
      if (priorityA !== priorityB) {
        return priorityA - priorityB;
      }
      return b.id.localeCompare(a.id);
    });

    const hasMore = candidateItems.length > limit || anySubQueryHasMore;
    const paginatedItems = candidateItems.slice(0, limit);

    // Batch resolve board and canvas names for the final page items (Strict N+1 prevention)
    const canvasIdsToResolve: Types.ObjectId[] = [];
    const boardIdsToResolve: Types.ObjectId[] = [];

    for (const item of paginatedItems) {
      if (item.canvasId && !item.canvasName) {
        canvasIdsToResolve.push(new Types.ObjectId(item.canvasId));
      }
      if (item.boardId && !item.boardName) {
        boardIdsToResolve.push(new Types.ObjectId(item.boardId));
      }
    }

    const canvasMetaMap = await searchRepository.getCanvasMetadata(
      canvasIdsToResolve
    );

    for (const item of paginatedItems) {
      if (item.canvasId) {
        const meta = canvasMetaMap.get(item.canvasId);
        if (meta) {
          if (!item.boardId) {
            item.boardId = meta.boardId;
          }
          if (!item.canvasName) {
            item.canvasName = meta.name;
          }
          if (meta.boardId && !boardIdsToResolve.some((id) => id.toString() === meta.boardId)) {
            boardIdsToResolve.push(new Types.ObjectId(meta.boardId));
          }
        }
      }
    }

    const boardNameMap = await searchRepository.getBoardNames(boardIdsToResolve);

    for (const item of paginatedItems) {
      if (item.boardId && !item.boardName) {
        item.boardName = boardNameMap.get(item.boardId);
      }
    }

    // Determine per-entity cursor progress:
    // Every item consumed advances ONLY the cursor belonging to its own collection.
    // Unconsumed entities retain their incoming progress.
    let lastConsumedBoard: SearchResultItem | undefined;
    let lastConsumedCanvas: SearchResultItem | undefined;
    let lastConsumedShape: SearchResultItem | undefined;
    let lastConsumedComment: SearchResultItem | undefined;

    for (const item of paginatedItems) {
      if (item.entityType === "board") lastConsumedBoard = item;
      else if (item.entityType === "canvas") lastConsumedCanvas = item;
      else if (item.entityType === "shape") lastConsumedShape = item;
      else if (item.entityType === "comment") lastConsumedComment = item;
    }

    const nextB: EntityCursor | undefined = lastConsumedBoard
      ? { t: new Date(lastConsumedBoard.createdAt).getTime(), id: lastConsumedBoard.id }
      : this.toEntityCursor(cursorBoard);

    const nextC: EntityCursor | undefined = lastConsumedCanvas
      ? { t: new Date(lastConsumedCanvas.createdAt).getTime(), id: lastConsumedCanvas.id }
      : this.toEntityCursor(cursorCanvas);

    const nextS: EntityCursor | undefined = lastConsumedShape
      ? { t: new Date(lastConsumedShape.createdAt).getTime(), id: lastConsumedShape.id }
      : this.toEntityCursor(cursorShape);

    const nextM: EntityCursor | undefined = lastConsumedComment
      ? { t: new Date(lastConsumedComment.createdAt).getTime(), id: lastConsumedComment.id }
      : this.toEntityCursor(cursorComment);

    let nextCursor: string | null = null;
    if (hasMore && paginatedItems.length > 0) {
      const v2Payload: CompositeCursorPayload = { v: 2 };
      if (nextB) v2Payload.b = nextB;
      if (nextC) v2Payload.c = nextC;
      if (nextS) v2Payload.s = nextS;
      if (nextM) v2Payload.m = nextM;

      nextCursor = encodeV2Cursor(v2Payload);
    }

    return {
      results: paginatedItems,
      pagination: {
        limit,
        nextCursor,
        hasMore,
      },
    };
  }
}

export const searchService = new SearchService();
