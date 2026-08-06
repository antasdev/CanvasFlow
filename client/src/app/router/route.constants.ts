export const ROUTES = {
  HOME: "/",

  LOGIN: "/login",
  REGISTER: "/register",

  DASHBOARD: "/dashboard",

  WORKSPACES: "/workspaces",

  WORKSPACE_DETAILS:
    "/workspaces/:workspaceId",

  WORKSPACE_BOARDS:
    "/workspaces/:workspaceId/boards",

  WORKSPACE_MEMBERS:
    "/workspaces/:workspaceId/members",

  WORKSPACE_ACTIVITY:
    "/workspaces/:workspaceId/activity",

  WORKSPACE_SETTINGS:
    "/workspaces/:workspaceId/settings",

  BOARDS: "/boards",

  BOARD_DETAILS: "/boards/:boardId",

  NOT_FOUND: "*",
} as const;