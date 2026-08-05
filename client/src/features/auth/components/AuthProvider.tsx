import type { ReactNode } from "react";

import { useAuthSession } from "../hooks/useAuthSession";

type AuthProviderProps = {
  children: ReactNode;
};

export default function AuthProvider({
  children,
}: AuthProviderProps): React.JSX.Element {
  useAuthSession();

  return <>{children}</>;
}