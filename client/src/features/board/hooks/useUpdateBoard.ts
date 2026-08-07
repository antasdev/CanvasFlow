import { useMutation, useQueryClient } from "@tanstack/react-query";

import { boardApi } from "../api/board.api";
import { boardKeys } from "../constants";
import type { UpdateBoardRequest } from "../types";
type UpdateBoardVariables = {
  boardId: string;
  payload: UpdateBoardRequest;
};

export const useUpdateBoard = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      boardId,
      payload,
    }: UpdateBoardVariables) =>
      boardApi.updateBoard(boardId, payload),

    onSuccess: async (board) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: boardKeys.detail(board.id),
        }),
        queryClient.invalidateQueries({
          queryKey: boardKeys.workspace(board.workspaceId),
        }),
      ]);
    },
  });
};