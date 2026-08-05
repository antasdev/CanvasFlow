import type { RouteObject } from "react-router-dom";

import RootLayout from "@/app/layouts/RootLayout";
import LoginPage from "@/features/auth/pages/LoginPage";
import RegisterPage from "@/features/auth/pages/RegisterPage";

import { ROUTES } from "./route.constants";

export const publicRoutes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      {
        path: ROUTES.LOGIN,
        element: <LoginPage />,
      },
      {
        path: ROUTES.REGISTER,
        element: <RegisterPage />,
      },
    ],
  },
];