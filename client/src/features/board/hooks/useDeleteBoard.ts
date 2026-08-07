import { useMutation, useQueryClient } from "@tanstack/react-query";

import { boardApi } from "../api/board.api";
import { boardKeys } from "../constants";
type DeleteBoardVariables = {
  boardId: string;
  workspaceId: string;
};

export const useDeleteBoard = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      boardId,
    }: DeleteBoardVariables) =>
      boardApi.deleteBoard(boardId),

    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({
        queryKey: boardKeys.workspace(
          variables.workspaceId,
        ),
      });

      queryClient.removeQueries({
        queryKey: boardKeys.detail(
          variables.boardId,
        ),
      });
    },
  });
};