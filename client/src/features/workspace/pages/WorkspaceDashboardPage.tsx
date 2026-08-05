import { useState } from "react";

import {
  CreateWorkspaceModal,
  EmptyWorkspace,
  WorkspaceGrid,
  WorkspaceHeader,
} from "../components";
import { useWorkspaces } from "../hooks";


export function WorkspaceDashboardPage() {
  const {
  workspaces,
  isLoading,
  isError,
} = useWorkspaces();

const [isCreateWorkspaceOpen, setIsCreateWorkspaceOpen] =
  useState(false);

const handleCreateWorkspace = (): void => {
  setIsCreateWorkspaceOpen(true);
};

  if (isLoading) {
    return (
      <main className="p-6">
        <p className="text-sm text-gray-500">
          Loading workspaces...
        </p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="p-6">
        <p className="text-sm text-red-500">
          Unable to load workspaces.
        </p>
      </main>
    );
  }


  return (
  <main className="p-6">
    <WorkspaceHeader
      onCreateWorkspace={handleCreateWorkspace}
    />

    {workspaces.length === 0 ? (
      <EmptyWorkspace
        onCreateWorkspace={handleCreateWorkspace}
      />
    ) : (
      <WorkspaceGrid
        workspaces={workspaces}
      />
    )}

    <CreateWorkspaceModal
      isOpen={isCreateWorkspaceOpen}
      onClose={() =>
        setIsCreateWorkspaceOpen(false)
      }
    />
  </main>
);
}