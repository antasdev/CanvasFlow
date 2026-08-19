import { useQuery } from "@tanstack/react-query";

import { canvasApi } from "../api/canvas.api";
import { canvasKeys } from "../constants";

export const useBoardCanvases = (boardId?: string) => {
  return useQuery({
    queryKey: canvasKeys.boardCanvases(boardId ?? ""),
    queryFn: () => canvasApi.getBoardCanvases(boardId ?? ""),
    enabled: Boolean(boardId),
  });
};
