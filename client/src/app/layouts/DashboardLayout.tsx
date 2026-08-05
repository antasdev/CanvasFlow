import { Outlet } from "react-router-dom";

export default function DashboardLayout(): React.JSX.Element {
  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b bg-white p-4">
        CanvasFlow Dashboard
      </header>

      <main className="p-6">
        <Outlet />
      </main>
    </div>
  );
}