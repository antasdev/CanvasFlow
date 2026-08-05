import { Outlet } from "react-router-dom";

export default function DashboardLayout(): React.JSX.Element {
  return (
    <main className="min-h-screen bg-gray-50">
      <Outlet />
    </main>
  );
}