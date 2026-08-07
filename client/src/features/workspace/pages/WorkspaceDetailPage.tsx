import { Outlet, useParams } from "react-router-dom";

import {
  WorkspaceLayout,
  WorkspaceTopBar,
} from "../components";
import { useWorkspace } from "../hooks";

export default function WorkspaceDetailPage(): React.JSX.Element {
  const { workspaceId } = useParams<{
    workspaceId: string;
  }>();

  const {
    data: workspace,
    isLoading,
    isError,
  } = useWorkspace(workspaceId ?? "");

  if (isLoading) {
    return (
      <main className="p-6">
        <p>Loading workspace...</p>
      </main>
    );
  }

  if (isError || !workspace) {
    return (
      <main className="p-6">
        <p>Workspace not found.</p>
      </main>
    );
  }

  return (
    <WorkspaceLayout>
      <WorkspaceTopBar
        name={workspace.name}
        description={workspace.description}
        role={workspace.role}
      />

      <Outlet />
    </WorkspaceLayout>
  );
}