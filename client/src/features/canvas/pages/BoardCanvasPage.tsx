import { useParams } from "react-router-dom";

import CanvasEditor from "../components/CanvasEditor";
import CanvasToolbar from "../components/CanvasToolbar";
import { useBoardCanvases } from "../hooks";

export default function BoardCanvasPage(): React.JSX.Element {
  const { boardId } = useParams<{
    boardId: string;
  }>();

  const {
    data: canvases,
    isLoading,
    isError,
    error,
  } = useBoardCanvases(boardId);

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
    <main className="h-screen w-screen overflow-hidden bg-slate-700">
      <CanvasEditor canvasId={activeCanvas.id} />
      <CanvasToolbar />
    </main>
  );
}