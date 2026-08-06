import { Navigate, Outlet } from "react-router-dom";

import { useAuthStore } from "@/store";

import { ROUTES } from "./route.constants";

export default function ProtectedRoute(): React.JSX.Element {
  const isAuthenticated = useAuthStore(
    (state) => state.isAuthenticated
  );
  const isLoading = useAuthStore(
    (state) => state.isLoading
  );
  if (isLoading) {
    return <div>Loading...</div>;
  }
  if (!isAuthenticated) {
    return <Navigate to={ROUTES.LOGIN} replace />;
  }


  return <Outlet />;
}