import type { RouteObject } from "react-router-dom";

import { WorkspaceDashboardPage } from "@/features/workspace";

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
            path: ROUTES.DASHBOARD,
            element: <WorkspaceDashboardPage />,
          },
        ],
      },
    ],
  },
];