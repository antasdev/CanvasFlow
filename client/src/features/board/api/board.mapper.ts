import type { Board } from "../types";

type BoardApiResponse = {
    _id: string;
    workspaceId: string;
    name: string;
    description?: string;
    createdBy: string;
    createdAt: string;
    updatedAt: string;
};

export const mapBoardResponse = (
    board: BoardApiResponse,
): Board => {
    return {
        id: board._id,
        workspaceId: board.workspaceId,
        name: board.name,
        description: board.description,
        createdBy: board.createdBy,
        createdAt: board.createdAt,
        updatedAt: board.updatedAt,
    };
};