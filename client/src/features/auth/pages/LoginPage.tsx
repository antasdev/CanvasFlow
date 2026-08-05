import AuthLayout from "@/app/layouts/AuthLayout";

import AuthCard from "../components/AuthCard";
import LoginForm from "../components/LoginForm";
export default function LoginPage(): React.JSX.Element {
  return (
    <AuthLayout>
      <AuthCard
        title="Welcome Back"
        subtitle="Sign in to continue to CanvasFlow"
      >
        <LoginForm />
      </AuthCard>
    </AuthLayout>
  );
}