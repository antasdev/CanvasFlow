import { useState } from "react";

import {
  EditWorkspaceModal,
  DangerZone,
  DeleteWorkspaceModal,
} from "../components";

import {
  useDeleteWorkspace,
  useWorkspace,
} from "../hooks";

import { useNavigate, useParams } from "react-router-dom";


export default function WorkspaceSettingsPage(): React.JSX.Element {

  const { workspaceId } = useParams<{
    workspaceId: string;
  }>();

  const {
    data: workspace,
  } = useWorkspace(
    workspaceId ?? "",
  );


  const [isEditOpen, setIsEditOpen] =
    useState(false);
  const [isDeleteOpen, setIsDeleteOpen] =
    useState(false);

  const navigate = useNavigate();


  const deleteWorkspace =
    useDeleteWorkspace();

  const handleDelete = (): void => {

    if (!workspaceId) {
      return;
    }


    deleteWorkspace.mutate(
      workspaceId,
      {
        onSuccess: () => {
          navigate("/workspaces");
        },
      },
    );
  };

  if (!workspace) {
    return (
      <p>
        Loading workspace...
      </p>
    );
  }


  return (
    <div className="space-y-6">

      <div className="rounded-lg bg-white p-6">

        <h2 className="text-xl font-semibold">
          Workspace Settings
        </h2>


        <div className="mt-4 space-y-2">

          <p>
            <strong>Name:</strong>{" "}
            {workspace.name}
          </p>


          <p>
            <strong>Description:</strong>{" "}
            {workspace.description}
          </p>

        </div>


        <button
          onClick={() =>
            setIsEditOpen(true)
          }
          className="
            mt-6
            rounded-lg
            bg-black
            px-4
            py-2
            text-white
          "
        >
          Edit Workspace
        </button>

      </div>


      <EditWorkspaceModal
        workspace={workspace}
        isOpen={isEditOpen}
        onClose={() =>
          setIsEditOpen(false)
        }
      />

      <DangerZone
        onDelete={() =>
          setIsDeleteOpen(true)
        }
      />


      <DeleteWorkspaceModal
        isOpen={isDeleteOpen}
        onClose={() =>
          setIsDeleteOpen(false)
        }
        onConfirm={handleDelete}
        isDeleting={
          deleteWorkspace.isPending
        }
      />

    </div>
  );
}