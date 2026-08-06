import { useQuery } from "@tanstack/react-query";

import { workspaceApi } from "../api";
import { workspaceQueryKeys } from "../constants";
import type { Workspace } from "../types";

export function useWorkspace(
  workspaceId: string,
) {
  return useQuery<Workspace>({
    queryKey: workspaceQueryKeys.detail(
      workspaceId,
    ),
    queryFn: () =>
      workspaceApi.getWorkspace(
        workspaceId,
      ),
    enabled: Boolean(workspaceId),
  });
}