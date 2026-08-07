import { useUpdateWorkspace } from "../hooks";
import type {
    Workspace,
} from "../types";

import WorkspaceForm from "./WorkspaceForm";




type EditWorkspaceModalProps = {
    workspace: Workspace;
    isOpen: boolean;
    onClose: () => void;
};


export default function EditWorkspaceModal({
    workspace,
    isOpen,
    onClose,
}: EditWorkspaceModalProps): React.JSX.Element | null {

    const updateWorkspace =
        useUpdateWorkspace();


    if (!isOpen) {
        return null;
    }


    const handleSubmit = (
        values: {
            name: string;
            description?: string;
        },
    ): void => {

        updateWorkspace.mutate(
            {
                workspaceId: workspace.id,
                data: values,
            },
            {
                onSuccess: () => {
                    onClose();
                },
            },
        );
    };


    return (
        <div
            className="
        fixed
        inset-0
        flex
        items-center
        justify-center
        bg-black/40
      "
        >

            <div
                className="
          w-full
          max-w-md
          rounded-lg
          bg-white
          p-6
        "
            >

                <h2
                    className="
            mb-4
            text-xl
            font-semibold
          "
                >
                    Edit Workspace
                </h2>


                <WorkspaceForm
                    initialValues={{
                        name: workspace.name,
                        description: workspace.description ?? "",
                    }}
                    onSubmit={handleSubmit}
                    onCancel={onClose}
                    submitText="Save Changes"
                    isSubmitting={updateWorkspace.isPending}
                />
            </div>

        </div>
    );
}