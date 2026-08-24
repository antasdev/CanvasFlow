import { Link } from "react-router-dom";

import { ROUTES } from "@/app/router/route.constants";
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
        <div className="mt-6 text-center text-sm text-gray-600">
          Don't have an account?{" "}
          <Link
            to={ROUTES.REGISTER}
            className="font-medium text-gray-900 hover:underline"
          >
            Sign up
          </Link>
        </div>
      </AuthCard>
    </AuthLayout>
  );
}