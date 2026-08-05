import type { ReactNode } from "react";
import { Toaster } from "sonner";

import QueryProvider from "./QueryProvider";

type AppProvidersProps = {
  children: ReactNode;
};

export default function AppProviders({
  children,
}: AppProvidersProps): React.JSX.Element {
  return (
    <QueryProvider>
      {children}
      <Toaster richColors position="top-right" />
    </QueryProvider>
  );
}