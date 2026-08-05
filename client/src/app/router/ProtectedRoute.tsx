import { Navigate, Outlet } from "react-router-dom";

import { useAuthStore } from "@/store";

import { ROUTES } from "./route.constants";

export default function ProtectedRoute(): React.JSX.Element {
  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );

  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }

  return <Outlet />;
}