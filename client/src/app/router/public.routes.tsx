import type { RouteObject } from "react-router-dom";
import { Navigate } from "react-router-dom";

import RootLayout from "@/app/layouts/RootLayout";
import LoginPage from "@/features/auth/pages/LoginPage";
import RegisterPage from "@/features/auth/pages/RegisterPage";
import { useAuthStore } from "@/store";

import PublicRoute from "./PublicRoute";
import { ROUTES } from "./route.constants";

function HomeRedirect(): React.JSX.Element {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isLoading = useAuthStore((state) => state.isLoading);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <Navigate
      to={isAuthenticated ? ROUTES.WORKSPACES : ROUTES.LOGIN}
      replace
    />
  );
}

export const publicRoutes: RouteObject[] = [
  {
    element: <RootLayout />,
    children: [
      {
        path: ROUTES.HOME,
        element: <HomeRedirect />,
      },
      {
        element: <PublicRoute />,
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
    ],
  },
];