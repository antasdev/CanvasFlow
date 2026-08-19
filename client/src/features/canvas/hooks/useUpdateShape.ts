import { useMutation, useQueryClient } from "@tanstack/react-query";

import { shapeApi, type UpdateShapeRequest } from "../api/shape.api";
import { canvasKeys } from "../constants";

type UpdateShapeMutationPayload = {
  id: string;
  data: UpdateShapeRequest;
};

export const useUpdateShape = (canvasId?: string) => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: UpdateShapeMutationPayload) =>
      shapeApi.updateShape(id, data),

    onSuccess: async (updatedShape) => {
      const targetCanvasId = canvasId ?? updatedShape.canvasId;
      await queryClient.invalidateQueries({
        queryKey: canvasKeys.shapes(targetCanvasId),
      });
    },
  });
};
