import { Link } from "react-router-dom";

import { ROUTES } from "@/app/router/route.constants";
import AuthLayout from "@/app/layouts/AuthLayout";
import AuthCard from "../components/AuthCard";
import RegisterForm from "../components/RegisterForm";

export default function RegisterPage(): React.JSX.Element {
  return (
    <AuthLayout>
      <AuthCard
        title="Create Account"
        subtitle="Create your CanvasFlow account to get started"
      >
        <RegisterForm />
        <div className="mt-6 text-center text-sm text-gray-600">
          Already have an account?{" "}
          <Link
            to={ROUTES.LOGIN}
            className="font-medium text-gray-900 hover:underline"
          >
            Sign in
          </Link>
        </div>
      </AuthCard>
    </AuthLayout>
  );
}