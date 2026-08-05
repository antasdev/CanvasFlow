import { useMutation, useQueryClient } from "@tanstack/react-query";

import { workspaceApi } from "../api";
import { workspaceQueryKeys } from "../constants";
import type {
  CreateWorkspaceRequest,
  CreateWorkspaceResponse,
} from "../types";


export function useCreateWorkspace() {
  const queryClient = useQueryClient();

  return useMutation<
    CreateWorkspaceResponse,
    Error,
    CreateWorkspaceRequest
  >({
    mutationFn: workspaceApi.createWorkspace,

    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.all,
      });
    },
  });
}