import type { Workspace } from "../types";


type WorkspaceCardProps = {
  workspace: Workspace;
};


export function WorkspaceCard({
  workspace,
}: WorkspaceCardProps) {
  return (
    <article
      className="
        rounded-lg
        border
        p-5
        hover:shadow-md
        transition
        cursor-pointer
      "
    >
      <h3 className="text-lg font-semibold">
        {workspace.name}
      </h3>


      {workspace.description && (
        <p className="mt-2 text-sm text-gray-600">
          {workspace.description}
        </p>
      )}


      <div className="mt-4 flex justify-between text-sm">
        <span>
          {workspace.visibility}
        </span>


        <span>
          {workspace.role}
        </span>
      </div>
    </article>
  );
}