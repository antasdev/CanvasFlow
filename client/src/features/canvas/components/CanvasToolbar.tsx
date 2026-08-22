import { CANVAS_TOOLS } from "../constants";
import { useCanvasStore } from "../store";

export default function CanvasToolbar(): React.JSX.Element {
  const activeTool = useCanvasStore((state) => state.activeTool);
  const setActiveTool = useCanvasStore((state) => state.setActiveTool);

  return (
    <div className="absolute left-4 top-4 z-10 flex gap-2 rounded-lg bg-white p-2 shadow-md border border-gray-200">
      <button
        type="button"
        onClick={() => setActiveTool(CANVAS_TOOLS.SELECT)}
        className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
          activeTool === CANVAS_TOOLS.SELECT
            ? "bg-gray-900 text-white shadow-sm"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        Select
      </button>

      <button
        type="button"
        onClick={() => setActiveTool(CANVAS_TOOLS.RECTANGLE)}
        className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
          activeTool === CANVAS_TOOLS.RECTANGLE
            ? "bg-gray-900 text-white shadow-sm"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        Rectangle
      </button>

      <button
        type="button"
        onClick={() => setActiveTool(CANVAS_TOOLS.TEXT)}
        className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
          activeTool === CANVAS_TOOLS.TEXT
            ? "bg-gray-900 text-white shadow-sm"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        Text
      </button>

      <button
        type="button"
        onClick={() => setActiveTool(CANVAS_TOOLS.STICKY_NOTE)}
        className={`rounded px-3 py-2 text-sm font-medium transition-colors ${
          activeTool === CANVAS_TOOLS.STICKY_NOTE
            ? "bg-gray-900 text-white shadow-sm"
            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
        }`}
      >
        Sticky Note
      </button>
    </div>
  );
}