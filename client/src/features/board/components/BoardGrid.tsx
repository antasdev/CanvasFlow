import type { Board } from "../types";

import { BoardCard } from "./BoardCard";

type BoardGridProps = {
  boards: Board[];
  onOpen: (boardId: string) => void;
  onEdit: (board: Board) => void;
  onDelete: (board: Board) => void;
};

export const BoardGrid = ({
  boards,
  onOpen,
  onEdit,
  onDelete,
}: BoardGridProps): React.JSX.Element => {
  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
      {boards.map((board) => (
        <BoardCard
          key={board.id}
          board={board}
          onOpen={onOpen}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
};