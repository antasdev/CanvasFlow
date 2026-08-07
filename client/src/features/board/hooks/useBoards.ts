import {
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";

import { boardApi } from "../api";
import { boardKeys } from "../constants";
import type { Board } from "../types";

export const useBoards = (
  workspaceId: string,
): UseQueryResult<Board[], Error> => {
  return useQuery({
    queryKey: boardKeys.workspace(workspaceId),
    queryFn: () => boardApi.getBoardsByWorkspace(workspaceId),
    enabled: Boolean(workspaceId),
  });
};