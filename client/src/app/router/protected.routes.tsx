import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";

import { WorkspaceBoardsPage } from "@/features/board";
import { BoardCanvasPage } from "@/features/canvas";
import { WorkspaceDashboardPage } from "@/features/workspace";
import {
  WorkspaceActivityPage,
  WorkspaceDetailPage,
  WorkspaceMembersPage,
  WorkspaceSettingsPage,
} from "@/features/workspace/pages";

import DashboardLayout from "../layouts/DashboardLayout";

import ProtectedRoute from "./ProtectedRoute";
import { ROUTES } from "./route.constants";

export const protectedRoutes: RouteObject[] = [
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <DashboardLayout />,
        children: [
          {
            path: ROUTES.WORKSPACES,
            element: <WorkspaceDashboardPage />,
          },
          {
            path: ROUTES.WORKSPACE_DETAILS,
            element: <WorkspaceDetailPage />,
            children: [
              {
                index: true,
                element: <Navigate to="boards" replace />,
              },
              {
                path: "boards",
                element: <WorkspaceBoardsPage />,
              },
              {
                path: "members",
                element: <WorkspaceMembersPage />,
              },
              {
                path: "activity",
                element: <WorkspaceActivityPage />,
              },
              {
                path: "settings",
                element: <WorkspaceSettingsPage />,
              },
            ],
          },
        ],
      },
      {
        path: ROUTES.BOARDS,
        element: <Navigate to={ROUTES.WORKSPACES} replace />,
      },
      {
        path: ROUTES.BOARD_DETAILS,
        element: <BoardCanvasPage />,
      },
      {
        path: "/board/:boardId",
        element: <BoardCanvasPage />,
      },
    ],
  },
];