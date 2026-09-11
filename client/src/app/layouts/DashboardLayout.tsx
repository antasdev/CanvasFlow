import { Outlet } from "react-router-dom";
import { SearchButton } from "@/features/search";
import { useWorkspaces } from "@/features/workspace";

export default function DashboardLayout(): React.JSX.Element {
  const { workspaces } = useWorkspaces();
  const defaultWorkspace = workspaces?.[0];

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b bg-white px-6 py-4 flex items-center justify-between">
        <span className="font-semibold text-slate-800">CanvasFlow Dashboard</span>
        {defaultWorkspace && (
          <SearchButton
            scope="workspace"
            workspaceId={defaultWorkspace.id}
            workspaceName={defaultWorkspace.name}
          />
        )}
      </header>

      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}