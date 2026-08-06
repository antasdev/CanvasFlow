import { useMutation, useQueryClient } from "@tanstack/react-query";

import { workspaceApi } from "../api";
import { workspaceQueryKeys } from "../constants";

import type {
  UpdateWorkspaceRequest,
  Workspace,
} from "../types";


type UpdateWorkspacePayload = {
  workspaceId: string;
  data: UpdateWorkspaceRequest;
};


export function useUpdateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation<
    Workspace,
    Error,
    UpdateWorkspacePayload
  >({
    mutationFn: ({
      workspaceId,
      data,
    }) =>
      workspaceApi.updateWorkspace(
        workspaceId,
        data,
      ),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey:
          workspaceQueryKeys.detail(
            variables.workspaceId,
          ),
      });

      queryClient.invalidateQueries({
        queryKey:
          workspaceQueryKeys.all,
      });
    },
  });
}