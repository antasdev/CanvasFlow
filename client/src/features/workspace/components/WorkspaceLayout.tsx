import type { ReactNode } from "react";

import WorkspaceSidebar from "./WorkspaceSidebar";

type WorkspaceLayoutProps = {
  children: ReactNode;
};

export default function WorkspaceLayout({
  children,
}: WorkspaceLayoutProps): React.JSX.Element {
  return (
    <div className="flex min-h-[calc(100vh-65px)]">
      <WorkspaceSidebar />

      <section className="flex-1 bg-slate-50">
        {children}
      </section>
    </div>
  );
}