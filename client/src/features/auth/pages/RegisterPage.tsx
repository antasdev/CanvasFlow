import AuthLayout from "@/app/layouts/AuthLayout";

import AuthCard from "../components/AuthCard";

export default function RegisterPage(): React.JSX.Element {
  return (
    <AuthLayout>
      <AuthCard
        title="Create Account"
        subtitle="Create your CanvasFlow account"
      >
        Register Form
      </AuthCard>
    </AuthLayout>
  );
}