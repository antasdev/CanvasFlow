import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";

import { Button, FormField, Input } from "@/components/ui";

import { useUpdateBoard } from "../hooks";
import {
  updateBoardSchema,
  type UpdateBoardFormValues,
} from "../schemas/board.schema";
import type { Board } from "../types";

type EditBoardDialogProps = {
  board: Board | null;
  onClose: () => void;
};

export const EditBoardDialog = ({
  board,
  onClose,
}: EditBoardDialogProps): React.JSX.Element | null => {
  const updateBoard = useUpdateBoard();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<UpdateBoardFormValues>({
    resolver: zodResolver(updateBoardSchema),
  });

  useEffect(() => {
    if (!board) {
      reset();
      return;
    }

    reset({
      name: board.name,
      description: board.description ?? "",
    });
  }, [board, reset]);

  const handleFormSubmit = (
    values: UpdateBoardFormValues,
  ): void => {
    if (!board) {
      return;
    }

    updateBoard.mutate(
      {
        boardId: board.id,
        payload: values,
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
    if (updateBoard.isPending) {
      return;
    }

    reset();
    onClose();
  };

  if (!board) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-gray-900">
            Edit Board
          </h2>

          <p className="mt-1 text-sm text-gray-500">
            Update your board details.
          </p>
        </div>

        <form
          onSubmit={handleSubmit(handleFormSubmit)}
          className="space-y-4"
        >
          <FormField
            label="Board name"
            htmlFor="edit-board-name"
            error={errors.name?.message}
          >
            <Input
              id="edit-board-name"
              placeholder="Board name"
              {...register("name")}
            />
          </FormField>

          <FormField
            label="Description"
            htmlFor="edit-board-description"
            error={errors.description?.message}
          >
            <textarea
              id="edit-board-description"
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
              disabled={updateBoard.isPending}
              className="w-auto bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50"
            >
              Cancel
            </Button>

            <Button
              type="submit"
              disabled={updateBoard.isPending}
              className="w-auto"
            >
              {updateBoard.isPending
                ? "Saving..."
                : "Save Changes"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
};