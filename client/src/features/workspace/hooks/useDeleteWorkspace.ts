import { useMutation, useQueryClient } from "@tanstack/react-query";

import { workspaceApi } from "../api";
import { workspaceQueryKeys } from "../constants";


export function useDeleteWorkspace() {

  const queryClient =
    useQueryClient();


  return useMutation({

    mutationFn:
      workspaceApi.deleteWorkspace,


    onSuccess: (_, workspaceId) => {

  queryClient.removeQueries({
    queryKey:
      workspaceQueryKeys.detail(workspaceId),
  });


  queryClient.invalidateQueries({
    queryKey:
      workspaceQueryKeys.all,
  });

},

  });
}