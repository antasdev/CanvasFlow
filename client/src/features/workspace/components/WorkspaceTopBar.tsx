import { useNavigate, useParams } from "react-router-dom";

import { useWorkspacePermissions } from "../hooks";
import type { WorkspaceRole } from "../types";

type WorkspaceTopBarProps = {
  name: string;
  description?: string;
  role: WorkspaceRole | string;
};

export default function WorkspaceTopBar({
  name,
  description,
  role,
}: WorkspaceTopBarProps): React.JSX.Element {
  const { workspaceId = "" } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const permissions = useWorkspacePermissions(role as WorkspaceRole);

  return (
    <header
      className="
        flex
        items-center
        justify-between
        border-b
        bg-white
        px-8
        py-6
      "
    >
      <div>
        <h1
          className="
            text-2xl
            font-semibold
          "
        >
          {name}
        </h1>

        {description && (
          <p
            className="
              mt-2
              text-sm
              text-slate-500
            "
          >
            {description}
          </p>
        )}
      </div>

      <div
        className="
          flex
          items-center
          gap-3
        "
      >
        <span
          className={`
            rounded-full
            px-3
            py-1
            text-sm
            font-medium
            ${
              role === "OWNER"
                ? "bg-amber-100 text-amber-800"
                : role === "ADMIN"
                ? "bg-purple-100 text-purple-800"
                : role === "EDITOR"
                ? "bg-blue-100 text-blue-800"
                : "bg-slate-100 text-slate-700"
            }
          `}
        >
          {role}
        </span>

        {permissions.canManageMembers && (
          <button
            type="button"
            onClick={() => navigate(`/workspaces/${workspaceId}/members`)}
            className="
              rounded-md
              border
              px-4
              py-2
              text-sm
              hover:bg-slate-50
            "
          >
            Invite
          </button>
        )}

        {permissions.canEditWorkspace && (
          <button
            type="button"
            onClick={() => navigate(`/workspaces/${workspaceId}/settings`)}
            className="
              rounded-md
              border
              px-4
              py-2
              text-sm
              hover:bg-slate-50
            "
          >
            Settings
          </button>
        )}
      </div>
    </header>
  );
}