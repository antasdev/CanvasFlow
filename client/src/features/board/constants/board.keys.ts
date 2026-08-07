export const boardKeys = {
  all: ["boards"] as const,

  workspace: (workspaceId: string) =>
    [...boardKeys.all, "workspace", workspaceId] as const,

  detail: (boardId: string) =>
    [...boardKeys.all, "detail", boardId] as const,
};