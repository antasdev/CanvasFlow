import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import { buildRoutes } from "@/app/router/route.constants";
import { Button } from "@/components/ui";

import {
  BoardGrid,
  CreateBoardDialog,
  DeleteBoardDialog,
  EditBoardDialog,
  EmptyBoardState,
} from "../components";
import { useBoards } from "../hooks";
import type { Board } from "../types";

export const WorkspaceBoardsPage = (): React.JSX.Element => {
  const navigate = useNavigate();
  const { workspaceId } = useParams<{
    workspaceId: string;
  }>();

  const [isCreateDialogOpen, setIsCreateDialogOpen] =
    useState(false);

  const [editingBoard, setEditingBoard] =
    useState<Board | null>(null);

  const [deletingBoard, setDeletingBoard] =
    useState<Board | null>(null);

  const {
    data: boards = [],
    isLoading,
    isError,
    refetch,
  } = useBoards(workspaceId ?? "");

  if (!workspaceId) {
    return (
      <div className="p-6">
        <p className="text-sm text-red-600">
          Workspace ID is missing.
        </p>
      </div>
    );
  }

  const handleOpenBoard = (boardId: string): void => {
    navigate(buildRoutes.boardDetails(boardId));
  };

  const handleEditBoard = (board: Board): void => {
    setEditingBoard(board);
  };

  const handleDeleteBoard = (board: Board): void => {
    setDeletingBoard(board);
  };

  const handleCreateBoard = (): void => {
    setIsCreateDialogOpen(true);
  };

  const handleCloseCreateDialog = (): void => {
    setIsCreateDialogOpen(false);
  };

  const handleCloseEditDialog = (): void => {
    setEditingBoard(null);
  };

  const handleCloseDeleteDialog = (): void => {
    setDeletingBoard(null);
  };

  return (
    <section className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">
            Boards
          </h1>

          <p className="mt-1 text-sm text-gray-500">
            Create and manage boards in this workspace.
          </p>
        </div>

        <Button
          type="button"
          onClick={handleCreateBoard}
          className="w-auto"
        >
          Create Board
        </Button>
      </header>

      {isLoading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-8 text-center">
          <p className="text-sm text-gray-500">
            Loading boards...
          </p>
        </div>
      ) : null}

      {isError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <h2 className="font-semibold text-red-900">
            Unable to load boards
          </h2>

          <p className="mt-2 text-sm text-red-700">
            Something went wrong while loading the boards.
          </p>

          <Button
            type="button"
            onClick={() => {
              void refetch();
            }}
            className="mx-auto mt-4 w-auto"
          >
            Try Again
          </Button>
        </div>
      ) : null}

      {!isLoading && !isError && boards.length === 0 ? (
        <EmptyBoardState
          onCreate={handleCreateBoard}
        />
      ) : null}

      {!isLoading && !isError && boards.length > 0 ? (
        <BoardGrid
          boards={boards}
          onOpen={handleOpenBoard}
          onEdit={handleEditBoard}
          onDelete={handleDeleteBoard}
        />
      ) : null}

      <CreateBoardDialog
        workspaceId={workspaceId}
        isOpen={isCreateDialogOpen}
        onClose={handleCloseCreateDialog}
      />

      <EditBoardDialog
        board={editingBoard}
        onClose={handleCloseEditDialog}
      />

      <DeleteBoardDialog
        board={deletingBoard}
        workspaceId={workspaceId}
        onClose={handleCloseDeleteDialog}
      />
    </section>
  );
};