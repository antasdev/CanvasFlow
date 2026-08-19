import { useQuery } from "@tanstack/react-query";

import { shapeApi } from "../api/shape.api";
import { canvasKeys } from "../constants";

export const useShapes = (canvasId?: string) => {
  return useQuery({
    queryKey: canvasKeys.shapes(canvasId ?? ""),
    queryFn: () => shapeApi.getShapes(canvasId ?? ""),
    enabled: Boolean(canvasId),
  });
};
