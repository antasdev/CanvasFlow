import { useQuery } from "@tanstack/react-query";

import { boardApi } from "../api/board.api";
import { boardKeys } from "../constants";
export const useBoard = (boardId: string) => {
  return useQuery({
    queryKey: boardKeys.detail(boardId),
    queryFn: () => boardApi.getBoard(boardId),
    enabled: Boolean(boardId),
  });
};