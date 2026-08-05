import { CreateWorkspaceButton } from "./CreateWorkspaceButton";


type WorkspaceHeaderProps = {
  onCreateWorkspace: () => void;
};


export function WorkspaceHeader({
  onCreateWorkspace,
}: WorkspaceHeaderProps) {
  return (
    <header
      className="
        flex
        items-center
        justify-between
        mb-8
      "
    >
      <div>
        <h1
          className="
            text-2xl
            font-semibold
          "
        >
          Your Workspaces
        </h1>

        <p
          className="
            mt-1
            text-sm
            text-gray-500
          "
        >
          Manage your collaborative spaces
        </p>
      </div>


      <CreateWorkspaceButton
        onClick={onCreateWorkspace}
      />
    </header>
  );
}