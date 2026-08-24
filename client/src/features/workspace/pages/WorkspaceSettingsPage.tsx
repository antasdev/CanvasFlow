import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  EditWorkspaceModal,
  DangerZone,
  DeleteWorkspaceModal,
} from "../components";
import {
  useDeleteWorkspace,
  useWorkspace,
  useWorkspacePermissions,
} from "../hooks";

export default function WorkspaceSettingsPage(): React.JSX.Element {
  const { workspaceId = "" } = useParams<{
    workspaceId: string;
  }>();

  const { data: workspace } = useWorkspace(workspaceId);
  const permissions = useWorkspacePermissions(workspace?.role);

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);

  const navigate = useNavigate();
  const deleteWorkspace = useDeleteWorkspace();

  const handleDelete = (): void => {
    if (!workspaceId) {
      return;
    }

    deleteWorkspace.mutate(workspaceId, {
      onSuccess: () => {
        navigate("/workspaces");
      },
    });
  };

  if (!workspace) {
    return (
      <div className="p-6">
        <p className="text-slate-500">Loading workspace...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl p-6">
      <div className="rounded-lg bg-white p-6 shadow-sm border border-slate-200">
        <h2 className="text-xl font-semibold text-gray-900">
          Workspace Settings
        </h2>

        <div className="mt-4 space-y-2 text-sm text-gray-700">
          <p>
            <strong>Name:</strong> {workspace.name}
          </p>

          <p>
            <strong>Description:</strong>{" "}
            {workspace.description || "No description provided."}
          </p>

          <p>
            <strong>Your Role:</strong>{" "}
            <span className="font-semibold text-gray-900">{workspace.role}</span>
          </p>
        </div>

        {permissions.canEditWorkspace ? (
          <button
            type="button"
            onClick={() => setIsEditOpen(true)}
            className="
              mt-6
              rounded-lg
              bg-black
              px-4
              py-2
              text-sm
              font-medium
              text-white
              hover:bg-gray-800
            "
          >
            Edit Workspace
          </button>
        ) : (
          <p className="mt-4 text-xs text-slate-500">
            You have view-only access to this workspace. Contact an administrator to update settings.
          </p>
        )}
      </div>

      {permissions.canEditWorkspace && (
        <EditWorkspaceModal
          workspace={workspace}
          isOpen={isEditOpen}
          onClose={() => setIsEditOpen(false)}
        />
      )}

      {permissions.canDeleteWorkspace && (
        <>
          <DangerZone onDelete={() => setIsDeleteOpen(true)} />

          <DeleteWorkspaceModal
            isOpen={isDeleteOpen}
            onClose={() => setIsDeleteOpen(false)}
            onConfirm={handleDelete}
            isDeleting={deleteWorkspace.isPending}
          />
        </>
      )}
    </div>
  );
}