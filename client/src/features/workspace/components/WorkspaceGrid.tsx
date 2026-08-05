import type { Workspace } from "../types";

import { WorkspaceCard } from "./WorkspaceCard";


type WorkspaceGridProps = {
  workspaces: Workspace[];
};


export function WorkspaceGrid({
  workspaces,
}: WorkspaceGridProps) {
  return (
    <section
      className="
        grid
        gap-6
        sm:grid-cols-2
        lg:grid-cols-3
      "
    >
      {workspaces.map((workspace) => (
        <WorkspaceCard
          key={workspace.id}
          workspace={workspace}
        />
      ))}
    </section>
  );
}