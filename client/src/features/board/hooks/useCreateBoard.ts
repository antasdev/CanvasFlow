import { useMutation, useQueryClient } from "@tanstack/react-query";

import { boardApi } from "../api/board.api";
import { boardKeys } from "../constants";
import type { CreateBoardRequest } from "../types";
export const useCreateBoard = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateBoardRequest) =>
      boardApi.createBoard(payload),

    onSuccess: async (board) => {
      await queryClient.invalidateQueries({
        queryKey: boardKeys.workspace(board.workspaceId),
      });
    },
  });
};