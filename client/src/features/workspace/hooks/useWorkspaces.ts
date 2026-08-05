import { useQuery } from "@tanstack/react-query";

import { workspaceApi } from "../api";
import { workspaceQueryKeys } from "../constants";
import type { Workspace } from "../types";




export function useWorkspaces() {
  const query = useQuery<Workspace[]>({
  queryKey: workspaceQueryKeys.all,
  queryFn: workspaceApi.getWorkspaces,
});


  return {
    workspaces: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    refetch: query.refetch,
  };
}