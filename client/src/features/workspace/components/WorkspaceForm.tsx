import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { useCreateWorkspace } from "../hooks";
import {
    createWorkspaceSchema,
    type CreateWorkspaceFormData,
} from "../schemas";


type WorkspaceFormProps = {
    onSuccess?: () => void;
    onCancel?: () => void;
};

export default function WorkspaceForm({
    onSuccess,
    onCancel,
}: WorkspaceFormProps): React.JSX.Element {
    const {
        register,
        handleSubmit,
        formState: { errors },
    } = useForm<CreateWorkspaceFormData>({
        resolver: zodResolver(createWorkspaceSchema),

        defaultValues: {
            name: "",
            description: "",
        },
    });
    const { mutate, isPending } = useCreateWorkspace();

    const onSubmit = (data: CreateWorkspaceFormData): void => {
        mutate(data, {
            onSuccess: () => {
                onSuccess?.();
            },
        });
    };
    return (
        <form
            onSubmit={handleSubmit(onSubmit)}
            className="space-y-6"
        >
            <div>
                <label className="mb-2 block text-sm font-medium">
                    Workspace Name
                </label>

                <input
                    {...register("name")}
                    type="text"
                    placeholder="Enter workspace name"
                    className="w-full rounded-lg border px-4 py-2"
                />

                {errors.name && (
                    <p className="mt-1 text-sm text-red-500">
                        {errors.name.message}
                    </p>
                )}
            </div>

            <div>
                <label className="mb-2 block text-sm font-medium">
                    Description
                </label>

                <textarea
                    {...register("description")}
                    rows={4}
                    placeholder="Optional description"
                    className="w-full rounded-lg border px-4 py-2"
                />

                {errors.description && (
                    <p className="mt-1 text-sm text-red-500">
                        {errors.description.message}
                    </p>
                )}
            </div>

            <div className="flex justify-end gap-3">
                <button
                    type="button"
                    onClick={onCancel}
                    className="rounded-lg border px-4 py-2"
                >
                    Cancel
                </button>

                <button
                    type="submit"
                    disabled={isPending}
                    className="rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
                >
                    {isPending ? "Creating..." : "Create Workspace"}
                </button>
            </div>
        </form>
    );
};