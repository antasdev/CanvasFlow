import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { useNavigate } from "react-router-dom";

import { ROUTES } from "@/app/router/route.constants";
import { Button, FormField, Input } from "@/components/ui";
import {
    loginSchema,
    type LoginFormValues,
} from "@/features/auth/schemas";

import { useLogin } from "../hooks/useLogin";


export default function LoginForm(): React.JSX.Element {
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<LoginFormValues>({
        resolver: zodResolver(loginSchema),
        defaultValues: {
            email: "",
            password: "",
        },
    });

    const { mutate, isPending } = useLogin();
    const navigate = useNavigate();

    const onSubmit = (data: LoginFormValues): void => {
        mutate(data, {
            onSuccess: () => {
                navigate(ROUTES.DASHBOARD);
            },
        });
    };
    return (
        <form
            className="space-y-6"
            onSubmit={handleSubmit(onSubmit)}
        >
            <FormField
                label="Email"
                htmlFor="email"
                error={errors.email?.message}
            >
                <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
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
                    placeholder="Enter your password"
                    {...register("password")}
                />
            </FormField>

            <Button
                type="submit"
                disabled={isPending}
            >
                {isPending ? "Signing In..." : "Sign In"}
            </Button>
        </form>
    );
}