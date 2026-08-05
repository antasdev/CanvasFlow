export const workspaceQueryKeys = {
  all: ["workspaces"] as const,

  lists: () => [...workspaceQueryKeys.all, "list"] as const,

  detail: (workspaceId: string) =>
    [...workspaceQueryKeys.all, workspaceId] as const,

  members: (workspaceId: string) =>
    [...workspaceQueryKeys.detail(workspaceId), "members"] as const,

  boards: (workspaceId: string) =>
    [...workspaceQueryKeys.detail(workspaceId), "boards"] as const,
};