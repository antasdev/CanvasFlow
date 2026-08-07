import { Button } from "@/components/ui";

import { useDeleteBoard } from "../hooks";
import type { Board } from "../types";

type DeleteBoardDialogProps = {
  board: Board | null;
  workspaceId: string;
  onClose: () => void;
};

export const DeleteBoardDialog = ({
  board,
  workspaceId,
  onClose,
}: DeleteBoardDialogProps): React.JSX.Element | null => {
  const deleteBoard = useDeleteBoard();

  if (!board) {
    return null;
  }

  const handleDelete = (): void => {
    deleteBoard.mutate(
      {
        boardId: board.id,
        workspaceId,
      },
      {
        onSuccess: () => {
          onClose();
        },
      },
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Delete Board
          </h2>

          <p className="mt-2 text-sm leading-6 text-gray-600">
            Are you sure you want to delete{" "}
            <span className="font-semibold text-gray-900">
              {board.name}
            </span>
            ?
          </p>

          <p className="mt-2 text-sm text-red-600">
            This action cannot be undone.
          </p>
        </div>

        <div className="flex justify-end gap-3">
          <Button
            type="button"
            onClick={onClose}
            disabled={deleteBoard.isPending}
            className="w-auto bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
          >
            Cancel
          </Button>

          <Button
            type="button"
            onClick={handleDelete}
            disabled={deleteBoard.isPending}
            className="w-auto bg-red-600 hover:bg-red-700"
          >
            {deleteBoard.isPending
              ? "Deleting..."
              : "Delete Board"}
          </Button>
        </div>
      </div>
    </div>
  );
};