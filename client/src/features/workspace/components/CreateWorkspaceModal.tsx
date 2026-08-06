import { useCreateWorkspace } from "../hooks";
import WorkspaceForm from "./WorkspaceForm";

type CreateWorkspaceModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export default function CreateWorkspaceModal({
  isOpen,
  onClose,
}: CreateWorkspaceModalProps): React.JSX.Element {

  const {
    mutate,
    isPending,
  } = useCreateWorkspace();


  if (!isOpen) {
    return <></>;
  }


  const handleCreate = (
    values: {
      name: string;
      description?: string;
    },
  ): void => {

    mutate(values, {
      onSuccess: () => {
        onClose();
      },
    });
  };


  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">

      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">

        <div className="mb-6 flex items-center justify-between">

          <h2 className="text-xl font-semibold">
            Create Workspace
          </h2>

          <button
            type="button"
            onClick={onClose}
            className="text-2xl leading-none text-gray-500 hover:text-gray-700"
          >
            ×
          </button>

        </div>


        <WorkspaceForm
          onSubmit={handleCreate}
          onCancel={onClose}
          submitText="Create Workspace"
          isSubmitting={isPending}
        />

      </div>

    </div>
  );
}