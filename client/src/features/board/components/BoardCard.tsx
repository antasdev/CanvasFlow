import { formatRelativeDate } from "@/utils/date";

import type { Board } from "../types";
type BoardCardProps = {
  board: Board;
  onOpen: (boardId: string) => void;
  onEdit: (board: Board) => void;
  onDelete: (board: Board) => void;
};

export const BoardCard = ({
  board,
  onOpen,
  onEdit,
  onDelete,
}: BoardCardProps) => {
  return (
    <article className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate text-lg font-semibold text-gray-900">
            {board.name}
          </h3>

          {board.description && (
            <p className="mt-2 line-clamp-2 text-sm text-gray-500">
              {board.description}
            </p>
          )}
        </div>

        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => onEdit(board)}
            className="text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Edit
          </button>

          <button
            type="button"
            onClick={() => onDelete(board)}
            className="text-sm font-medium text-red-600 hover:text-red-700"
          >
            Delete
          </button>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between">
        <span className="text-xs text-gray-400">
          Updated{" "}
           Updated {formatRelativeDate(board.updatedAt)}
        </span>

        <button
          type="button"
          onClick={() => onOpen(board.id)}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800"
        >
          Open Board
        </button>
      </div>
    </article>
  );
};