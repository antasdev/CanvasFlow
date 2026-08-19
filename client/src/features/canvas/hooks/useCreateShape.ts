import { useMutation, useQueryClient } from "@tanstack/react-query";

import { shapeApi, type CreateShapeRequest } from "../api/shape.api";
import { canvasKeys } from "../constants";

export const useCreateShape = (canvasId?: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: CreateShapeRequest) => shapeApi.createShape(payload),

    onSuccess: async (createdShape) => {
      const targetCanvasId = canvasId ?? createdShape.canvasId;
      await queryClient.invalidateQueries({
        queryKey: canvasKeys.shapes(targetCanvasId),
      });
    },
  });
};
