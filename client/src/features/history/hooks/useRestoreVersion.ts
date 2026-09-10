import { useMutation, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";

import { useCanvasStore } from "@/features/canvas/store/canvas.store";
import { useCollaborationStore } from "@/features/canvas/store/collaboration.store";

import { historyApi } from "../api";
import type { RestoreVersionResult } from "../types";
import { HISTORY_QUERY_KEYS } from "./useVersionHistory";

export interface RestoreVersionVariables {
  versionId: string;
  description?: string;
}

export interface UseRestoreVersionOptions {
  boardId: string;
  onSuccess?: (result: RestoreVersionResult) => void;
  onError?: (error: Error) => void;
}

export interface UseRestoreVersionResult {
  restore: (variables: RestoreVersionVariables) => Promise<RestoreVersionResult>;
  isRestoring: boolean;
  isSuccess: boolean;
  isError: boolean;
  error: Error | null;
  reset: () => void;
}

function isConflictError(error: Error): boolean {
  if (axios.isAxiosError(error)) {
    return error.response?.status === 409;
  }
  return false;
}

function isForbiddenError(error: Error): boolean {
  if (axios.isAxiosError(error)) {
    return error.response?.status === 403;
  }
  return false;
}

function isNotFoundError(error: Error): boolean {
  if (axios.isAxiosError(error)) {
    return error.response?.status === 404;
  }
  return false;
}

function getErrorMessage(error: Error): string {
  if (axios.isAxiosError(error) && error.response?.data) {
    const data = error.response.data as { message?: string; error?: string };
    return data.message || data.error || error.message;
  }
  return error.message;
}

export function useRestoreVersion({
  boardId,
  onSuccess,
  onError,
}: UseRestoreVersionOptions): UseRestoreVersionResult {
  const queryClient = useQueryClient();

  const mutation = useMutation<RestoreVersionResult, Error, RestoreVersionVariables>({
    mutationFn: async ({ versionId, description }: RestoreVersionVariables): Promise<RestoreVersionResult> => {
      const expectedCollaborationRevision = useCollaborationStore
        .getState()
        .getRevision(boardId);
      const mutationId = crypto.randomUUID();

      return historyApi.restoreVersion(boardId, versionId, {
        expectedCollaborationRevision,
        mutationId,
        description,
      });
    },
    onSuccess: (result: RestoreVersionResult): void => {
      // Invalidate board versions query so timeline picks up the new restored version
      queryClient.invalidateQueries({
        queryKey: HISTORY_QUERY_KEYS.boardVersions(boardId),
      });

      // Clear any transient selection on active canvas to prevent stale transformer handles
      useCanvasStore.getState().clearSelection();

      toast.success(`Restored Version ${result.restoredVersionNumber}`);

      onSuccess?.(result);
    },
    onError: (error: Error): void => {
      if (isConflictError(error)) {
        toast.error(
          "This board changed while you were viewing this version. Your restore was not applied. Refresh the board and try again."
        );
      } else if (isForbiddenError(error)) {
        toast.error("You do not have permission to restore this board.");
      } else if (isNotFoundError(error)) {
        toast.error("Version not found or does not belong to this board.");
      } else {
        toast.error(getErrorMessage(error) || "Failed to restore version.");
      }

      onError?.(error);
    },
  });

  return {
    restore: (vars: RestoreVersionVariables): Promise<RestoreVersionResult> => mutation.mutateAsync(vars),
    isRestoring: mutation.isPending,
    isSuccess: mutation.isSuccess,
    isError: mutation.isError,
    error: mutation.error,
    reset: (): void => mutation.reset(),
  };
}
