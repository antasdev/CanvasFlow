import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";

import { Button, FormField, Input } from "@/components/ui";

import { useCreateBoard } from "../hooks";
import {
  createBoardSchema,
  type CreateBoardFormValues,
} from "../schemas/board.schema";

type CreateBoardDialogProps = {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
};

export const CreateBoardDialog = ({
  workspaceId,
  isOpen,
  onClose,
}: CreateBoardDialogProps): React.JSX.Element | null => {
  const createBoard = useCreateBoard();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateBoardFormValues>({
    resolver: zodResolver(createBoardSchema),
    defaultValues: {
      name: "",
      description: "",
    },
  });

  const handleFormSubmit = (
    values: CreateBoardFormValues,
  ): void => {
    createBoard.mutate(
      {
        workspaceId,
        ...values,
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
      },
    );
  };

  const handleClose = (): void => {
    if (createBoard.isPending) {
      return;
    }

    reset();
    onClose();
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Create Board
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Create a new board for this workspace.
          </p>
        </div>

        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="space-y-4"
        >
          <FormField
            label="Board name"
            htmlFor="board-name"
            error={errors.name?.message}
          >
            <Input
              id="board-name"
              placeholder="e.g. Product Planning"
              {...register("name")}
            />
          </FormField>

          <FormField
            label="Description"
            htmlFor="board-description"
            error={errors.description?.message}
          >
            <textarea
              id="board-description"
              placeholder="What is this board for?"
              rows={4}
              {...register("description")}
              className="w-full resize-none rounded-md border border-gray-300 bg-white px-3 py-2 text-sm placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-900/10 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </FormField>

          <div className="flex justify-end gap-3 pt-2">
            <Button
              type="button"
              onClick={handleClose}
              disabled={createBoard.isPending}
              className="w-auto bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={createBoard.isPending}
              className="w-auto"
            >
              {createBoard.isPending
                ? "Creating..."
                : "Create Board"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};