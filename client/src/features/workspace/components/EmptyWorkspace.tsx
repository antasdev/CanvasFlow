import { CreateWorkspaceButton } from "./CreateWorkspaceButton";


type EmptyWorkspaceProps = {
  onCreateWorkspace: () => void;
};


export function EmptyWorkspace({
  onCreateWorkspace,
}: EmptyWorkspaceProps) {
  return (
    <section
      className="
        flex
        flex-col
        items-center
        justify-center
        rounded-lg
        border
        p-10
        text-center
      "
    >
      <h2
        className="
          text-xl
          font-semibold
        "
      >
        No workspaces yet
      </h2>


      <p
        className="
          mt-2
          text-sm
          text-gray-500
        "
      >
        Create your first workspace and start collaborating.
      </p>


      <div className="mt-6">
        <CreateWorkspaceButton
          onClick={onCreateWorkspace}
        />
      </div>
    </section>
  );
}