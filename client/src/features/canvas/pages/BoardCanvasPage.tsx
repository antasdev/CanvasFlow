import { useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";

import CanvasEditor from "../components/CanvasEditor";
import CanvasToolbar from "../components/CanvasToolbar";
import PresenceAvatars from "../components/PresenceAvatars";
import BoardSyncStatus from "../components/BoardSyncStatus";
import { useBoardCanvases } from "../hooks";
import { useBoard } from "@/features/board/hooks";
import { useWorkspace, useWorkspacePermissions } from "@/features/workspace";
import { workspaceQueryKeys } from "@/features/workspace/constants";
import { socketClientService } from "@/services/socket";

export default function BoardCanvasPage(): React.JSX.Element {
  const { boardId } = useParams<{
    boardId: string;
  }>();

  const queryClient = useQueryClient();

  const {
    data: canvases,
    isLoading,
    isError,
    error,
  } = useBoardCanvases(boardId);

  const { data: board } = useBoard(boardId ?? "");
  const { data: workspace } = useWorkspace(board?.workspaceId ?? "");
  const { canEditCanvas } = useWorkspacePermissions(workspace?.role);

  // Dynamic real-time role change synchronization
  useEffect(() => {
    const unsubscribe = socketClientService.onMemberRoleUpdated((payload) => {
      queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.all });
      queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.detail(payload.workspaceId),
      });
      queryClient.invalidateQueries({
        queryKey: workspaceQueryKeys.members(payload.workspaceId),
      });
    });

    return () => {
      unsubscribe();
    };
  }, [queryClient]);

  if (isLoading) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-slate-800 text-white">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-500 border-t-transparent" />
          <p className="text-sm text-slate-300">Loading canvas...</p>
        </div>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-slate-800 text-white">
        <div className="rounded-lg bg-red-900/30 p-6 text-center text-red-200 border border-red-700">
          <p className="font-medium">Failed to load board canvases</p>
          <p className="mt-1 text-sm text-red-300">
            {error instanceof Error ? error.message : "An unexpected error occurred."}
          </p>
        </div>
      </main>
    );
  }

  if (!canvases || canvases.length === 0) {
    return (
      <main className="flex h-screen w-screen items-center justify-center bg-slate-800 text-white">
        <div className="rounded-lg bg-slate-900/60 p-8 text-center border border-slate-700 max-w-md">
          <h2 className="text-lg font-semibold text-slate-200">No Canvas Found</h2>
          <p className="mt-2 text-sm text-slate-400">
            This board does not contain any canvas pages yet.
          </p>
        </div>
      </main>
    );
  }

  const activeCanvas = canvases[0];

  return (
    <main className="h-screen w-screen overflow-hidden bg-slate-700 relative select-none">
      <CanvasEditor
        boardId={boardId}
        canvasId={activeCanvas.id}
        canEditCanvas={canEditCanvas}
      />

      {/* Top Left: Board Context Header */}
      <div className="absolute left-4 top-4 z-10 flex items-center gap-2.5 rounded-xl bg-white/95 backdrop-blur-md px-3 py-2 shadow-lg border border-gray-200/80">
        <Link
          to={board?.workspaceId ? `/workspaces/${board.workspaceId}` : "/dashboard"}
          className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 transition-colors focus:outline-none focus:ring-1 focus:ring-blue-500"
          title="Back to Workspace"
          aria-label="Back to Workspace"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="h-4 w-px bg-gray-200" />

        <div className="flex flex-col">
          <span className="text-xs font-semibold text-gray-900 leading-tight">
            {board?.name || "Untitled Board"}
          </span>
          <span className="text-[10px] text-gray-500 leading-tight">
            {workspace?.name || "Workspace"}
          </span>
        </div>

        <div className="h-4 w-px bg-gray-200" />

        <BoardSyncStatus />
      </div>

      {/* Center Top: Canvas Tool Dock */}
      <div className="absolute left-1/2 -translate-x-1/2 top-4 z-10">
        <CanvasToolbar canEditCanvas={canEditCanvas} />
      </div>

      {/* Top Right: Collaborators Presence */}
      <div className="absolute right-4 top-4 z-10 flex items-center gap-2">
        <PresenceAvatars />
      </div>
    </main>
  );
}