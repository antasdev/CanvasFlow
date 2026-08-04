import type { ReactNode } from "react";
import { BrowserRouter } from "react-router-dom";
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
      <BrowserRouter>
        {children}
        <Toaster richColors position="top-right" />
      </BrowserRouter>
    </QueryProvider>
  );
}