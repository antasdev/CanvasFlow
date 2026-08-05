import { createBrowserRouter } from "react-router-dom";

import { protectedRoutes } from "./protected.routes";
import { publicRoutes } from "./public.routes";

export const router = createBrowserRouter([
  ...publicRoutes,
  ...protectedRoutes,
]);