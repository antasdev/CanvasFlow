import { api } from "@/services/api";

import type {
  CreateWorkspaceRequest,
  CreateWorkspaceResponse,
  UpdateWorkspaceRequest,
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

  async getWorkspace(
    workspaceId: string,
  ): Promise<Workspace> {

    const response =
      await api.get<{
        success: boolean;
        data: Workspace;
      }>(
        `${WORKSPACE_ENDPOINT}/${workspaceId}`,
      );


    return response.data.data;
  },

  async createWorkspace(
    payload: CreateWorkspaceRequest,
  ): Promise<CreateWorkspaceResponse> {

    const response = await api.post<{
      success: boolean;
      data: CreateWorkspaceResponse;
    }>(
      WORKSPACE_ENDPOINT,
      payload,
    );

    return response.data.data;
  },


  async updateWorkspace(
    workspaceId: string,
    payload: UpdateWorkspaceRequest,
  ): Promise<Workspace> {

    const response =
      await api.patch<{
        success: boolean;
        data: Workspace;
      }>(
        `${WORKSPACE_ENDPOINT}/${workspaceId}`,
        payload,
      );

    return response.data.data;
  },


  async deleteWorkspace(
    workspaceId: string,
  ): Promise<void> {

    await api.delete(
      `${WORKSPACE_ENDPOINT}/${workspaceId}`,
    );
  },

  async getMembers(
    workspaceId: string
  ): Promise<import("../types").WorkspaceMember[]> {
    const response = await api.get<{
      success: boolean;
      data: import("../types").WorkspaceMember[];
    }>(`${WORKSPACE_ENDPOINT}/${workspaceId}/members`);

    return response.data.data;
  },

  async addMember(
    workspaceId: string,
    payload: import("../types").AddWorkspaceMemberRequest
  ): Promise<import("../types").WorkspaceMember> {
    const response = await api.post<{
      success: boolean;
      data: import("../types").WorkspaceMember;
    }>(`${WORKSPACE_ENDPOINT}/${workspaceId}/members`, payload);

    return response.data.data;
  },

  async updateMemberRole(
    workspaceId: string,
    memberUserId: string,
    payload: import("../types").UpdateWorkspaceMemberRoleRequest
  ): Promise<import("../types").WorkspaceMember> {
    const response = await api.patch<{
      success: boolean;
      data: import("../types").WorkspaceMember;
    }>(`${WORKSPACE_ENDPOINT}/${workspaceId}/members/${memberUserId}`, payload);

    return response.data.data;
  },

  async removeMember(
    workspaceId: string,
    memberUserId: string
  ): Promise<void> {
    await api.delete(
      `${WORKSPACE_ENDPOINT}/${workspaceId}/members/${memberUserId}`
    );
  },
};