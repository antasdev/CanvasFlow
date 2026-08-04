export const ROUTES = {
  HOME: "/",
  LOGIN: "/login",
  REGISTER: "/register",

  DASHBOARD: "/dashboard",

  WORKSPACES: "/workspaces",
  WORKSPACE_DETAILS: "/workspaces/:workspaceId",

  BOARDS: "/boards",
  BOARD_DETAILS: "/boards/:boardId",

  NOT_FOUND: "*",
} as const;