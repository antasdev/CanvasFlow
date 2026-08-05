import { api } from "@/services/api";

import type {
  CreateWorkspaceRequest,
  CreateWorkspaceResponse,
  Workspace,
} from "../types";

const WORKSPACE_ENDPOINT = "/workspaces";

export const workspaceApi = {
  async getWorkspaces(): Promise<Workspace[]> {
    const response = await api.get<{
      success: boolean;
      data: Workspace[];
    }>(WORKSPACE_ENDPOINT);

    return response.data.data;
  },

  async createWorkspace(
    payload: CreateWorkspaceRequest,
  ): Promise<CreateWorkspaceResponse> {
    const response = await api.post<{
      success: boolean;
      data: CreateWorkspaceResponse;
    }>(WORKSPACE_ENDPOINT, payload);

    return response.data.data;
  },
};