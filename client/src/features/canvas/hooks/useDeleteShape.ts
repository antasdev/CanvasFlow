import { useMutation, useQueryClient } from "@tanstack/react-query";

import { shapeApi } from "../api/shape.api";
import { canvasKeys } from "../constants";

export const useDeleteShape = (canvasId?: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => shapeApi.deleteShape(id),

    onSuccess: async () => {
      if (canvasId) {
        await queryClient.invalidateQueries({
          queryKey: canvasKeys.shapes(canvasId),
        });
      }
    },

    onError: async () => {
      if (canvasId) {
        await queryClient.invalidateQueries({
          queryKey: canvasKeys.shapes(canvasId),
        });
      }
    },
  });
};