import { useLogout } from "@/features/auth/hooks/useLogout";

export default function DashboardPage(): React.JSX.Element {
  const logout = useLogout();

  return (
    <div className="p-8">
      <h1>Dashboard</h1>

      <button
        onClick={() => logout.mutate()}
      >
        Logout
      </button>
    </div>
  );
}