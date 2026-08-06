import { Link } from "react-router-dom";
import { NavLink, useParams } from "react-router-dom";
import { ROUTES } from "@/app/router/route.constants";

export default function WorkspaceSidebar(): React.JSX.Element {
  const { workspaceId } = useParams<{
    workspaceId: string;
  }>();
  return (
    <aside
      className="
        flex
        w-64
        flex-col
        border-r
        bg-white
      "
    >
      <div className="border-b p-6">
        <h2 className="text-xl font-semibold">
          CanvasFlow
        </h2>
      </div>

      <nav className="flex-1 space-y-2 p-4">
        <NavLink
          to={`/workspaces/${workspaceId}/boards`}
          className={({ isActive }) =>
            `block rounded-md px-4 py-2 transition-colors ${isActive
              ? "bg-slate-200 font-medium"
              : "hover:bg-slate-100"
            }`
          }
        >
          📋 Boards
        </NavLink>

        <NavLink
          to={`/workspaces/${workspaceId}/members`}
          className={({ isActive }) =>
            `block rounded-md px-4 py-2 transition-colors ${isActive
              ? "bg-slate-200 font-medium"
              : "hover:bg-slate-100"
            }`
          }
        >
          👥 Members
        </NavLink>

        <NavLink
          to={`/workspaces/${workspaceId}/activity`}
          className={({ isActive }) =>
            `block rounded-md px-4 py-2 transition-colors ${isActive
              ? "bg-slate-200 font-medium"
              : "hover:bg-slate-100"
            }`
          }
        >
          📜 Activity
        </NavLink>

        <NavLink
          to={`/workspaces/${workspaceId}/settings`}
          className={({ isActive }) =>
            `block rounded-md px-4 py-2 transition-colors ${isActive
              ? "bg-slate-200 font-medium"
              : "hover:bg-slate-100"
            }`
          }
        >
          ⚙ Settings
        </NavLink>
      </nav>

      <div className="border-t p-4">
        <Link
          to={ROUTES.WORKSPACES}
          className="
            block
            rounded-md
            px-4
            py-2
            text-sm
            text-slate-600
            transition-colors
            hover:bg-slate-100
          "
        >
          ← Back to Workspaces
        </Link>
      </div>
    </aside>
  );
}