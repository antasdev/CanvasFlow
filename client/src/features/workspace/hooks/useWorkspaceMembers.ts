import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { workspaceApi } from "../api";
import { workspaceQueryKeys } from "../constants";
import type {
  AddWorkspaceMemberRequest,
  UpdateWorkspaceMemberRoleRequest,
  WorkspaceMember,
} from "../types";

export function useWorkspaceMembers(workspaceId: string) {
  return useQuery<WorkspaceMember[]>({
    queryKey: workspaceQueryKeys.members(workspaceId),
    queryFn: () => workspaceApi.getMembers(workspaceId),
    enabled: Boolean(workspaceId),
  });
}

export function useAddWorkspaceMember(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (payload: AddWorkspaceMemberRequest) =>
      workspaceApi.addMember(workspaceId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.members(workspaceId),
      });
    },
  });
}

export function useUpdateWorkspaceMemberRole(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      memberUserId,
      payload,
    }: {
      memberUserId: string;
      payload: UpdateWorkspaceMemberRoleRequest;
    }) => workspaceApi.updateMemberRole(workspaceId, memberUserId, payload),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.members(workspaceId),
      });
    },
  });
}

export function useRemoveWorkspaceMember(workspaceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (memberUserId: string) =>
      workspaceApi.removeMember(workspaceId, memberUserId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.members(workspaceId),
      });
      void queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.lists(),
      });
    },
  });
}
