import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { ROUTES } from "@/app/router/route.constants";
import { Button, FormField, Input } from "@/components/ui";
import {
  registerSchema,
  type RegisterFormValues,
} from "@/features/auth/schemas";

import { useRegister } from "../hooks/useRegister";

export default function RegisterForm(): React.JSX.Element {
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      password: "",
      confirmPassword: "",
    },
  });

  const { mutate, isPending } = useRegister();
  const navigate = useNavigate();

  const onSubmit = (data: RegisterFormValues): void => {
    setServerError(null);
    mutate(data, {
      onSuccess: () => {
        navigate(ROUTES.WORKSPACES);
      },
      onError: (error) => {
        if (axios.isAxiosError(error)) {
          const message =
            error.response?.data?.message ||
            error.response?.data?.error ||
            "Registration failed. Please try again.";
          setServerError(message);
        } else {
          setServerError("An unexpected error occurred. Please try again.");
        }
      },
    });
  };

  return (
    <form
      className="space-y-4"
      onSubmit={handleSubmit(onSubmit)}
      noValidate
    >
      {serverError && (
        <div
          role="alert"
          className="rounded-md bg-red-50 p-3 text-sm text-red-700 border border-red-200"
        >
          {serverError}
        </div>
      )}

      <FormField
        label="Full Name"
        htmlFor="fullName"
        error={errors.fullName?.message}
      >
        <Input
          id="fullName"
          type="text"
          placeholder="Enter your full name"
          autoComplete="name"
          {...register("fullName")}
        />
      </FormField>

      <FormField
        label="Email"
        htmlFor="email"
        error={errors.email?.message}
      >
        <Input
          id="email"
          type="email"
          placeholder="Enter your email"
          autoComplete="email"
          {...register("email")}
        />
      </FormField>

      <FormField
        label="Password"
        htmlFor="password"
        error={errors.password?.message}
      >
        <Input
          id="password"
          type="password"
          placeholder="Create a password"
          autoComplete="new-password"
          {...register("password")}
        />
      </FormField>

      <FormField
        label="Confirm Password"
        htmlFor="confirmPassword"
        error={errors.confirmPassword?.message}
      >
        <Input
          id="confirmPassword"
          type="password"
          placeholder="Confirm your password"
          autoComplete="new-password"
          {...register("confirmPassword")}
        />
      </FormField>

      <Button
        type="submit"
        disabled={isPending}
        className="w-full mt-2"
      >
        {isPending ? "Creating Account..." : "Create Account"}
      </Button>
    </form>
  );
}
